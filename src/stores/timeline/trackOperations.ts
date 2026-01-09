/**
 * 轨道操作模块
 * 包含轨道的增删改操作
 * 
 * @module stores/timeline/trackOperations
 */

import type { Track, TrackType } from '@/types'
import type { TimelineState } from './state'
import { useHistoryStore } from '../history'
import {
  AddTrackCommand,
  RemoveTrackCommand,
  ToggleTrackMuteCommand,
  ToggleTrackLockCommand
} from '@/engine/commands'

/**
 * 轨道类型排序权重
 * 用于维护轨道在列表中的顺序
 */
const TRACK_TYPE_ORDER: Record<string, number> = {
  video: 0,
  sticker: 1,
  text: 2,
  audio: 3
}

/**
 * 创建轨道操作方法
 * 
 * @param state 时间线状态
 * @param getThisStore 获取当前 Store 实例的函数
 */
export function createTrackOperations(
  state: TimelineState,
  getThisStore: () => ReturnType<typeof import('./index').useTimelineStore>
) {
  /**
   * 获取 History Store（惰性获取，避免循环依赖）
   */
  function getHistoryStore() {
    return useHistoryStore()
  }

  /**
   * 直接添加轨道（内部方法，不记录历史）
   */
  function _addTrackDirect(type: TrackType, name?: string): Track {
    const track: Track = {
      id: crypto.randomUUID(),
      type,
      name: name ?? `${type === 'video' ? '视频' : type === 'audio' ? '音频' : type === 'sticker' ? '贴纸' : '文字'}轨道 ${state.tracks.value.filter(t => t.type === type).length + 1}`,
      clips: [],
      muted: false,
      locked: false
    }
    
    // 按类型排序插入
    const insertIndex = state.tracks.value.findIndex(
      t => TRACK_TYPE_ORDER[t.type] > TRACK_TYPE_ORDER[type]
    )
    
    if (insertIndex === -1) {
      state.tracks.value.push(track)
    } else {
      state.tracks.value.splice(insertIndex, 0, track)
    }

    return track
  }
  
  /**
   * 添加轨道（记录历史）
   */
  function addTrack(type: TrackType, name?: string): Track {
    const command = new AddTrackCommand(getThisStore, type, name)
    getHistoryStore().execute(command)
    // 返回创建的轨道
    return state.tracks.value.find(t => t.type === type && (!name || t.name === name))!
  }

  /**
   * 直接删除轨道（内部方法，不记录历史）
   */
  function _removeTrackDirect(trackId: string): void {
    const index = state.tracks.value.findIndex(t => t.id === trackId)
    if (index !== -1) {
      // 取消选中该轨道上的片段
      const track = state.tracks.value[index]
      if (track.clips.some(c => c.id === state.selectedClipId.value)) {
        state.selectedClipId.value = null
      }
      state.tracks.value.splice(index, 1)
    }
  }
  
  /**
   * 恢复轨道（用于撤销删除）
   */
  function _restoreTrackDirect(track: Track): void {
    // 按类型排序插入
    const insertIndex = state.tracks.value.findIndex(
      t => TRACK_TYPE_ORDER[t.type] > TRACK_TYPE_ORDER[track.type]
    )
    
    if (insertIndex === -1) {
      state.tracks.value.push(track)
    } else {
      state.tracks.value.splice(insertIndex, 0, track)
    }
  }
  
  /**
   * 删除轨道（记录历史）
   */
  function removeTrack(trackId: string): void {
    const command = new RemoveTrackCommand(getThisStore, trackId)
    getHistoryStore().execute(command)
  }

  /**
   * 直接切换轨道静音（内部方法）
   */
  function _toggleTrackMuteDirect(trackId: string): void {
    const track = state.tracks.value.find(t => t.id === trackId)
    if (track) {
      track.muted = !track.muted
    }
  }
  
  /**
   * 切换轨道静音（记录历史）
   */
  function toggleTrackMute(trackId: string): void {
    const command = new ToggleTrackMuteCommand(getThisStore, trackId)
    getHistoryStore().execute(command)
  }
  
  /**
   * 直接切换轨道锁定（内部方法）
   */
  function _toggleTrackLockDirect(trackId: string): void {
    const track = state.tracks.value.find(t => t.id === trackId)
    if (track) {
      track.locked = !track.locked
    }
  }

  /**
   * 切换轨道锁定（记录历史）
   */
  function toggleTrackLock(trackId: string): void {
    const command = new ToggleTrackLockCommand(getThisStore, trackId)
    getHistoryStore().execute(command)
  }

  return {
    // 公开方法
    addTrack,
    removeTrack,
    toggleTrackMute,
    toggleTrackLock,
    
    // 内部直接方法（供命令调用）
    _addTrackDirect,
    _removeTrackDirect,
    _restoreTrackDirect,
    _toggleTrackMuteDirect,
    _toggleTrackLockDirect
  }
}
