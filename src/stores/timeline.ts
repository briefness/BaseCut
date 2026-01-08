/**
 * 时间线 Store
 * 管理轨道、片段和播放状态
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Track, Clip, TrackType, PlaybackState, Transition, TransitionType } from '@/types'

export const useTimelineStore = defineStore('timeline', () => {
  // ==================== 状态 ====================
  const tracks = ref<Track[]>([])
  const selectedClipId = ref<string | null>(null)
  const currentTime = ref(0)
  const duration = ref(0)
  const isPlaying = ref(false)
  const volume = ref(1)
  const playbackRate = ref(1)
  const zoom = ref(1) // 时间线缩放比例
  
  // 拖拽预览状态
  const isSeeking = ref(false)      // 是否正在拖动时间轴
  const seekingTime = ref(0)        // 拖动时的预览时间点
  
  // 转场效果
  const transitions = ref<Transition[]>([])

  // ==================== 计算属性 ====================
  const videoTracks = computed(() => 
    tracks.value.filter(t => t.type === 'video')
  )

  const audioTracks = computed(() => 
    tracks.value.filter(t => t.type === 'audio')
  )

  const textTracks = computed(() => 
    tracks.value.filter(t => t.type === 'text')
  )

  const selectedClip = computed(() => {
    if (!selectedClipId.value) return null
    return clipIdMap.value.get(selectedClipId.value) ?? null
  })

  // ==================== 性能优化：片段 ID 索引缓存 ====================
  // 使用计算属性自动缓存，仅在 tracks 变化时重建
  // 优化 getClipById 从 O(n*m) 到 O(1) 查找
  const clipIdMap = computed(() => {
    const map = new Map<string, Clip>()
    for (const track of tracks.value) {
      for (const clip of track.clips) {
        map.set(clip.id, clip)
      }
    }
    return map
  })

  const playbackState = computed<PlaybackState>(() => ({
    isPlaying: isPlaying.value,
    currentTime: currentTime.value,
    duration: duration.value,
    volume: volume.value,
    playbackRate: playbackRate.value
  }))

  // ==================== 轨道操作 ====================

  /**
   * 添加轨道
   */
  function addTrack(type: TrackType, name?: string): Track {
    const track: Track = {
      id: crypto.randomUUID(),
      type,
      name: name ?? `${type === 'video' ? '视频' : type === 'audio' ? '音频' : type === 'sticker' ? '贴纸' : '文字'}轨道 ${tracks.value.filter(t => t.type === type).length + 1}`,
      clips: [],
      muted: false,
      locked: false
    }
    
    // 按类型排序插入
    const typeOrder: Record<string, number> = { video: 0, sticker: 1, text: 2, audio: 3 }
    const insertIndex = tracks.value.findIndex(t => typeOrder[t.type] > typeOrder[type])
    
    if (insertIndex === -1) {
      tracks.value.push(track)
    } else {
      tracks.value.splice(insertIndex, 0, track)
    }

    return track
  }

  /**
   * 删除轨道
   */
  function removeTrack(trackId: string): void {
    const index = tracks.value.findIndex(t => t.id === trackId)
    if (index !== -1) {
      // 取消选中该轨道上的片段
      const track = tracks.value[index]
      if (track.clips.some(c => c.id === selectedClipId.value)) {
        selectedClipId.value = null
      }
      tracks.value.splice(index, 1)
    }
  }

  /**
   * 切换轨道静音
   */
  function toggleTrackMute(trackId: string): void {
    const track = tracks.value.find(t => t.id === trackId)
    if (track) {
      track.muted = !track.muted
    }
  }

  /**
   * 切换轨道锁定
   */
  function toggleTrackLock(trackId: string): void {
    const track = tracks.value.find(t => t.id === trackId)
    if (track) {
      track.locked = !track.locked
    }
  }

  // ==================== 片段操作 ====================

  /**
   * 检查两个片段是否重叠
   */
  function isOverlapping(clip1Start: number, clip1End: number, clip2Start: number, clip2End: number): boolean {
    return clip1Start < clip2End && clip1End > clip2Start
  }

  /**
   * 在轨道中找到不会重叠的位置
   * @param track 目标轨道
   * @param desiredStart 期望的起始时间
   * @param duration 片段时长
   * @param excludeClipId 排除的片段 ID（用于移动时排除自身）
   * @returns 调整后的起始时间
   */
  function findNonOverlappingPosition(
    track: Track,
    desiredStart: number,
    duration: number,
    excludeClipId?: string
  ): number {
    // 获取轨道上的其他片段（排除自身）
    const otherClips = track.clips
      .filter(c => c.id !== excludeClipId)
      .sort((a, b) => a.startTime - b.startTime)
    
    if (otherClips.length === 0) {
      return Math.max(0, desiredStart)
    }
    
    let startTime = Math.max(0, desiredStart)
    const endTime = startTime + duration
    
    // 寻找一个不重叠的位置
    for (const clip of otherClips) {
      const clipEnd = clip.startTime + clip.duration
      
      // 如果当前位置与此片段重叠
      if (isOverlapping(startTime, endTime, clip.startTime, clipEnd)) {
        // 将起始时间移动到此片段的结束位置
        startTime = clipEnd
      }
    }
    
    return startTime
  }

  /**
   * 添加片段（自动防重叠）
   */
  function addClip(trackId: string, clip: Omit<Clip, 'id' | 'trackId'>): Clip {
    const track = tracks.value.find(t => t.id === trackId)
    if (!track) throw new Error('轨道不存在')

    // 计算不重叠的起始位置
    const adjustedStartTime = findNonOverlappingPosition(
      track,
      clip.startTime,
      clip.duration
    )

    const newClip: Clip = {
      ...clip,
      id: crypto.randomUUID(),
      trackId,
      startTime: adjustedStartTime
    }

    track.clips.push(newClip)
    
    // 更新总时长
    updateDuration()

    return newClip
  }

  /**
   * 移除片段
   */
  function removeClip(clipId: string): void {
    for (const track of tracks.value) {
      const index = track.clips.findIndex(c => c.id === clipId)
      if (index !== -1) {
        track.clips.splice(index, 1)
        if (selectedClipId.value === clipId) {
          selectedClipId.value = null
        }
        updateDuration()
        return
      }
    }
  }

  /**
   * 更新片段
   */
  function updateClip(clipId: string, updates: Partial<Clip>): void {
    for (const track of tracks.value) {
      const clip = track.clips.find(c => c.id === clipId)
      if (clip) {
        // [调试日志] 验证 transform 更新
        if (updates.transform) {
          console.log('[Timeline updateClip]', {
            clipId,
            'updates.transform': updates.transform,
            'clip.transform before': clip.transform
          })
        }
        
        Object.assign(clip, updates)
        
        if (updates.transform) {
          console.log('[Timeline updateClip] after:', {
            'clip.transform after': clip.transform
          })
        }
        
        updateDuration()
        return
      }
    }
  }

  /**
   * 移动片段到新时间位置（自动防重叠）
   */
  function moveClip(clipId: string, newStartTime: number): void {
    // 找到片段所在的轨道
    for (const track of tracks.value) {
      const clip = track.clips.find(c => c.id === clipId)
      if (clip) {
        // 计算不重叠的位置
        const adjustedStartTime = findNonOverlappingPosition(
          track,
          Math.max(0, newStartTime),
          clip.duration,
          clipId  // 排除自身
        )
        updateClip(clipId, { startTime: adjustedStartTime })
        return
      }
    }
  }

  /**
   * 移动片段到其他轨道（自动防重叠）
   */
  function moveClipToTrack(clipId: string, targetTrackId: string, newStartTime?: number): void {
    let movedClip: Clip | null = null
    
    // 从原轨道移除
    for (const track of tracks.value) {
      const index = track.clips.findIndex(c => c.id === clipId)
      if (index !== -1) {
        movedClip = track.clips.splice(index, 1)[0]
        break
      }
    }

    // 添加到目标轨道
    if (movedClip) {
      const targetTrack = tracks.value.find(t => t.id === targetTrackId)
      if (targetTrack) {
        // 计算不重叠的位置
        const desiredStart = newStartTime ?? movedClip.startTime
        const adjustedStartTime = findNonOverlappingPosition(
          targetTrack,
          desiredStart,
          movedClip.duration
        )
        
        movedClip.trackId = targetTrackId
        movedClip.startTime = adjustedStartTime
        targetTrack.clips.push(movedClip)
        updateDuration()
      }
    }
  }

  /**
   * 选中片段
   */
  function selectClip(clipId: string | null): void {
    selectedClipId.value = clipId
  }

  /**
   * 分割片段
   */
  function splitClip(clipId: string, splitTime: number): [Clip, Clip] | null {
    for (const track of tracks.value) {
      const clipIndex = track.clips.findIndex(c => c.id === clipId)
      if (clipIndex === -1) continue

      const clip = track.clips[clipIndex]
      const clipEndTime = clip.startTime + clip.duration

      // 检查分割点是否有效
      if (splitTime <= clip.startTime || splitTime >= clipEndTime) {
        return null
      }

      const splitPoint = splitTime - clip.startTime // 相对于片段开始的时间

      // 创建前半部分
      const firstHalf: Clip = {
        ...clip,
        duration: splitPoint,
        outPoint: clip.inPoint + splitPoint
      }

      // 创建后半部分
      const secondHalf: Clip = {
        ...clip,
        id: crypto.randomUUID(),
        startTime: splitTime,
        duration: clip.duration - splitPoint,
        inPoint: clip.inPoint + splitPoint,
        effects: [...clip.effects]
      }

      // 替换原片段
      track.clips.splice(clipIndex, 1, firstHalf, secondHalf)

      return [firstHalf, secondHalf]
    }

    return null
  }

  // ==================== 播放控制 ====================

  /**
   * 播放
   */
  function play(): void {
    isPlaying.value = true
  }

  /**
   * 暂停
   */
  function pause(): void {
    isPlaying.value = false
  }

  /**
   * 切换播放状态
   */
  function togglePlay(): void {
    isPlaying.value = !isPlaying.value
  }

  /**
   * 跳转到指定时间
   */
  function seek(time: number): void {
    currentTime.value = Math.max(0, Math.min(time, duration.value))
  }

  /**
   * 设置音量
   */
  function setVolume(v: number): void {
    volume.value = Math.max(0, Math.min(1, v))
  }

  /**
   * 设置播放速度
   */
  function setPlaybackRate(rate: number): void {
    playbackRate.value = rate
  }

  /**
   * 设置缩放
   */
  function setZoom(z: number): void {
    zoom.value = Math.max(0.1, Math.min(10, z))
  }

  // ==================== 拖拽预览控制 ====================

  /**
   * 开始拖拽预览
   */
  function startSeeking(): void {
    isSeeking.value = true
    seekingTime.value = currentTime.value
  }

  /**
   * 更新拖拽预览时间（不触发实际 seek）
   */
  function updateSeekingTime(time: number): void {
    if (isSeeking.value) {
      seekingTime.value = Math.max(0, Math.min(time, duration.value))
    }
  }

  /**
   * 结束拖拽，执行实际 seek
   */
  function stopSeeking(): void {
    if (isSeeking.value) {
      currentTime.value = seekingTime.value
      isSeeking.value = false
    }
  }

  // ==================== 工具方法 ====================

  /**
   * 更新总时长
   */
  function updateDuration(): void {
    let maxEndTime = 0
    for (const track of tracks.value) {
      for (const clip of track.clips) {
        const endTime = clip.startTime + clip.duration
        if (endTime > maxEndTime) {
          maxEndTime = endTime
        }
      }
    }
    duration.value = maxEndTime
  }

  /**
   * 获取当前时间点的活跃片段
   */
  function getActiveClips(time: number): Clip[] {
    const activeClips: Clip[] = []
    
    for (const track of tracks.value) {
      if (track.muted) continue
      
      for (const clip of track.clips) {
        if (time >= clip.startTime && time < clip.startTime + clip.duration) {
          activeClips.push(clip)
        }
      }
    }

    return activeClips
  }

  /**
   * 根据 ID 获取片段 - O(1) 查找
   * 性能优化：使用 clipIdMap 索引缓存
   */
  function getClipById(clipId: string): Clip | null {
    return clipIdMap.value.get(clipId) ?? null
  }

  /**
   * 设置当前时间（别名，便于语义化调用）
   */
  function setCurrentTime(time: number): void {
    seek(time)
  }

  /**
   * 获取所有选中的片段 ID（兼容多选）
   * 目前只支持单选，返回单个 ID 的数组
   */
  const selectedClipIds = computed(() => {
    return selectedClipId.value ? [selectedClipId.value] : []
  })

  // ==================== 转场操作 ====================
  
  /**
   * 添加转场效果
   */
  function addTransition(clipAId: string, clipBId: string, type: TransitionType, duration: number = 0.5): Transition | null {
    // 验证两个片段存在
    let clipA: Clip | undefined
    let clipB: Clip | undefined
    
    for (const track of tracks.value) {
      for (const clip of track.clips) {
        if (clip.id === clipAId) clipA = clip
        if (clip.id === clipBId) clipB = clip
      }
    }
    
    if (!clipA || !clipB) {
      console.warn('[Timeline] 转场片段不存在')
      return null
    }
    
    // 检查是否已存在转场
    const existing = transitions.value.find(
      t => t.clipAId === clipAId && t.clipBId === clipBId
    )
    if (existing) {
      // 更新现有转场
      existing.type = type
      existing.duration = duration
      return existing
    }
    
    // 创建新转场
    const transition: Transition = {
      id: crypto.randomUUID(),
      type,
      duration,
      clipAId,
      clipBId
    }
    
    transitions.value.push(transition)
    console.log(`[Timeline] 添加转场: ${type}, 时长: ${duration}s`)
    return transition
  }
  
  /**
   * 移除转场效果
   */
  function removeTransition(transitionId: string): void {
    const index = transitions.value.findIndex(t => t.id === transitionId)
    if (index !== -1) {
      transitions.value.splice(index, 1)
      console.log('[Timeline] 移除转场')
    }
  }
  
  /**
   * 获取两个片段之间的转场
   */
  function getTransitionBetween(clipAId: string, clipBId: string): Transition | null {
    return transitions.value.find(
      t => t.clipAId === clipAId && t.clipBId === clipBId
    ) ?? null
  }
  
  /**
   * 获取指定时间点的转场信息
   * @returns 转场信息和进度，如果不在转场区域则返回 null
   */
  function getTransitionAt(time: number): { transition: Transition; progress: number; clipA: Clip; clipB: Clip } | null {
    // 快速检查：没有转场直接返回
    if (transitions.value.length === 0) return null
    
    // 构建片段查找缓存（避免重复遍历）
    const clipMap = new Map<string, Clip>()
    for (const track of tracks.value) {
      for (const clip of track.clips) {
        clipMap.set(clip.id, clip)
      }
    }
    
    for (const transition of transitions.value) {
      const clipA = clipMap.get(transition.clipAId)
      const clipB = clipMap.get(transition.clipBId)
      
      if (!clipA || !clipB) continue
      
      // 转场区域计算
      const clipBStart = clipB.startTime
      const transitionStart = clipBStart - transition.duration / 2
      const transitionEnd = clipBStart + transition.duration / 2
      
      if (time >= transitionStart && time < transitionEnd) {
        const progress = (time - transitionStart) / transition.duration
        return { transition, progress, clipA, clipB }
      }
    }
    
    return null
  }

  /**
   * 重置时间线
   */
  function reset(): void {
    tracks.value = []
    selectedClipId.value = null
    currentTime.value = 0
    duration.value = 0
    isPlaying.value = false
  }

  return {
    // 状态
    tracks,
    selectedClipId,
    currentTime,
    duration,
    isPlaying,
    volume,
    playbackRate,
    zoom,
    isSeeking,
    seekingTime,
    transitions,
    // 计算属性
    videoTracks,
    audioTracks,
    textTracks,
    selectedClip,
    playbackState,
    // 轨道操作
    addTrack,
    removeTrack,
    toggleTrackMute,
    toggleTrackLock,
    // 片段操作
    addClip,
    removeClip,
    updateClip,
    moveClip,
    moveClipToTrack,
    selectClip,
    splitClip,
    // 转场操作
    addTransition,
    removeTransition,
    getTransitionBetween,
    getTransitionAt,
    // 播放控制
    play,
    pause,
    togglePlay,
    seek,
    setVolume,
    setPlaybackRate,
    setZoom,
    // 拖拽预览控制
    startSeeking,
    updateSeekingTime,
    stopSeeking,
    // 工具方法
    getActiveClips,
    getClipById,
    setCurrentTime,
    reset,
    // 计算属性（辅助）
    selectedClipIds
  }
})
