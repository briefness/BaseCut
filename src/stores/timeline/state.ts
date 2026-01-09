/**
 * 时间线状态定义
 * 单一数据源，所有模块共享
 * 
 * @module stores/timeline/state
 */

import { ref, computed } from 'vue'
import type { Track, Clip, PlaybackState, Transition } from '@/types'

/**
 * 创建时间线状态
 * 所有响应式状态和计算属性
 */
export function createTimelineState() {
  // ==================== 基础状态 ====================
  
  /** 轨道列表 */
  const tracks = ref<Track[]>([])
  
  /** 当前选中的片段 ID */
  const selectedClipId = ref<string | null>(null)
  
  /** 当前播放时间（秒）*/
  const currentTime = ref(0)
  
  /** 时间线总时长（秒）*/
  const duration = ref(0)
  
  /** 是否正在播放 */
  const isPlaying = ref(false)
  
  /** 音量 (0-1) */
  const volume = ref(1)
  
  /** 播放速度 */
  const playbackRate = ref(1)
  
  /** 时间线缩放比例 */
  const zoom = ref(1)
  
  // ==================== 拖拽预览状态 ====================
  
  /** 是否正在拖动时间轴 */
  const isSeeking = ref(false)
  
  /** 拖动时的预览时间点 */
  const seekingTime = ref(0)
  
  // ==================== 转场效果 ====================
  
  /** 转场效果列表 */
  const transitions = ref<Transition[]>([])

  // ==================== 计算属性 ====================
  
  /** 视频轨道 */
  const videoTracks = computed(() => 
    tracks.value.filter(t => t.type === 'video')
  )

  /** 音频轨道 */
  const audioTracks = computed(() => 
    tracks.value.filter(t => t.type === 'audio')
  )

  /** 文字轨道 */
  const textTracks = computed(() => 
    tracks.value.filter(t => t.type === 'text')
  )

  /**
   * 片段 ID 索引缓存
   * 仅在 tracks 变化时重建，提供 O(1) 查找
   */
  const clipIdMap = computed(() => {
    const map = new Map<string, Clip>()
    for (const track of tracks.value) {
      for (const clip of track.clips) {
        map.set(clip.id, clip)
      }
    }
    return map
  })

  /** 当前选中的片段 */
  const selectedClip = computed(() => {
    if (!selectedClipId.value) return null
    return clipIdMap.value.get(selectedClipId.value) ?? null
  })

  /** 播放状态对象 */
  const playbackState = computed<PlaybackState>(() => ({
    isPlaying: isPlaying.value,
    currentTime: currentTime.value,
    duration: duration.value,
    volume: volume.value,
    playbackRate: playbackRate.value
  }))

  /** 所有选中的片段 ID（兼容多选，目前只支持单选）*/
  const selectedClipIds = computed(() => {
    return selectedClipId.value ? [selectedClipId.value] : []
  })

  return {
    // 基础状态
    tracks,
    selectedClipId,
    currentTime,
    duration,
    isPlaying,
    volume,
    playbackRate,
    zoom,
    
    // 拖拽预览状态
    isSeeking,
    seekingTime,
    
    // 转场效果
    transitions,
    
    // 计算属性
    videoTracks,
    audioTracks,
    textTracks,
    clipIdMap,
    selectedClip,
    playbackState,
    selectedClipIds
  }
}

/** 时间线状态类型 */
export type TimelineState = ReturnType<typeof createTimelineState>
