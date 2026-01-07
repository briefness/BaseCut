/**
 * 特效状态管理 (Pinia Store)
 * 
 * 管理每个片段的特效列表，提供增删改查操作
 * 与时间轴和渲染器集成
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { VideoEffect, VideoEffectType } from '@/types/effects'
import { createVideoEffect, VIDEO_EFFECT_PRESETS } from '@/types/effects'

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
   * @param clipId 片段 ID
   */
  function getClipEffects(clipId: string): VideoEffect[] {
    return clipEffects.value.get(clipId) || []
  }
  
  /**
   * 添加特效到片段
   * @param clipId 片段 ID
   * @param effectType 特效类型
   * @param startTime 开始时间（相对于片段）
   * @param duration 持续时间
   * @returns 新创建的特效
   */
  function addEffect(
    clipId: string,
    effectType: VideoEffectType,
    startTime: number = 0,
    duration?: number
  ): VideoEffect {
    // 创建特效实例
    const effect = createVideoEffect(effectType, startTime, duration)
    
    // 设置渲染顺序
    const existing = clipEffects.value.get(clipId) || []
    effect.order = existing.length
    
    // 添加到列表
    const newList = [...existing, effect]
    clipEffects.value.set(clipId, newList)
    
    // 触发响应式更新
    clipEffects.value = new Map(clipEffects.value)
    
    // 选中新创建的特效
    selectedEffectId.value = effect.id
    
    return effect
  }
  
  /**
   * 移除特效
   * @param effectId 特效 ID
   */
  function removeEffect(effectId: string): void {
    for (const [clipId, effects] of clipEffects.value) {
      const index = effects.findIndex(e => e.id === effectId)
      if (index !== -1) {
        effects.splice(index, 1)
        
        // 重新排序
        effects.forEach((e, i) => { e.order = i })
        
        clipEffects.value.set(clipId, [...effects])
        clipEffects.value = new Map(clipEffects.value)
        
        // 清除选中
        if (selectedEffectId.value === effectId) {
          selectedEffectId.value = null
        }
        
        break
      }
    }
  }
  
  /**
   * 更新特效参数
   * @param effectId 特效 ID
   * @param updates 要更新的参数
   */
  function updateEffect(
    effectId: string,
    updates: Partial<Omit<VideoEffect, 'id' | 'type'>>
  ): void {
    for (const [clipId, effects] of clipEffects.value) {
      const effect = effects.find(e => e.id === effectId)
      if (effect) {
        // 合并更新
        Object.assign(effect, updates)
        
        // 如果更新了 params，需要深层合并
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
   * 更新特效参数的单个值
   * @param effectId 特效 ID
   * @param paramName 参数名
   * @param value 新值
   */
  function updateEffectParam(
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
   * 切换特效启用状态
   * @param effectId 特效 ID
   */
  function toggleEffect(effectId: string): void {
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
   * 调整特效顺序
   * @param clipId 片段 ID
   * @param fromIndex 原位置
   * @param toIndex 目标位置
   */
  function reorderEffects(clipId: string, fromIndex: number, toIndex: number): void {
    const effects = clipEffects.value.get(clipId)
    if (!effects) return
    
    // 移动元素
    const [removed] = effects.splice(fromIndex, 1)
    effects.splice(toIndex, 0, removed)
    
    // 重新设置 order
    effects.forEach((e, i) => { e.order = i })
    
    clipEffects.value.set(clipId, [...effects])
    clipEffects.value = new Map(clipEffects.value)
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
    getActiveEffects
  }
})
