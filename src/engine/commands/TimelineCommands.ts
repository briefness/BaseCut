/**
 * 时间线操作命令
 * 
 * 实现时间线相关的可撤销命令：
 * - 片段操作：添加、删除、更新、移动、分割
 * - 轨道操作：添加、删除、静音、锁定
 */

import type { HistoryCommand } from '../HistoryTypes'
import { generateCommandId, CommandTypes } from '../HistoryTypes'
import type { Track, Clip, TrackType } from '@/types'

// ==================== 命令基类 ====================

/**
 * 时间线命令基类
 * 提供通用属性和工具方法
 */
abstract class TimelineCommand implements HistoryCommand {
  readonly id: string
  readonly timestamp: number
  
  constructor(
    readonly type: string,
    readonly description: string
  ) {
    this.id = generateCommandId()
    this.timestamp = Date.now()
  }
  
  abstract execute(): void
  abstract undo(): void
}

// ==================== 片段命令 ====================

/**
 * 添加片段命令
 */
export class AddClipCommand extends TimelineCommand {
  /** Store 引用（惰性获取，避免循环依赖） */
  private getStore: () => ReturnType<typeof import('@/stores/timeline').useTimelineStore>
  
  /** 创建的片段 ID（执行后填充） */
  private createdClipId: string | null = null
  
  /** 创建的片段数据（用于重做时恢复） */
  private createdClip: Clip | null = null
  
  constructor(
    getStore: () => ReturnType<typeof import('@/stores/timeline').useTimelineStore>,
    private trackId: string,
    private clipData: Omit<Clip, 'id' | 'trackId'>
  ) {
    super(CommandTypes.ADD_CLIP, '添加片段')
    this.getStore = getStore
  }
  
  execute(): void {
    const store = this.getStore()
    
    // 如果已知片段 ID（重做时），尝试恢复完整数据
    if (this.createdClip) {
      const clip = store._addClipDirect(this.trackId, this.createdClip)
      this.createdClipId = clip.id
    } else {
      // 首次执行
      const clip = store._addClipDirect(this.trackId, this.clipData)
      this.createdClipId = clip.id
      this.createdClip = { ...clip }
    }
  }
  
  undo(): void {
    if (this.createdClipId) {
      const store = this.getStore()
      store._removeClipDirect(this.createdClipId)
    }
  }
}

/**
 * 删除片段命令
 */
export class RemoveClipCommand extends TimelineCommand {
  private getStore: () => ReturnType<typeof import('@/stores/timeline').useTimelineStore>
  
  /** 被删除的片段完整数据（用于撤销恢复） */
  private removedClip: Clip | null = null
  private removedFromTrackId: string | null = null
  
  constructor(
    getStore: () => ReturnType<typeof import('@/stores/timeline').useTimelineStore>,
    private clipId: string
  ) {
    super(CommandTypes.REMOVE_CLIP, '删除片段')
    this.getStore = getStore
  }
  
  execute(): void {
    const store = this.getStore()
    
    // 保存被删除的片段数据（用于撤销）
    const clip = store.getClipById(this.clipId)
    if (clip) {
      this.removedClip = { ...clip }
      this.removedFromTrackId = clip.trackId
    }
    
    store._removeClipDirect(this.clipId)
  }
  
  undo(): void {
    if (this.removedClip && this.removedFromTrackId) {
      const store = this.getStore()
      store._addClipDirect(this.removedFromTrackId, this.removedClip)
    }
  }
}

/**
 * 更新片段命令
 * 支持命令合并（连续更新同一片段时只保留最终状态）
 */
export class UpdateClipCommand extends TimelineCommand {
  private getStore: () => ReturnType<typeof import('@/stores/timeline').useTimelineStore>
  
  /** 旧属性值（用于撤销） */
  private oldValues: Partial<Clip> | null = null
  
  constructor(
    getStore: () => ReturnType<typeof import('@/stores/timeline').useTimelineStore>,
    private clipId: string,
    private updates: Partial<Clip>
  ) {
    super(CommandTypes.UPDATE_CLIP, '更新片段')
    this.getStore = getStore
  }
  
