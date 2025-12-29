/**
 * 时间线 Store
 * 管理轨道、片段和播放状态
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Track, Clip, TrackType, PlaybackState } from '@/types'

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
    for (const track of tracks.value) {
      const clip = track.clips.find(c => c.id === selectedClipId.value)
      if (clip) return clip
    }
    return null
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
      name: name ?? `${type === 'video' ? '视频' : type === 'audio' ? '音频' : '文字'}轨道 ${tracks.value.filter(t => t.type === type).length + 1}`,
      clips: [],
      muted: false,
      locked: false
    }
    
    // 按类型排序插入
    const typeOrder = { video: 0, text: 1, audio: 2 }
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
   * 添加片段
   */
  function addClip(trackId: string, clip: Omit<Clip, 'id' | 'trackId'>): Clip {
    const track = tracks.value.find(t => t.id === trackId)
    if (!track) throw new Error('轨道不存在')

    const newClip: Clip = {
      ...clip,
      id: crypto.randomUUID(),
      trackId
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
        Object.assign(clip, updates)
        updateDuration()
        return
      }
    }
  }

  /**
   * 移动片段到新时间位置
   */
  function moveClip(clipId: string, newStartTime: number): void {
    updateClip(clipId, { startTime: Math.max(0, newStartTime) })
  }

  /**
   * 移动片段到其他轨道
   */
  function moveClipToTrack(clipId: string, targetTrackId: string): void {
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
        movedClip.trackId = targetTrackId
        targetTrack.clips.push(movedClip)
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
    // 播放控制
    play,
    pause,
    togglePlay,
    seek,
    setVolume,
    setPlaybackRate,
    setZoom,
    // 工具方法
    getActiveClips,
    reset
  }
})
