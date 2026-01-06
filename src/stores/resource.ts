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
   * 添加素材
   */
  async function addMaterial(file: File, forceType?: MaterialType): Promise<Material> {
    uploadProgress.value = 0
    
    const id = crypto.randomUUID()
    const type = forceType || getFileType(file)
    const blobUrl = URL.createObjectURL(file)

    // 基础素材信息
    const material: Material = {
      id,
      name: file.name,
      type,
      file,
      blobUrl,
      createdAt: Date.now()
    }

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
        material.thumbnail = URL.createObjectURL(thumbBlob)
      } catch (error) {
        console.warn('生成缩略图失败:', error)
      }
    }

    // 添加到状态
    materials.value.push(material)

    // 注意：HLS 本地转换暂时禁用
    // 原因：hls.js 无法直接播放 Blob URL 格式的 m3u8（分片路径问题）
    // 解决方案：需要 Service Worker 或后端服务来提供 HLS 流
    // 当前使用原始 Blob URL 播放视频
    // 
    // if (type === 'video') {
    //   material.isConverting = true
    //   convertToHLSAsync(material, file)
    // }

    // 存储到 IndexedDB
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

    await dbManager.addMaterial(dbMaterial)
    uploadProgress.value = 100

    return material
  }

  /**
   * 后台异步转换视频为 HLS
   */
  /**
   * 后台异步转换视频为 HLS
   */
  // async function convertToHLSAsync(material: Material, file: File): Promise<void> {
  //   try {
  //     console.log(`[ResourceStore] 开始转换 ${material.name} 为 HLS...`)
  //     
  //     // 设置进度回调
  //     ffmpegCore.onProgress((progress) => {
  //       console.log(`[ResourceStore] HLS 转换进度: ${Math.round(progress * 100)}%`)
  //     })
  //
  //     const result = await ffmpegCore.convertToHLS(file, {
  //       segmentDuration: 4
  //     })
  //
  //     // 更新素材的 HLS URL
  //     material.hlsUrl = result.playlistUrl
  //     material.isConverting = false
  //
  //     console.log(`[ResourceStore] ${material.name} HLS 转换完成`)
  //   } catch (error) {
  //     console.error(`[ResourceStore] HLS 转换失败:`, error)
  //     material.isConverting = false
  //     // 失败时继续使用原始 blobUrl
  //   }
  // }

  /**
   * 批量添加素材
   */
  async function addMaterials(files: File[], forceType?: MaterialType): Promise<Material[]> {
    const results: Material[] = []
    
    for (let i = 0; i < files.length; i++) {
      const material = await addMaterial(files[i], forceType)
      results.push(material)
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