  execute(): void {
    const store = this.getStore()
    const clip = store.getClipById(this.clipId)
    
    if (clip && !this.oldValues) {
      // 保存旧值（只保存被更新的属性）
      this.oldValues = {}
      for (const key of Object.keys(this.updates) as (keyof Clip)[]) {
        (this.oldValues as Record<string, unknown>)[key] = clip[key]
      }
    }
    
    store._updateClipDirect(this.clipId, this.updates)
  }
  
  undo(): void {
    if (this.oldValues) {
      const store = this.getStore()
      store._updateClipDirect(this.clipId, this.oldValues)
    }
  }
  
  /**
   * 判断是否可以与另一个命令合并
   * 条件：同类型、同片段、在合并时间窗口内
   */
  canMergeWith(other: HistoryCommand): boolean {
    if (!(other instanceof UpdateClipCommand)) return false
    return other.clipId === this.clipId
  }
  
  /**
   * 合并命令：保留原始旧值，更新到新值
   */
  mergeWith(other: HistoryCommand): HistoryCommand {
    const otherCmd = other as UpdateClipCommand
    
    // 创建合并后的命令
    const merged = new UpdateClipCommand(
      this.getStore,
      this.clipId,
      { ...this.updates, ...otherCmd.updates }
    )
    
    // 保留最初的旧值
    merged.oldValues = this.oldValues
    
    return merged
  }
}

/**
 * 移动片段命令
 */
export class MoveClipCommand extends TimelineCommand {
  private getStore: () => ReturnType<typeof import('@/stores/timeline').useTimelineStore>
  
  /** 原始位置 */
  private oldStartTime: number | null = null
  
  constructor(
    getStore: () => ReturnType<typeof import('@/stores/timeline').useTimelineStore>,
    private clipId: string,
    private newStartTime: number
  ) {
    super(CommandTypes.MOVE_CLIP, '移动片段')
    this.getStore = getStore
  }
  
  execute(): void {
    const store = this.getStore()
    const clip = store.getClipById(this.clipId)
    
    if (clip && this.oldStartTime === null) {
      this.oldStartTime = clip.startTime
    }
    
    store._moveClipDirect(this.clipId, this.newStartTime)
  }
  
  undo(): void {
    if (this.oldStartTime !== null) {
      const store = this.getStore()
      store._moveClipDirect(this.clipId, this.oldStartTime)
    }
  }
  
  canMergeWith(other: HistoryCommand): boolean {
    if (!(other instanceof MoveClipCommand)) return false
    return other.clipId === this.clipId
  }
  
  mergeWith(other: HistoryCommand): HistoryCommand {
    const otherCmd = other as MoveClipCommand
    
    const merged = new MoveClipCommand(
      this.getStore,
      this.clipId,
      otherCmd.newStartTime
    )
    merged.oldStartTime = this.oldStartTime
    
    return merged
  }
}

/**
 * 分割片段命令
 */
export class SplitClipCommand extends TimelineCommand {
  private getStore: () => ReturnType<typeof import('@/stores/timeline').useTimelineStore>
  
  /** 原始片段数据 */
  private originalClip: Clip | null = null
  
  /** 分割后的两个片段 ID */
  private splitClipIds: [string, string] | null = null
  
  constructor(
    getStore: () => ReturnType<typeof import('@/stores/timeline').useTimelineStore>,
    private clipId: string,
    private splitTime: number
  ) {
    super(CommandTypes.SPLIT_CLIP, '分割片段')
    this.getStore = getStore
  }
  
  execute(): void {
    const store = this.getStore()
    
    // 保存原始片段
    if (!this.originalClip) {
      const clip = store.getClipById(this.clipId)
      if (clip) {
        this.originalClip = { ...clip }
      }
    }
    
    // 执行分割
    const result = store._splitClipDirect(this.clipId, this.splitTime)
    if (result) {
      this.splitClipIds = [result[0].id, result[1].id]
    }
  }
  
