/**
 * 转场操作模块
 * 包含转场效果的增删查
 * 
 * @module stores/timeline/transitionOperations
 */

import type { Transition, TransitionType, Clip } from '@/types'
import type { TimelineState } from './state'

/**
 * 创建转场操作方法
 * 
 * @param state 时间线状态
 */
export function createTransitionOperations(state: TimelineState) {
  
  /**
   * 添加转场效果
   */
  function addTransition(
    clipAId: string, 
    clipBId: string, 
    type: TransitionType, 
    duration: number = 0.5
  ): Transition | null {
    // 验证两个片段存在
    let clipA: Clip | undefined
    let clipB: Clip | undefined
    
    for (const track of state.tracks.value) {
      for (const clip of track.clips) {
        if (clip.id === clipAId) clipA = clip
        if (clip.id === clipBId) clipB = clip
      }
    }
    
    if (!clipA || !clipB) {
      console.warn('[Timeline] 转场片段不存在')
      return null
    }
    
    // 检查是否已存在转场
    const existing = state.transitions.value.find(
      t => t.clipAId === clipAId && t.clipBId === clipBId
    )
    if (existing) {
      // 更新现有转场
      existing.type = type
      existing.duration = duration
      return existing
    }
    
    // 创建新转场
    const transition: Transition = {
      id: crypto.randomUUID(),
      type,
      duration,
      clipAId,
      clipBId
    }
    
    state.transitions.value.push(transition)
    console.log(`[Timeline] 添加转场: ${type}, 时长: ${duration}s`)
    return transition
  }
  
  /**
   * 移除转场效果
   */
  function removeTransition(transitionId: string): void {
    const index = state.transitions.value.findIndex(t => t.id === transitionId)
    if (index !== -1) {
      state.transitions.value.splice(index, 1)
      console.log('[Timeline] 移除转场')
    }
  }
  
  /**
   * 获取两个片段之间的转场
   */
  function getTransitionBetween(clipAId: string, clipBId: string): Transition | null {
    return state.transitions.value.find(
      t => t.clipAId === clipAId && t.clipBId === clipBId
    ) ?? null
  }
  
  /**
   * 获取指定时间点的转场信息
   * @returns 转场信息和进度，如果不在转场区域则返回 null
   */
  function getTransitionAt(time: number): { 
    transition: Transition
    progress: number
    clipA: Clip
    clipB: Clip 
  } | null {
    // 快速检查：没有转场直接返回
    if (state.transitions.value.length === 0) return null
    
    // 构建片段查找缓存（避免重复遍历）
    const clipMap = new Map<string, Clip>()
    for (const track of state.tracks.value) {
      for (const clip of track.clips) {
        clipMap.set(clip.id, clip)
      }
    }
    
    for (const transition of state.transitions.value) {
      const clipA = clipMap.get(transition.clipAId)
      const clipB = clipMap.get(transition.clipBId)
      
      if (!clipA || !clipB) continue
      
      // 转场区域计算
      const clipBStart = clipB.startTime
      const transitionStart = clipBStart - transition.duration / 2
      const transitionEnd = clipBStart + transition.duration / 2
      
      if (time >= transitionStart && time < transitionEnd) {
        const progress = (time - transitionStart) / transition.duration
        return { transition, progress, clipA, clipB }
      }
    }
    
    return null
  }

  return {
    addTransition,
    removeTransition,
    getTransitionBetween,
    getTransitionAt
  }
}
