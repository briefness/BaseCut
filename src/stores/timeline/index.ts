/**
 * 时间线 Store - 模块化重构版
 * 
 * 管理轨道、片段和播放状态
 * 所有修改操作通过命令模式实现撤销/重做
 * 公共方法自动包装为历史命令
 * _xxDirect 方法为内部直接操作，不记录历史
 * 
 * @module stores/timeline
 */

import { defineStore } from 'pinia'
import { createTimelineState } from './state'
import { createTrackOperations } from './trackOperations'
import { createClipOperations } from './clipOperations'
import { createPlaybackControl } from './playbackControl'
import { createTransitionOperations } from './transitionOperations'
import { createTimelineUtils } from './utils'

/**
 * 时间线 Store
 * 组合所有子模块，提供统一的 API
 */
export const useTimelineStore = defineStore('timeline', () => {
  // 创建状态
  const state = createTimelineState()
  
  // 获取当前 Store 实例（供命令使用）
  function getThisStore() {
    return useTimelineStore()
  }

  // 创建工具方法（需要先创建，因为其他模块依赖 updateDuration）
  const utils = createTimelineUtils(state)

  // 创建各模块
  const trackOps = createTrackOperations(state, getThisStore)
  const clipOps = createClipOperations(state, getThisStore, utils.updateDuration)
  const playbackCtrl = createPlaybackControl(state)
  const transitionOps = createTransitionOperations(state)

  return {
    // ==================== 状态 ====================
    tracks: state.tracks,
    selectedClipId: state.selectedClipId,
    currentTime: state.currentTime,
    duration: state.duration,
    isPlaying: state.isPlaying,
    volume: state.volume,
    playbackRate: state.playbackRate,
    zoom: state.zoom,
    isSeeking: state.isSeeking,
    seekingTime: state.seekingTime,
    transitions: state.transitions,
    
    // ==================== 计算属性 ====================
    videoTracks: state.videoTracks,
    audioTracks: state.audioTracks,
    textTracks: state.textTracks,
    selectedClip: state.selectedClip,
    playbackState: state.playbackState,
    selectedClipIds: state.selectedClipIds,
    
    // ==================== 轨道操作 ====================
    addTrack: trackOps.addTrack,
    removeTrack: trackOps.removeTrack,
    toggleTrackMute: trackOps.toggleTrackMute,
    toggleTrackLock: trackOps.toggleTrackLock,
    
    // ==================== 片段操作 ====================
    addClip: clipOps.addClip,
    removeClip: clipOps.removeClip,
    updateClip: clipOps.updateClip,
    moveClip: clipOps.moveClip,
    moveClipToTrack: clipOps.moveClipToTrack,
    selectClip: clipOps.selectClip,
    splitClip: clipOps.splitClip,
    getClipById: clipOps.getClipById,
    
    // ==================== 转场操作 ====================
    addTransition: transitionOps.addTransition,
    removeTransition: transitionOps.removeTransition,
    getTransitionBetween: transitionOps.getTransitionBetween,
    getTransitionAt: transitionOps.getTransitionAt,
    
    // ==================== 播放控制 ====================
    play: playbackCtrl.play,
    pause: playbackCtrl.pause,
    togglePlay: playbackCtrl.togglePlay,
    seek: playbackCtrl.seek,
    setVolume: playbackCtrl.setVolume,
    setPlaybackRate: playbackCtrl.setPlaybackRate,
    setZoom: playbackCtrl.setZoom,
    setCurrentTime: playbackCtrl.setCurrentTime,
    
    // ==================== 拖拽预览控制 ====================
    startSeeking: playbackCtrl.startSeeking,
    updateSeekingTime: playbackCtrl.updateSeekingTime,
    stopSeeking: playbackCtrl.stopSeeking,
    
    // ==================== 工具方法 ====================
    getActiveClips: utils.getActiveClips,
    reset: utils.reset,
    
    // ==================== 内部直接方法（供命令调用，不记录历史）====================
    _addTrackDirect: trackOps._addTrackDirect,
    _removeTrackDirect: trackOps._removeTrackDirect,
    _restoreTrackDirect: trackOps._restoreTrackDirect,
    _toggleTrackMuteDirect: trackOps._toggleTrackMuteDirect,
    _toggleTrackLockDirect: trackOps._toggleTrackLockDirect,
    _addClipDirect: clipOps._addClipDirect,
    _removeClipDirect: clipOps._removeClipDirect,
    _updateClipDirect: clipOps._updateClipDirect,
    _moveClipDirect: clipOps._moveClipDirect,
    _splitClipDirect: clipOps._splitClipDirect
  }
})