  undo(): void {
    const store = this.getStore()
    
    // 删除分割后的两个片段
    if (this.splitClipIds) {
      store._removeClipDirect(this.splitClipIds[0])
      store._removeClipDirect(this.splitClipIds[1])
    }
    
    // 恢复原始片段
    if (this.originalClip) {
      store._addClipDirect(this.originalClip.trackId, this.originalClip)
    }
  }
}

// ==================== 轨道命令 ====================

/**
 * 添加轨道命令
 */
export class AddTrackCommand extends TimelineCommand {
  private getStore: () => ReturnType<typeof import('@/stores/timeline').useTimelineStore>
  
  /** 创建的轨道 ID */
  private createdTrackId: string | null = null
  
  constructor(
    getStore: () => ReturnType<typeof import('@/stores/timeline').useTimelineStore>,
    private trackType: TrackType,
    private trackName?: string
  ) {
    super(CommandTypes.ADD_TRACK, '添加轨道')
    this.getStore = getStore
  }
  
  execute(): void {
    const store = this.getStore()
    const track = store._addTrackDirect(this.trackType, this.trackName)
    this.createdTrackId = track.id
  }
  
  undo(): void {
    if (this.createdTrackId) {
      const store = this.getStore()
      store._removeTrackDirect(this.createdTrackId)
    }
  }
}

/**
 * 删除轨道命令
 */
export class RemoveTrackCommand extends TimelineCommand {
  private getStore: () => ReturnType<typeof import('@/stores/timeline').useTimelineStore>
  
  /** 被删除的轨道完整数据 */
  private removedTrack: Track | null = null
  
  constructor(
    getStore: () => ReturnType<typeof import('@/stores/timeline').useTimelineStore>,
    private trackId: string
  ) {
    super(CommandTypes.REMOVE_TRACK, '删除轨道')
    this.getStore = getStore
  }
  
  execute(): void {
    const store = this.getStore()
    
    // 保存轨道数据
    const track = store.tracks.find(t => t.id === this.trackId)
    if (track) {
      // 深拷贝轨道及其片段
      this.removedTrack = {
        ...track,
        clips: track.clips.map(c => ({ ...c }))
      }
    }
    
    store._removeTrackDirect(this.trackId)
  }
  
  undo(): void {
    if (this.removedTrack) {
      const store = this.getStore()
      store._restoreTrackDirect(this.removedTrack)
    }
  }
}

/**
 * 切换轨道静音命令
 */
export class ToggleTrackMuteCommand extends TimelineCommand {
  private getStore: () => ReturnType<typeof import('@/stores/timeline').useTimelineStore>
  
  constructor(
    getStore: () => ReturnType<typeof import('@/stores/timeline').useTimelineStore>,
    private trackId: string
  ) {
    super(CommandTypes.TOGGLE_TRACK_MUTE, '切换静音')
    this.getStore = getStore
  }
  
  execute(): void {
    const store = this.getStore()
    store._toggleTrackMuteDirect(this.trackId)
  }
  
  undo(): void {
    // 再次切换即可恢复
    const store = this.getStore()
    store._toggleTrackMuteDirect(this.trackId)
  }
}

/**
 * 切换轨道锁定命令
 */
export class ToggleTrackLockCommand extends TimelineCommand {
  private getStore: () => ReturnType<typeof import('@/stores/timeline').useTimelineStore>
  
  constructor(
    getStore: () => ReturnType<typeof import('@/stores/timeline').useTimelineStore>,
    private trackId: string
  ) {
    super(CommandTypes.TOGGLE_TRACK_LOCK, '切换锁定')
    this.getStore = getStore
  }
  
  execute(): void {
    const store = this.getStore()
    store._toggleTrackLockDirect(this.trackId)
  }
  
  undo(): void {
    const store = this.getStore()
    store._toggleTrackLockDirect(this.trackId)
  }
}
