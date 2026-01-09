/**
 * 时间线工具方法模块
 * 包含通用的辅助函数
 * 
 * @module stores/timeline/utils
 */

import type { Clip } from '@/types'
import type { TimelineState } from './state'

/**
 * 创建时间线工具方法
 * 
 * @param state 时间线状态
 */
export function createTimelineUtils(state: TimelineState) {
  
  /**
   * 更新总时长
   * 根据所有片段的结束时间计算
   */
  function updateDuration(): void {
    let maxEndTime = 0
    for (const track of state.tracks.value) {
      for (const clip of track.clips) {
        const endTime = clip.startTime + clip.duration
        if (endTime > maxEndTime) {
          maxEndTime = endTime
        }
      }
    }
    state.duration.value = maxEndTime
  }

  /**
   * 获取当前时间点的活跃片段
   */
  function getActiveClips(time: number): Clip[] {
    const activeClips: Clip[] = []
    
    for (const track of state.tracks.value) {
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
    state.tracks.value = []
    state.selectedClipId.value = null
    state.currentTime.value = 0
    state.duration.value = 0
    state.isPlaying.value = false
  }

  return {
    updateDuration,
    getActiveClips,
    reset
  }
}
