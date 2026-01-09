/**
 * 特效操作命令
 * 
 * 实现特效相关的可撤销命令：
 * - 添加、删除、更新特效
 * - 切换特效启用状态
 * - 调整特效顺序
 */

import type { HistoryCommand } from '../HistoryTypes'
import { generateCommandId, CommandTypes } from '../HistoryTypes'
import type { VideoEffect, VideoEffectType } from '@/types/effects'

// ==================== 命令基类 ====================

abstract class EffectCommand implements HistoryCommand {
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

// ==================== 特效命令 ====================

/**
 * 添加特效命令
 */
export class AddEffectCommand extends EffectCommand {
  private getStore: () => ReturnType<typeof import('@/stores/effects').useEffectsStore>
  
  /** 创建的特效 ID */
  private createdEffectId: string | null = null
  
  constructor(
    getStore: () => ReturnType<typeof import('@/stores/effects').useEffectsStore>,
    private clipId: string,
    private effectType: VideoEffectType,
    private startTime: number = 0,
    private duration?: number
  ) {
    super(CommandTypes.ADD_EFFECT, '添加特效')
    this.getStore = getStore
  }
  
  execute(): void {
    const store = this.getStore()
    const effect = store._addEffectDirect(
      this.clipId,
      this.effectType,
      this.startTime,
      this.duration
    )
    this.createdEffectId = effect.id
  }
  
  undo(): void {
    if (this.createdEffectId) {
      const store = this.getStore()
      store._removeEffectDirect(this.createdEffectId)
    }
  }
}

/**
 * 删除特效命令
 */
export class RemoveEffectCommand extends EffectCommand {
  private getStore: () => ReturnType<typeof import('@/stores/effects').useEffectsStore>
  
  /** 被删除的特效数据 */
  private removedEffect: VideoEffect | null = null
  private removedFromClipId: string | null = null
  
  constructor(
    getStore: () => ReturnType<typeof import('@/stores/effects').useEffectsStore>,
    private effectId: string
  ) {
    super(CommandTypes.REMOVE_EFFECT, '删除特效')
    this.getStore = getStore
  }
  
  execute(): void {
    const store = this.getStore()
    
    // 保存被删除的特效数据
    const { effect, clipId } = store._findEffectDirect(this.effectId)
    if (effect && clipId) {
      this.removedEffect = { ...effect, params: { ...effect.params } }
      this.removedFromClipId = clipId
    }
    
    store._removeEffectDirect(this.effectId)
  }
  
  undo(): void {
    if (this.removedEffect && this.removedFromClipId) {
      const store = this.getStore()
      store._restoreEffectDirect(this.removedFromClipId, this.removedEffect)
    }
  }
}

/**
 * 更新特效命令
 */
export class UpdateEffectCommand extends EffectCommand {
  private getStore: () => ReturnType<typeof import('@/stores/effects').useEffectsStore>
  
  /** 旧值 */
  private oldValues: Partial<VideoEffect> | null = null
  
  constructor(
    getStore: () => ReturnType<typeof import('@/stores/effects').useEffectsStore>,
    private effectId: string,
    private updates: Partial<Omit<VideoEffect, 'id' | 'type'>>
  ) {
    super(CommandTypes.UPDATE_EFFECT, '更新特效')
    this.getStore = getStore
  }
  
  execute(): void {
    const store = this.getStore()
    const { effect } = store._findEffectDirect(this.effectId)
    
    if (effect && !this.oldValues) {
      // 保存旧值
      this.oldValues = {}
      for (const key of Object.keys(this.updates) as (keyof VideoEffect)[]) {
        if (key === 'params') {
          this.oldValues.params = { ...effect.params }
        } else {
          (this.oldValues as Record<string, unknown>)[key] = effect[key]
        }
      }
    }
    
    store._updateEffectDirect(this.effectId, this.updates)
  }
  
