/**
 * 片段操作模块
 * 包含片段的增删改移操作
 * 
 * @module stores/timeline/clipOperations
 */

import type { Track, Clip } from '@/types'
import type { TimelineState } from './state'
import { useHistoryStore } from '../history'
import {
  AddClipCommand,
  RemoveClipCommand,
  UpdateClipCommand,
  MoveClipCommand,
  SplitClipCommand
} from '@/engine/commands'

/**
 * 创建片段操作方法
 * 
 * @param state 时间线状态
 * @param getThisStore 获取当前 Store 实例的函数
 * @param updateDuration 更新时长的函数
 */
export function createClipOperations(
  state: TimelineState,
  getThisStore: () => ReturnType<typeof import('./index').useTimelineStore>,
  updateDuration: () => void
) {
  /**
   * 获取 History Store（惰性获取，避免循环依赖）
   */
  function getHistoryStore() {
    return useHistoryStore()
  }

  /**
   * 检查两个片段是否重叠
   */
  function isOverlapping(
    clip1Start: number, 
    clip1End: number, 
    clip2Start: number, 
    clip2End: number
  ): boolean {
    return clip1Start < clip2End && clip1End > clip2Start
  }

  /**
   * 在轨道中找到不会重叠的位置
   * 
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
   * 直接添加片段（内部方法，用于命令执行和撤销恢复）
   */
  function _addClipDirect(trackId: string, clip: Omit<Clip, 'id' | 'trackId'> | Clip): Clip {
    const track = state.tracks.value.find(t => t.id === trackId)
    if (!track) throw new Error('轨道不存在')

    // 如果是完整的 Clip（恢复场景），直接使用
    if ('id' in clip && 'trackId' in clip) {
      const fullClip = clip as Clip
      track.clips.push({ ...fullClip, trackId })
      updateDuration()
      return fullClip
    }

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
    updateDuration()

    return newClip
  }
  
  /**
   * 添加片段（记录历史）
   */
  function addClip(trackId: string, clip: Omit<Clip, 'id' | 'trackId'>): Clip {
    const command = new AddClipCommand(getThisStore, trackId, clip)
    getHistoryStore().execute(command)
    // 返回最新添加的片段
    const track = state.tracks.value.find(t => t.id === trackId)
    return track!.clips[track!.clips.length - 1]
  }

  /**
   * 直接移除片段（内部方法）
   */
  function _removeClipDirect(clipId: string): void {
    for (const track of state.tracks.value) {
      const index = track.clips.findIndex(c => c.id === clipId)
      if (index !== -1) {
        track.clips.splice(index, 1)
        if (state.selectedClipId.value === clipId) {
          state.selectedClipId.value = null
        }
        updateDuration()
        return
      }
    }
  }
  
  /**
   * 移除片段（记录历史）
   */
  function removeClip(clipId: string): void {
    const command = new RemoveClipCommand(getThisStore, clipId)
    getHistoryStore().execute(command)
  }

  /**
   * 直接更新片段（内部方法）
   */
  function _updateClipDirect(clipId: string, updates: Partial<Clip>): void {
    for (const track of state.tracks.value) {
      const clip = track.clips.find(c => c.id === clipId)
      if (clip) {
        Object.assign(clip, updates)
        updateDuration()
        return
      }
    }
  }
  
  /**
   * 更新片段（记录历史）
   */
  function updateClip(clipId: string, updates: Partial<Clip>): void {
    const command = new UpdateClipCommand(getThisStore, clipId, updates)
    getHistoryStore().execute(command)
  }

  /**
   * 直接移动片段（内部方法）
   */
  function _moveClipDirect(clipId: string, newStartTime: number): void {
    for (const track of state.tracks.value) {
      const clip = track.clips.find(c => c.id === clipId)
      if (clip) {
        const adjustedStartTime = findNonOverlappingPosition(
          track,
          Math.max(0, newStartTime),
          clip.duration,
          clipId
        )
        clip.startTime = adjustedStartTime
        updateDuration()
        return
      }
    }
  }
  
  /**
   * 移动片段到新时间位置（记录历史）
   */
  function moveClip(clipId: string, newStartTime: number): void {
    const command = new MoveClipCommand(getThisStore, clipId, newStartTime)
    getHistoryStore().execute(command)
  }

  /**
   * 移动片段到其他轨道（自动防重叠）
   */
  function moveClipToTrack(clipId: string, targetTrackId: string, newStartTime?: number): void {
    let movedClip: Clip | null = null
    
    // 从原轨道移除
    for (const track of state.tracks.value) {
      const index = track.clips.findIndex(c => c.id === clipId)
      if (index !== -1) {
        movedClip = track.clips.splice(index, 1)[0]
        break
      }
    }

    // 添加到目标轨道
    if (movedClip) {
      const targetTrack = state.tracks.value.find(t => t.id === targetTrackId)
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
    state.selectedClipId.value = clipId
  }

  /**
   * 直接分割片段（内部方法）
   */
  function _splitClipDirect(clipId: string, splitTime: number): [Clip, Clip] | null {
    for (const track of state.tracks.value) {
      const clipIndex = track.clips.findIndex(c => c.id === clipId)
      if (clipIndex === -1) continue

      const clip = track.clips[clipIndex]
      const clipEndTime = clip.startTime + clip.duration

      if (splitTime <= clip.startTime || splitTime >= clipEndTime) {
        return null
      }

      const splitPoint = splitTime - clip.startTime

      const firstHalf: Clip = {
        ...clip,
        duration: splitPoint,
        outPoint: clip.inPoint + splitPoint
      }

      const secondHalf: Clip = {
        ...clip,
        id: crypto.randomUUID(),
        startTime: splitTime,
        duration: clip.duration - splitPoint,
        inPoint: clip.inPoint + splitPoint,
        effects: [...clip.effects]
      }

      track.clips.splice(clipIndex, 1, firstHalf, secondHalf)
      return [firstHalf, secondHalf]
    }

    return null
  }
  
  /**
   * 分割片段（记录历史）
   */
  function splitClip(clipId: string, splitTime: number): [Clip, Clip] | null {
    const command = new SplitClipCommand(getThisStore, clipId, splitTime)
    getHistoryStore().execute(command)
    // 返回分割结果（需要从轨道中查找）
    const clip = getClipById(clipId)
    if (!clip) {
      // 分割成功后原 clipId 被保留为 firstHalf，查找 secondHalf
      for (const track of state.tracks.value) {
        const idx = track.clips.findIndex(c => c.id === clipId)
        if (idx !== -1 && idx + 1 < track.clips.length) {
          return [track.clips[idx], track.clips[idx + 1]]
        }
      }
    }
    return null
  }

  /**
   * 根据 ID 获取片段 - O(1) 查找
   * 性能优化：使用 clipIdMap 索引缓存
   */
  function getClipById(clipId: string): Clip | null {
    return state.clipIdMap.value.get(clipId) ?? null
  }

  return {
    // 工具方法
    isOverlapping,
    findNonOverlappingPosition,
    getClipById,
    
    // 公开方法
    addClip,
    removeClip,
    updateClip,
    moveClip,
    moveClipToTrack,
    selectClip,
    splitClip,
    
    // 内部直接方法（供命令调用）
    _addClipDirect,
    _removeClipDirect,
    _updateClipDirect,
    _moveClipDirect,
    _splitClipDirect
  }
}
