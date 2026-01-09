/**
 * 动画状态管理
 * 
 * 使用 Pinia 管理关键帧动画的状态
 * 提供添加、删除、更新关键帧的操作
 * 
 * 所有修改操作通过命令模式实现撤销/重做
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type {
  ClipAnimation,
  AnimationTrack,
  Keyframe,
  AnimatableProperty,
  CreateKeyframeParams,
  UpdateKeyframeParams
} from '@/types/animation'
import {
  generateKeyframeId,
  generateTrackId,
  sortKeyframes,
  createDefaultEasing
} from '@/engine/AnimationEngine'
import { useHistoryStore } from './history'
import {
  AddKeyframeCommand,
  RemoveKeyframeCommand,
  UpdateKeyframeCommand
} from '@/engine/commands'

export const useAnimationStore = defineStore('animation', () => {
  // ==================== 状态 ====================
  
  /**
   * 动画数据映射
   * key: clipId, value: ClipAnimation
   */
  const animations = ref<Map<string, ClipAnimation>>(new Map())
  
  // ==================== Getters ====================
  
  /**
   * 获取片段的动画配置
   */
  const getClipAnimation = computed(() => {
    return (clipId: string): ClipAnimation | null => {
      return animations.value.get(clipId) || null
    }
  })
  
  /**
   * 获取片段的某个属性轨道
   */
  const getTrack = computed(() => {
    return (clipId: string, property: AnimatableProperty): AnimationTrack | null => {
      const animation = animations.value.get(clipId)
      if (!animation) return null
      return animation.tracks.find(t => t.property === property) || null
    }
  })
  
  /**
   * 检查片段是否有动画
   */
  const hasAnimation = computed(() => {
    return (clipId: string): boolean => {
      const animation = animations.value.get(clipId)
      if (!animation) return false
      return animation.tracks.some(t => t.enabled && t.keyframes.length > 0)
    }
  })
  
  /**
   * 获取片段的所有动画属性
   */
  const getAnimatedProperties = computed(() => {
    return (clipId: string): AnimatableProperty[] => {
      const animation = animations.value.get(clipId)
      if (!animation) return []
      return animation.tracks
        .filter(t => t.enabled && t.keyframes.length > 0)
        .map(t => t.property)
    }
  })
  // ==================== Actions ====================
  
  /**
   * 确保片段有动画配置
   */
  function ensureAnimation(clipId: string): ClipAnimation {
    let animation = animations.value.get(clipId)
    if (!animation) {
      animation = {
        clipId,
        tracks: []
      }
      animations.value.set(clipId, animation)
    }
    return animation
  }
  
  /**
   * 确保属性有轨道
   */
  function ensureTrack(clipId: string, property: AnimatableProperty): AnimationTrack {
    const animation = ensureAnimation(clipId)
    let track = animation.tracks.find(t => t.property === property)
    if (!track) {
      track = {
        id: generateTrackId(),
        property,
        keyframes: [],
        enabled: true
      }
      animation.tracks.push(track)
    }
    return track
  }
  
  // ==================== 直接方法（供命令调用） ====================
  
  /**
   * 直接添加关键帧（内部方法）
   */
  function _addKeyframeDirect(
    clipId: string,
    property: AnimatableProperty,
    params: CreateKeyframeParams
  ): Keyframe {
    const track = ensureTrack(clipId, property)
    const existingIndex = track.keyframes.findIndex(k => Math.abs(k.time - params.time) < 0.001)
    
    const keyframe: Keyframe = {
      id: generateKeyframeId(),
      time: params.time,
      value: params.value,
      easing: params.easing || createDefaultEasing()
    }
    
    if (existingIndex >= 0) {
      track.keyframes[existingIndex] = keyframe
    } else {
      track.keyframes.push(keyframe)
    }
    
    track.keyframes = sortKeyframes(track.keyframes)
    return keyframe
  }
  
  /**
   * 直接删除关键帧（内部方法）
   */
  function _removeKeyframeDirect(
    clipId: string,
    property: AnimatableProperty,
    keyframeId: string
  ): boolean {
    const animation = animations.value.get(clipId)
    if (!animation) return false
    
    const track = animation.tracks.find(t => t.property === property)
    if (!track) return false
    
    const index = track.keyframes.findIndex(k => k.id === keyframeId)
    if (index < 0) return false
    
    track.keyframes.splice(index, 1)
    return true
  }
  
  /**
   * 直接更新关键帧（内部方法）
   */
  function _updateKeyframeDirect(
    clipId: string,
    property: AnimatableProperty,
    keyframeId: string,
    updates: UpdateKeyframeParams
  ): boolean {
    const animation = animations.value.get(clipId)
    if (!animation) return false
    
    const track = animation.tracks.find(t => t.property === property)
    if (!track) return false
    
    const keyframe = track.keyframes.find(k => k.id === keyframeId)
    if (!keyframe) return false
    
    if (updates.time !== undefined) keyframe.time = updates.time
    if (updates.value !== undefined) keyframe.value = updates.value
    if (updates.easing !== undefined) keyframe.easing = updates.easing
    
    if (updates.time !== undefined) {
      track.keyframes = sortKeyframes(track.keyframes)
    }
    
    return true
  }
  
  // ==================== 获取 History Store ====================
  
  /**
   * 惰性获取 History Store
   */
  function getHistoryStore() {
    return useHistoryStore()
  }
  
  /**
   * 获取当前 Store 实例
   */
  function getThisStore() {
    return useAnimationStore()
  }
  
  // ==================== 公共方法（记录历史） ====================
  
  /**
   * 添加关键帧（记录历史）
   */
  function addKeyframe(
    clipId: string,
    property: AnimatableProperty,
    params: CreateKeyframeParams
  ): Keyframe {
    const command = new AddKeyframeCommand(getThisStore, clipId, property, params)
    getHistoryStore().execute(command)
    // 返回新创建的关键帧
    const track = getTrack.value(clipId, property)
    return track!.keyframes[track!.keyframes.length - 1]
  }
  
  /**
   * 删除关键帧（记录历史）
   */
  function removeKeyframe(
    clipId: string,
    property: AnimatableProperty,
    keyframeId: string
  ): boolean {
    const command = new RemoveKeyframeCommand(getThisStore, clipId, property, keyframeId)
    getHistoryStore().execute(command)
    return true
  }
  
  /**
   * 更新关键帧（记录历史）
   */
  function updateKeyframe(
    clipId: string,
    property: AnimatableProperty,
    keyframeId: string,
    updates: UpdateKeyframeParams
  ): boolean {
    const command = new UpdateKeyframeCommand(getThisStore, clipId, property, keyframeId, updates)
    getHistoryStore().execute(command)
    return true
  }
  
  /**
   * 删除片段的所有动画
   */
  function removeClipAnimation(clipId: string): boolean {
    return animations.value.delete(clipId)
  }
  
  /**
   * 设置轨道启用状态
   */
  function setTrackEnabled(
    clipId: string,
    property: AnimatableProperty,
    enabled: boolean
  ): boolean {
    const animation = animations.value.get(clipId)
    if (!animation) return false
    
    const track = animation.tracks.find(t => t.property === property)
    if (!track) return false
    
    track.enabled = enabled
    return true
  }
  
  /**
   * 复制动画到另一个片段
   */
  function copyAnimation(sourceClipId: string, targetClipId: string): boolean {
    const sourceAnimation = animations.value.get(sourceClipId)
    if (!sourceAnimation) return false
    
    // 深拷贝
    const newAnimation: ClipAnimation = {
      clipId: targetClipId,
      tracks: sourceAnimation.tracks.map(track => ({
        id: generateTrackId(),
        property: track.property,
        enabled: track.enabled,
        keyframes: track.keyframes.map(kf => ({
          id: generateKeyframeId(),
          time: kf.time,
          value: kf.value,
          easing: { ...kf.easing }
        }))
      }))
    }
    
    animations.value.set(targetClipId, newAnimation)
    return true
  }
  
  /**
   * 清除所有动画
   */
  function clearAll(): void {
    animations.value.clear()
  }
  
  /**
   * 导出动画数据（用于保存项目）
   */
  function exportAnimations(): Record<string, ClipAnimation> {
    const result: Record<string, ClipAnimation> = {}
    animations.value.forEach((animation, clipId) => {
      result[clipId] = animation
    })
    return result
  }
  
  /**
   * 导入动画数据（用于加载项目）
   */
  function importAnimations(data: Record<string, ClipAnimation>): void {
    animations.value.clear()
    Object.entries(data).forEach(([clipId, animation]) => {
      animations.value.set(clipId, animation)
    })
  }
  
  // ==================== 返回 ====================
  
  return {
    // 状态
    animations,
    
    // Getters
    getClipAnimation,
    getTrack,
    hasAnimation,
    getAnimatedProperties,
    
    // Actions
    addKeyframe,
    removeKeyframe,
    updateKeyframe,
    removeClipAnimation,
    setTrackEnabled,
    copyAnimation,
    clearAll,
    exportAnimations,
    importAnimations,
    // 内部直接方法（供命令调用）
    _addKeyframeDirect,
    _removeKeyframeDirect,
    _updateKeyframeDirect
  }
})