  undo(): void {
    if (this.oldValues) {
      const store = this.getStore()
      store._updateEffectDirect(this.effectId, this.oldValues as Partial<Omit<VideoEffect, 'id' | 'type'>>)
    }
  }
  
  canMergeWith(other: HistoryCommand): boolean {
    if (!(other instanceof UpdateEffectCommand)) return false
    return other.effectId === this.effectId
  }
  
  mergeWith(other: HistoryCommand): HistoryCommand {
    const otherCmd = other as UpdateEffectCommand
    
    const merged = new UpdateEffectCommand(
      this.getStore,
      this.effectId,
      { ...this.updates, ...otherCmd.updates }
    )
    merged.oldValues = this.oldValues
    
    return merged
  }
}

/**
 * 更新特效参数命令
 */
export class UpdateEffectParamCommand extends EffectCommand {
  private getStore: () => ReturnType<typeof import('@/stores/effects').useEffectsStore>
  
  /** 旧参数值 */
  private oldValue: number | string | boolean | null = null
  
  constructor(
    getStore: () => ReturnType<typeof import('@/stores/effects').useEffectsStore>,
    private effectId: string,
    private paramName: string,
    private newValue: number | string | boolean
  ) {
    super(CommandTypes.UPDATE_EFFECT, '更新特效参数')
    this.getStore = getStore
  }
  
  execute(): void {
    const store = this.getStore()
    const { effect } = store._findEffectDirect(this.effectId)
    
    if (effect && this.oldValue === null) {
      this.oldValue = effect.params[this.paramName]
    }
    
    store._updateEffectParamDirect(this.effectId, this.paramName, this.newValue)
  }
  
  undo(): void {
    if (this.oldValue !== null) {
      const store = this.getStore()
      store._updateEffectParamDirect(this.effectId, this.paramName, this.oldValue)
    }
  }
  
  canMergeWith(other: HistoryCommand): boolean {
    if (!(other instanceof UpdateEffectParamCommand)) return false
    return other.effectId === this.effectId && other.paramName === this.paramName
  }
  
  mergeWith(other: HistoryCommand): HistoryCommand {
    const otherCmd = other as UpdateEffectParamCommand
    
    const merged = new UpdateEffectParamCommand(
      this.getStore,
      this.effectId,
      this.paramName,
      otherCmd.newValue
    )
    merged.oldValue = this.oldValue
    
    return merged
  }
}

/**
 * 切换特效启用状态命令
 */
export class ToggleEffectCommand extends EffectCommand {
  private getStore: () => ReturnType<typeof import('@/stores/effects').useEffectsStore>
  
  constructor(
    getStore: () => ReturnType<typeof import('@/stores/effects').useEffectsStore>,
    private effectId: string
  ) {
    super(CommandTypes.TOGGLE_EFFECT, '切换特效启用')
    this.getStore = getStore
  }
  
  execute(): void {
    const store = this.getStore()
    store._toggleEffectDirect(this.effectId)
  }
  
  undo(): void {
    // 再次切换即恢复
    const store = this.getStore()
    store._toggleEffectDirect(this.effectId)
  }
}

/**
 * 调整特效顺序命令
 */
export class ReorderEffectsCommand extends EffectCommand {
  private getStore: () => ReturnType<typeof import('@/stores/effects').useEffectsStore>
  
  constructor(
    getStore: () => ReturnType<typeof import('@/stores/effects').useEffectsStore>,
    private clipId: string,
    private fromIndex: number,
    private toIndex: number
  ) {
    super(CommandTypes.REORDER_EFFECTS, '调整特效顺序')
    this.getStore = getStore
  }
  
  execute(): void {
    const store = this.getStore()
    store._reorderEffectsDirect(this.clipId, this.fromIndex, this.toIndex)
  }
  
  undo(): void {
    const store = this.getStore()
    // 逆向移动恢复原顺序
    store._reorderEffectsDirect(this.clipId, this.toIndex, this.fromIndex)
  }
}
