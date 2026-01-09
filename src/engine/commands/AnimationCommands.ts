/**
 * 动画操作命令
 * 
 * 实现关键帧动画相关的可撤销命令：
 * - 添加、删除、更新关键帧
 */

import type { HistoryCommand } from '../HistoryTypes'
import { generateCommandId, CommandTypes } from '../HistoryTypes'
import type { 
  Keyframe, 
  AnimatableProperty,
  CreateKeyframeParams,
  UpdateKeyframeParams 
} from '@/types/animation'

// ==================== 命令基类 ====================

abstract class AnimationCommand implements HistoryCommand {
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

// ==================== 动画命令 ====================

/**
 * 添加关键帧命令
 */
export class AddKeyframeCommand extends AnimationCommand {
  private getStore: () => ReturnType<typeof import('@/stores/animation').useAnimationStore>
  
  /** 创建的关键帧 ID */
  private createdKeyframeId: string | null = null
  
  constructor(
    getStore: () => ReturnType<typeof import('@/stores/animation').useAnimationStore>,
    private clipId: string,
    private property: AnimatableProperty,
    private params: CreateKeyframeParams
  ) {
    super(CommandTypes.ADD_KEYFRAME, '添加关键帧')
    this.getStore = getStore
  }
  
  execute(): void {
    const store = this.getStore()
    const keyframe = store._addKeyframeDirect(this.clipId, this.property, this.params)
    this.createdKeyframeId = keyframe.id
  }
  
  undo(): void {
    if (this.createdKeyframeId) {
      const store = this.getStore()
      store._removeKeyframeDirect(this.clipId, this.property, this.createdKeyframeId)
    }
  }
}

/**
 * 删除关键帧命令
 */
export class RemoveKeyframeCommand extends AnimationCommand {
  private getStore: () => ReturnType<typeof import('@/stores/animation').useAnimationStore>
  
  /** 被删除的关键帧数据 */
  private removedKeyframe: Keyframe | null = null
  
  constructor(
    getStore: () => ReturnType<typeof import('@/stores/animation').useAnimationStore>,
    private clipId: string,
    private property: AnimatableProperty,
    private keyframeId: string
  ) {
    super(CommandTypes.REMOVE_KEYFRAME, '删除关键帧')
    this.getStore = getStore
  }
  
  execute(): void {
    const store = this.getStore()
    
    // 保存关键帧数据
    const track = store.getTrack(this.clipId, this.property)
    if (track) {
      const keyframe = track.keyframes.find(k => k.id === this.keyframeId)
      if (keyframe) {
        this.removedKeyframe = { ...keyframe, easing: { ...keyframe.easing } }
      }
    }
    
    store._removeKeyframeDirect(this.clipId, this.property, this.keyframeId)
  }
  
  undo(): void {
    if (this.removedKeyframe) {
      const store = this.getStore()
      store._addKeyframeDirect(this.clipId, this.property, {
        time: this.removedKeyframe.time,
        value: this.removedKeyframe.value,
        easing: this.removedKeyframe.easing
      })
    }
  }
}

/**
 * 更新关键帧命令
 */
export class UpdateKeyframeCommand extends AnimationCommand {
  private getStore: () => ReturnType<typeof import('@/stores/animation').useAnimationStore>
  
  /** 旧关键帧数据 */
  private oldParams: UpdateKeyframeParams | null = null
  
  constructor(
    getStore: () => ReturnType<typeof import('@/stores/animation').useAnimationStore>,
    private clipId: string,
    private property: AnimatableProperty,
    private keyframeId: string,
    private updates: UpdateKeyframeParams
  ) {
    super(CommandTypes.UPDATE_KEYFRAME, '更新关键帧')
    this.getStore = getStore
  }
  
  execute(): void {
    const store = this.getStore()
    
    // 保存旧值
    if (!this.oldParams) {
      const track = store.getTrack(this.clipId, this.property)
      if (track) {
        const keyframe = track.keyframes.find(k => k.id === this.keyframeId)
        if (keyframe) {
          this.oldParams = {}
          if (this.updates.time !== undefined) {
            this.oldParams.time = keyframe.time
          }
          if (this.updates.value !== undefined) {
            this.oldParams.value = keyframe.value
          }
          if (this.updates.easing !== undefined) {
            this.oldParams.easing = { ...keyframe.easing }
          }
        }
      }
    }
    
    store._updateKeyframeDirect(this.clipId, this.property, this.keyframeId, this.updates)
  }
  
  undo(): void {
    if (this.oldParams) {
      const store = this.getStore()
      store._updateKeyframeDirect(this.clipId, this.property, this.keyframeId, this.oldParams)
    }
  }
  
  canMergeWith(other: HistoryCommand): boolean {
    if (!(other instanceof UpdateKeyframeCommand)) return false
    return (
      other.clipId === this.clipId &&
      other.property === this.property &&
      other.keyframeId === this.keyframeId
    )
  }
  
  mergeWith(other: HistoryCommand): HistoryCommand {
    const otherCmd = other as UpdateKeyframeCommand
    
    const merged = new UpdateKeyframeCommand(
      this.getStore,
      this.clipId,
      this.property,
      this.keyframeId,
      { ...this.updates, ...otherCmd.updates }
    )
    merged.oldParams = this.oldParams
    
    return merged
  }
}
