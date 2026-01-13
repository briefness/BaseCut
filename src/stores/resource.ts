/**
 * 资源管理 Store
 * 管理素材的上传、存储和 Blob URL
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Material, MaterialType, DBMaterial } from '@/types'
import { dbManager } from '@/db/IndexedDBManager'
import { ffmpegCore } from '@/engine/FFmpegCore'

export const useResourceStore = defineStore('resource', () => {
  // ==================== 状态 ====================
  const materials = ref<Material[]>([])
  const isLoading = ref(false)
  const uploadProgress = ref(0)

  // ==================== 计算属性 ====================
  const videoMaterials = computed(() => 
    materials.value.filter(m => m.type === 'video')
  )

  const audioMaterials = computed(() => 
    materials.value.filter(m => m.type === 'audio')
  )

  const imageMaterials = computed(() => 
    materials.value.filter(m => m.type === 'image')
  )

  const stickerMaterials = computed(() => 
    materials.value.filter(m => m.type === 'sticker')
  )

  // ==================== 方法 ====================

  /**
   * 初始化，从 IndexedDB 加载素材
   */
  async function init(): Promise<void> {
    isLoading.value = true

    try {
      const dbMaterials = await dbManager.getAllMaterials()

      for (const dbMaterial of dbMaterials) {
        const blob = new Blob([dbMaterial.fileData], { type: dbMaterial.mimeType })
        const file = new File([blob], dbMaterial.name, { type: dbMaterial.mimeType })
        const blobUrl = URL.createObjectURL(blob)

        let thumbnail: string | undefined
        if (dbMaterial.thumbnailData) {
          const thumbBlob = new Blob([dbMaterial.thumbnailData], { type: 'image/jpeg' })
          thumbnail = URL.createObjectURL(thumbBlob)
        }

        materials.value.push({
          id: dbMaterial.id,
          name: dbMaterial.name,
          type: dbMaterial.type,
          file,
          blobUrl,
          duration: dbMaterial.duration,
          width: dbMaterial.width,
          height: dbMaterial.height,
          thumbnail,
          createdAt: dbMaterial.createdAt
        })
      }

      console.log(`[ResourceStore] 加载了 ${materials.value.length} 个素材`)
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 添加素材（事务模式）
   * 
   * 设计原则：先持久化到 IndexedDB，成功后再加入内存状态
   * 失败时自动回滚已创建的资源（Blob URL），确保状态一致性
   */
  async function addMaterial(file: File, forceType?: MaterialType): Promise<Material> {
    uploadProgress.value = 0
    
    const id = crypto.randomUUID()
    const type = forceType || getFileType(file)
    const blobUrl = URL.createObjectURL(file)
    let thumbnail: string | undefined

    // 基础素材信息
    const material: Material = {
      id,
      name: file.name,
      type,
      file,
      blobUrl,
      createdAt: Date.now()
    }

    try {
      // 获取媒体信息
      if (type === 'video' || type === 'audio') {
        try {
          const info = await getMediaInfo(blobUrl, type)
          material.duration = info.duration
          material.width = info.width
          material.height = info.height
        } catch (error) {
          console.warn('获取媒体信息失败:', error)
        }
      } else if (type === 'image' || type === 'sticker') {
        try {
          const info = await getImageInfo(blobUrl)
          material.width = info.width
          material.height = info.height
        } catch (error) {
          console.warn('获取图片信息失败:', error)
        }
      }

      // 生成视频缩略图
      if (type === 'video') {
        try {
          const thumbBlob = await ffmpegCore.generateThumbnail(file, 0, 160)
          thumbnail = URL.createObjectURL(thumbBlob)
          material.thumbnail = thumbnail
        } catch (error) {
          console.warn('生成缩略图失败:', error)
        }
      }

      // 准备 IndexedDB 数据
      const fileBuffer = await file.arrayBuffer()
      const dbMaterial: DBMaterial = {
        id,
        name: file.name,
        type,
        fileData: fileBuffer,
        mimeType: file.type,
        duration: material.duration,
        width: material.width,
        height: material.height,
        createdAt: material.createdAt
      }

      if (material.thumbnail) {
        const thumbResponse = await fetch(material.thumbnail)
        dbMaterial.thumbnailData = await thumbResponse.arrayBuffer()
      }

      // 先持久化到 IndexedDB（事务关键步骤）
      await dbManager.addMaterial(dbMaterial)
      
      // 持久化成功，添加到内存状态
      materials.value.push(material)
      uploadProgress.value = 100

      return material
    } catch (error) {
      // 事务失败，回滚：释放已创建的 Blob URL
      URL.revokeObjectURL(blobUrl)
      if (thumbnail) {
        URL.revokeObjectURL(thumbnail)
      }
      
      console.error('[ResourceStore] 添加素材失败，已回滚:', error)
      throw error
    }
  }

  /**
   * 批量添加素材（并发控制）
   * 
   * 使用并发池而非串行处理，大幅提升批量上传性能
   * @param files 文件列表
   * @param forceType 强制类型
   * @param concurrency 最大并发数，默认 3
   */
  async function addMaterials(
    files: File[], 
    forceType?: MaterialType,
    concurrency = 3
  ): Promise<Material[]> {
    const results: Material[] = []
    const errors: Array<{ file: string; error: unknown }> = []
    
    // 并发控制器
    const executing = new Set<Promise<void>>()
    
    for (const file of files) {
      // 创建任务 Promise
      const task = addMaterial(file, forceType)
        .then(material => {
          results.push(material)
        })
        .catch(error => {
          console.warn('[ResourceStore] 素材添加失败:', file.name, error)
          errors.push({ file: file.name, error })
        })
        .finally(() => {
          executing.delete(task)
        })
      
      executing.add(task)
      
      // 达到并发上限时，等待一个任务完成
      if (executing.size >= concurrency) {
        await Promise.race(executing)
      }
    }
    
    // 等待所有剩余任务完成
    await Promise.all(executing)
    
    // 输出汇总信息
    if (errors.length > 0) {
      console.warn(`[ResourceStore] 批量添加完成: 成功 ${results.length}/${files.length}，失败 ${errors.length}`)
    }

    return results
  }

  /**
   * 删除素材
   */
  async function removeMaterial(id: string): Promise<void> {
    const index = materials.value.findIndex(m => m.id === id)
    if (index === -1) return

    const material = materials.value[index]

    // 释放 Blob URL
    if (material.blobUrl) URL.revokeObjectURL(material.blobUrl)
    if (material.thumbnail) {
      URL.revokeObjectURL(material.thumbnail)
    }

    // 从 IndexedDB 删除
    await dbManager.deleteMaterial(id)

    // 从状态移除
    materials.value.splice(index, 1)
  }

  /**
   * 清空所有素材
   */
  async function clearAll(): Promise<void> {
    // 释放所有 Blob URL
    for (const material of materials.value) {
      if (material.blobUrl) URL.revokeObjectURL(material.blobUrl)
      if (material.thumbnail) {
        URL.revokeObjectURL(material.thumbnail)
      }
    }

    // 清空 IndexedDB
    await dbManager.clearMaterials()

    // 清空状态
    materials.value = []
  }

  /**
   * 获取素材
   */
  function getMaterial(id: string): Material | undefined {
    return materials.value.find(m => m.id === id)
  }

  // ==================== 工具函数 ====================

  function getFileType(file: File): MaterialType {
    const mimeType = file.type.toLowerCase()
    if (mimeType.startsWith('video/')) return 'video'
    if (mimeType.startsWith('audio/')) return 'audio'
    if (mimeType.startsWith('image/')) return 'image'
    return 'video' // 默认
  }

  function getMediaInfo(url: string, type: 'video' | 'audio'): Promise<{
    duration: number
    width?: number
    height?: number
  }> {
    return new Promise((resolve, reject) => {
      const element = type === 'video' 
        ? document.createElement('video')
        : document.createElement('audio')

      element.onloadedmetadata = () => {
        resolve({
          duration: element.duration,
          width: type === 'video' ? (element as HTMLVideoElement).videoWidth : undefined,
          height: type === 'video' ? (element as HTMLVideoElement).videoHeight : undefined
        })
      }

      element.onerror = reject
      element.src = url
    })
  }

  function getImageInfo(url: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve({ width: img.width, height: img.height })
      img.onerror = reject
      img.src = url
    })
  }

  return {
    // 状态
    materials,
    isLoading,
    uploadProgress,
    // 计算属性
    videoMaterials,
    audioMaterials,
    imageMaterials,
    stickerMaterials,
    // 方法
    init,
    addMaterial,
    addMaterials,
    removeMaterial,
    clearAll,
    getMaterial
  }
})
