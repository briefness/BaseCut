/**
 * 播放控制模块
 * 包含播放、暂停、跳转、音量等控制
 * 
 * @module stores/timeline/playbackControl
 */

import type { TimelineState } from './state'

/**
 * 创建播放控制方法
 * 
 * @param state 时间线状态
 */
export function createPlaybackControl(state: TimelineState) {
  
  /**
   * 播放
   */
  function play(): void {
    state.isPlaying.value = true
  }

  /**
   * 暂停
   */
  function pause(): void {
    state.isPlaying.value = false
  }

  /**
   * 切换播放状态
   */
  function togglePlay(): void {
    state.isPlaying.value = !state.isPlaying.value
  }

  /**
   * 跳转到指定时间
   */
  function seek(time: number): void {
    state.currentTime.value = Math.max(0, Math.min(time, state.duration.value))
  }

  /**
   * 设置音量
   */
  function setVolume(v: number): void {
    state.volume.value = Math.max(0, Math.min(1, v))
  }

  /**
   * 设置播放速度
   */
  function setPlaybackRate(rate: number): void {
    state.playbackRate.value = rate
  }

  /**
   * 设置缩放
   */
  function setZoom(z: number): void {
    state.zoom.value = Math.max(0.1, Math.min(10, z))
  }

  /**
   * 设置当前时间（别名，便于语义化调用）
   */
  function setCurrentTime(time: number): void {
    seek(time)
  }

  // ==================== 拖拽预览控制 ====================

  /**
   * 开始拖拽预览
   */
  function startSeeking(): void {
    state.isSeeking.value = true
    state.seekingTime.value = state.currentTime.value
  }

  /**
   * 更新拖拽预览时间（不触发实际 seek）
   */
  function updateSeekingTime(time: number): void {
    if (state.isSeeking.value) {
      state.seekingTime.value = Math.max(0, Math.min(time, state.duration.value))
    }
  }

  /**
   * 结束拖拽，执行实际 seek
   */
  function stopSeeking(): void {
    if (state.isSeeking.value) {
      state.currentTime.value = state.seekingTime.value
      state.isSeeking.value = false
    }
  }

  return {
    // 播放控制
    play,
    pause,
    togglePlay,
    seek,
    setVolume,
    setPlaybackRate,
    setZoom,
    setCurrentTime,
    
    // 拖拽预览控制
    startSeeking,
    updateSeekingTime,
    stopSeeking
  }
}
