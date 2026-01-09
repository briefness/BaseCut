/**
 * 项目 Store
 * 管理项目设置和持久化
 * 
 * 所有修改操作通过命令模式实现撤销/重做
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Project, DBProject } from '@/types'
import { dbManager } from '@/db/IndexedDBManager'
import { useTimelineStore } from './timeline'
import { useHistoryStore } from './history'
import {
  SetCanvasSizeCommand,
  SetFrameRateCommand,
  RenameProjectCommand
} from '@/engine/commands'

export const useProjectStore = defineStore('project', () => {
  // ==================== 状态 ====================
  const projectId = ref<string | null>(null)
  const projectName = ref('未命名项目')
  const canvasWidth = ref(1920)
  const canvasHeight = ref(1080)
  const frameRate = ref(30)
  const isDirty = ref(false) // 是否有未保存的更改

  const timelineStore = useTimelineStore()

  // ==================== 计算属性 ====================
  const aspectRatio = computed(() => canvasWidth.value / canvasHeight.value)

  const currentProject = computed<Project>(() => ({
    id: projectId.value ?? crypto.randomUUID(),
    name: projectName.value,
    width: canvasWidth.value,
    height: canvasHeight.value,
    frameRate: frameRate.value,
    duration: timelineStore.duration,
    tracks: timelineStore.tracks,
    createdAt: Date.now(),
    updatedAt: Date.now()
  }))

  // 预设分辨率
  const presets = [
    { name: '1080p', width: 1920, height: 1080 },
    { name: '720p', width: 1280, height: 720 },
    { name: '4K', width: 3840, height: 2160 },
    { name: '竖屏 9:16', width: 1080, height: 1920 },
    { name: '正方形 1:1', width: 1080, height: 1080 }
  ]

  // ==================== 方法 ====================

  /**
   * 创建新项目
   */
  function createNew(name = '未命名项目'): void {
    projectId.value = crypto.randomUUID()
    projectName.value = name
    canvasWidth.value = 1920
    canvasHeight.value = 1080
    frameRate.value = 30
    isDirty.value = false

    // 重置时间线
    timelineStore.reset()

    // 添加默认轨道
    timelineStore.addTrack('video', '视频轨道 1')
    timelineStore.addTrack('audio', '音频轨道 1')
  }

  /**
   * 保存项目
   */
  async function save(): Promise<void> {
    if (!projectId.value) {
      projectId.value = crypto.randomUUID()
    }

    const dbProject: DBProject = {
      id: projectId.value,
      name: projectName.value,
      data: currentProject.value,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    await dbManager.saveProject(dbProject)
    isDirty.value = false
    console.log('[ProjectStore] 项目已保存:', projectName.value)
  }

  /**
   * 加载项目
   */
  async function load(id: string): Promise<void> {
    const dbProject = await dbManager.getProject(id)
    if (!dbProject) {
      throw new Error('项目不存在')
    }

    const project = dbProject.data

    projectId.value = project.id
    projectName.value = project.name
    canvasWidth.value = project.width
    canvasHeight.value = project.height
    frameRate.value = project.frameRate

    // 恢复时间线
    timelineStore.reset()
    for (const track of project.tracks) {
      const newTrack = timelineStore.addTrack(track.type, track.name)
      newTrack.muted = track.muted
      newTrack.locked = track.locked
      for (const clip of track.clips) {
        timelineStore.addClip(newTrack.id, clip)
      }
    }

    isDirty.value = false
    console.log('[ProjectStore] 项目已加载:', projectName.value)
  }

  /**
   * 获取所有项目列表
   */
  async function getProjectList(): Promise<DBProject[]> {
    return dbManager.getRecentProjects(20)
  }

  /**
   * 删除项目
   */
  async function deleteProject(id: string): Promise<void> {
    await dbManager.deleteProject(id)
    
    // 如果删除的是当前项目，创建新项目
    if (projectId.value === id) {
      createNew()
    }
  }
  // ==================== 直接方法（供命令调用） ====================
  
  /**
   * 直接设置画布尺寸（内部方法）
   */
  function _setCanvasSizeDirect(width: number, height: number): void {
    canvasWidth.value = width
    canvasHeight.value = height
    isDirty.value = true
  }
  
  /**
   * 直接设置帧率（内部方法）
   */
  function _setFrameRateDirect(rate: number): void {
    frameRate.value = rate
    isDirty.value = true
  }
  
  /**
   * 直接重命名项目（内部方法）
   */
  function _renameDirect(name: string): void {
    projectName.value = name
    isDirty.value = true
  }

  // ==================== 获取 History Store ====================
  
  /**
   * 惰性获取 History Store
   */
  function getHistoryStore() {
    return useHistoryStore()
  }
  
  /**
   * 获取当前 Store 实例
   */
  function getThisStore() {
    return useProjectStore()
  }
  
  // ==================== 公共方法（记录历史） ====================
  
  /**
   * 设置画布尺寸（记录历史）
   */
  function setCanvasSize(width: number, height: number): void {
    const command = new SetCanvasSizeCommand(getThisStore, width, height)
    getHistoryStore().execute(command)
  }

  /**
   * 应用预设
   */
  function applyPreset(presetName: string): void {
    const preset = presets.find(p => p.name === presetName)
    if (preset) {
      setCanvasSize(preset.width, preset.height)
    }
  }

  /**
   * 设置帧率（记录历史）
   */
  function setFrameRate(rate: number): void {
    const command = new SetFrameRateCommand(getThisStore, rate)
    getHistoryStore().execute(command)
  }

  /**
   * 修改项目名称（记录历史）
   */
  function rename(name: string): void {
    const command = new RenameProjectCommand(getThisStore, name)
    getHistoryStore().execute(command)
  }

  /**
   * 标记为已修改
   */
  function markDirty(): void {
    isDirty.value = true
  }

  return {
    // 状态
    projectId,
    projectName,
    canvasWidth,
    canvasHeight,
    frameRate,
    isDirty,
    // 计算属性
    aspectRatio,
    currentProject,
    presets,
    // 方法
    createNew,
    save,
    load,
    getProjectList,
    deleteProject,
    setCanvasSize,
    applyPreset,
    setFrameRate,
    rename,
    markDirty,
    // 内部直接方法（供命令调用）
    _setCanvasSizeDirect,
    _setFrameRateDirect,
    _renameDirect
  }
})
