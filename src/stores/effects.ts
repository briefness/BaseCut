/**
 * 特效状态管理 (Pinia Store)
 * 
 * 管理每个片段的特效列表，提供增删改查操作
 * 与时间轴和渲染器集成
 * 
 * 所有修改操作通过命令模式实现撤销/重做
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { VideoEffect, VideoEffectType } from '@/types/effects'
import { createVideoEffect, VIDEO_EFFECT_PRESETS } from '@/types/effects'
import { useHistoryStore } from './history'
import {
  AddEffectCommand,
  RemoveEffectCommand,
  UpdateEffectCommand,
  UpdateEffectParamCommand,
  ToggleEffectCommand,
  ReorderEffectsCommand
} from '@/engine/commands'

/**
 * 片段特效映射
 * key: clipId, value: 特效列表
 */
type ClipEffectsMap = Map<string, VideoEffect[]>

export const useEffectsStore = defineStore('effects', () => {
  // ==================== 状态 ====================
  
  /**
   * 片段特效映射
   */
  const clipEffects = ref<ClipEffectsMap>(new Map())
  
  /**
   * 当前选中的特效 ID
   */
  const selectedEffectId = ref<string | null>(null)

  // ==================== 计算属性 ====================
  
  /**
   * 所有特效预设列表
   */
  const effectPresets = computed(() => VIDEO_EFFECT_PRESETS)
  
  /**
   * 当前选中的特效
   */
  const selectedEffect = computed(() => {
    if (!selectedEffectId.value) return null
    
    for (const effects of clipEffects.value.values()) {
      const found = effects.find(e => e.id === selectedEffectId.value)
      if (found) return found
    }
    return null
  })

  // ==================== 操作方法 ====================
  
  /**
   * 获取片段的所有特效
   */
  function getClipEffects(clipId: string): VideoEffect[] {
    return clipEffects.value.get(clipId) || []
  }
  
  /**
   * 查找特效（返回特效和所属 clipId）
   */
  function _findEffectDirect(effectId: string): { effect: VideoEffect | null; clipId: string | null } {
    for (const [clipId, effects] of clipEffects.value) {
      const effect = effects.find(e => e.id === effectId)
      if (effect) {
        return { effect, clipId }
      }
    }
    return { effect: null, clipId: null }
  }
  
  /**
   * 直接添加特效（内部方法）
   */
  function _addEffectDirect(
    clipId: string,
    effectType: VideoEffectType,
    startTime: number = 0,
    duration?: number
  ): VideoEffect {
    const effect = createVideoEffect(effectType, startTime, duration)
    const existing = clipEffects.value.get(clipId) || []
    effect.order = existing.length
    const newList = [...existing, effect]
    clipEffects.value.set(clipId, newList)
    clipEffects.value = new Map(clipEffects.value)
    selectedEffectId.value = effect.id
    return effect
  }
  
  /**
   * 直接移除特效（内部方法）
   */
  function _removeEffectDirect(effectId: string): void {
    for (const [clipId, effects] of clipEffects.value) {
      const index = effects.findIndex(e => e.id === effectId)
      if (index !== -1) {
        effects.splice(index, 1)
        effects.forEach((e, i) => { e.order = i })
        clipEffects.value.set(clipId, [...effects])
        clipEffects.value = new Map(clipEffects.value)
        if (selectedEffectId.value === effectId) {
          selectedEffectId.value = null
        }
        break
      }
    }
  }
  
  /**
   * 恢复特效（用于撤销删除）
   */
  function _restoreEffectDirect(clipId: string, effect: VideoEffect): void {
    const existing = clipEffects.value.get(clipId) || []
    const newList = [...existing, effect]
    newList.forEach((e, i) => { e.order = i })
    clipEffects.value.set(clipId, newList)
    clipEffects.value = new Map(clipEffects.value)
  }
  
  /**
   * 直接更新特效（内部方法）
   */
  function _updateEffectDirect(
    effectId: string,
    updates: Partial<Omit<VideoEffect, 'id' | 'type'>>
  ): void {
    for (const [clipId, effects] of clipEffects.value) {
      const effect = effects.find(e => e.id === effectId)
      if (effect) {
        Object.assign(effect, updates)
        if (updates.params) {
          effect.params = { ...effect.params, ...updates.params }
        }
        clipEffects.value.set(clipId, [...effects])
        clipEffects.value = new Map(clipEffects.value)
        break
      }
    }
  }
  
  /**
   * 直接更新特效参数（内部方法）
   */
  function _updateEffectParamDirect(
    effectId: string,
    paramName: string,
    value: number | string | boolean
  ): void {
    for (const [clipId, effects] of clipEffects.value) {
      const effect = effects.find(e => e.id === effectId)
      if (effect) {
        effect.params[paramName] = value
        clipEffects.value.set(clipId, [...effects])
        clipEffects.value = new Map(clipEffects.value)
        break
      }
    }
  }
  
  /**
   * 直接切换特效启用状态（内部方法）
   */
  function _toggleEffectDirect(effectId: string): void {
    for (const [clipId, effects] of clipEffects.value) {
      const effect = effects.find(e => e.id === effectId)
      if (effect) {
        effect.enabled = !effect.enabled
        clipEffects.value.set(clipId, [...effects])
        clipEffects.value = new Map(clipEffects.value)
        break
      }
    }
  }
  
  /**
   * 直接调整特效顺序（内部方法）
   */
  function _reorderEffectsDirect(clipId: string, fromIndex: number, toIndex: number): void {
    const effects = clipEffects.value.get(clipId)
    if (!effects) return
    const [removed] = effects.splice(fromIndex, 1)
    effects.splice(toIndex, 0, removed)
    effects.forEach((e, i) => { e.order = i })
    clipEffects.value.set(clipId, [...effects])
    clipEffects.value = new Map(clipEffects.value)
  }
  
  // ==================== 获取 History Store ====================
  
  /**
   * 惰性获取 History Store（避免循环依赖）
   */
  function getHistoryStore() {
    return useHistoryStore()
  }
  
  /**
   * 获取当前 Store 实例（供命令使用）
   */
  function getThisStore() {
    return useEffectsStore()
  }
  
  // ==================== 公共方法（记录历史） ====================
  
  /**
   * 添加特效到片段（记录历史）
   */
  function addEffect(
    clipId: string,
    effectType: VideoEffectType,
    startTime: number = 0,
    duration?: number
  ): VideoEffect {
    const command = new AddEffectCommand(getThisStore, clipId, effectType, startTime, duration)
    getHistoryStore().execute(command)
    // 返回新创建的特效
    const effects = clipEffects.value.get(clipId) || []
    return effects[effects.length - 1]
  }
  
  /**
   * 移除特效（记录历史）
   */
  function removeEffect(effectId: string): void {
    const command = new RemoveEffectCommand(getThisStore, effectId)
    getHistoryStore().execute(command)
  }
  
  /**
   * 更新特效参数（记录历史）
   */
  function updateEffect(
    effectId: string,
    updates: Partial<Omit<VideoEffect, 'id' | 'type'>>
  ): void {
    const command = new UpdateEffectCommand(getThisStore, effectId, updates)
    getHistoryStore().execute(command)
  }
  
  /**
   * 更新特效参数的单个值（记录历史）
   */
  function updateEffectParam(
    effectId: string,
    paramName: string,
    value: number | string | boolean
  ): void {
    const command = new UpdateEffectParamCommand(getThisStore, effectId, paramName, value)
    getHistoryStore().execute(command)
  }
  
  /**
   * 切换特效启用状态（记录历史）
   */
  function toggleEffect(effectId: string): void {
    const command = new ToggleEffectCommand(getThisStore, effectId)
    getHistoryStore().execute(command)
  }
  
  /**
   * 调整特效顺序（记录历史）
   */
  function reorderEffects(clipId: string, fromIndex: number, toIndex: number): void {
    const command = new ReorderEffectsCommand(getThisStore, clipId, fromIndex, toIndex)
    getHistoryStore().execute(command)
  }
  
  /**
   * 复制特效到其他片段
   * @param effectId 特效 ID
   * @param targetClipId 目标片段 ID
   */
  function copyEffectToClip(effectId: string, targetClipId: string): VideoEffect | null {
    // 找到原特效
    let sourceEffect: VideoEffect | null = null
    for (const effects of clipEffects.value.values()) {
      sourceEffect = effects.find(e => e.id === effectId) || null
      if (sourceEffect) break
    }
    
    if (!sourceEffect) return null
    
    // 创建副本
    const newEffect: VideoEffect = {
      ...sourceEffect,
      id: crypto.randomUUID(),
      params: { ...sourceEffect.params }
    }
    
    // 添加到目标片段
    const existing = clipEffects.value.get(targetClipId) || []
    newEffect.order = existing.length
    
    clipEffects.value.set(targetClipId, [...existing, newEffect])
    clipEffects.value = new Map(clipEffects.value)
    
    return newEffect
  }
  
  /**
   * 选中特效
   * @param effectId 特效 ID
   */
  function selectEffect(effectId: string | null): void {
    selectedEffectId.value = effectId
  }
  
  /**
   * 清除片段的所有特效
   * @param clipId 片段 ID
   */
  function clearClipEffects(clipId: string): void {
    clipEffects.value.delete(clipId)
    clipEffects.value = new Map(clipEffects.value)
    selectedEffectId.value = null
  }

  /**
   * 获取某个时间点的活跃特效
   * @param clipId 片段 ID
   * @param timeInClip 片段内时间
   */
  function getActiveEffects(clipId: string, timeInClip: number): VideoEffect[] {
    const effects = clipEffects.value.get(clipId) || []
    
    return effects.filter(e => {
      if (!e.enabled) return false
      
      const start = e.startTime
      const end = e.startTime + e.duration
      
      return timeInClip >= start && timeInClip <= end
    })
  }

  // ==================== 导出 ====================
  
  return {
    // 状态
    clipEffects,
    selectedEffectId,
    
    // 计算属性
    effectPresets,
    selectedEffect,
    
    // 方法
    getClipEffects,
    addEffect,
    removeEffect,
    updateEffect,
    updateEffectParam,
    toggleEffect,
    reorderEffects,
    copyEffectToClip,
    selectEffect,
    clearClipEffects,
    getActiveEffects,
    // 内部直接方法（供命令调用）
    _findEffectDirect,
    _addEffectDirect,
    _removeEffectDirect,
    _restoreEffectDirect,
    _updateEffectDirect,
    _updateEffectParamDirect,
    _toggleEffectDirect,
    _reorderEffectsDirect
  }
})
