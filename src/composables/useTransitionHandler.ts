/**
 * 转场处理 Composable
 * 
 * 从 Player.vue 拆分，负责：
 * - 转场视频预加载
 * - 转场渲染逻辑
 * 
 * @module composables/useTransitionHandler
 */

import { onUnmounted } from 'vue'
import { useTimelineStore } from '@/stores/timeline'
import { useResourceStore } from '@/stores/resource'
import { TRANSITION_PRELOAD_AHEAD } from '@/config/constants'

export function useTransitionHandler() {
  const timelineStore = useTimelineStore()
  const resourceStore = useResourceStore()
  
  let transitionVideoB: HTMLVideoElement | null = null

  /**
   * 初始化转场视频元素
   */
  function init(): HTMLVideoElement {
    transitionVideoB = document.createElement('video')
    transitionVideoB.muted = true
    transitionVideoB.preload = 'auto'
    transitionVideoB.crossOrigin = 'anonymous'
    return transitionVideoB
  }

  /**
   * 获取转场视频元素
   */
  function getTransitionVideo(): HTMLVideoElement | null {
    return transitionVideoB
  }

  /**
   * 检查并预加载即将到来的转场
   * 
   * @param currentTime 当前时间线时间
   */
  function checkPreload(currentTime: number): void {
    if (!transitionVideoB) return

    for (const transition of timelineStore.transitions) {
      const track = timelineStore.tracks.find(t => 
        t.clips.some(c => c.id === transition.clipBId)
      )
      const clipB = track?.clips.find(c => c.id === transition.clipBId)

      if (clipB) {
        const transitionStart = clipB.startTime - transition.duration / 2

        // 如果转场在预加载时间范围内且尚未加载
        if (transitionStart > currentTime && 
            transitionStart < currentTime + TRANSITION_PRELOAD_AHEAD) {
          const materialB = resourceStore.getMaterial(clipB.materialId ?? '')
          const videoUrlB = materialB?.hlsUrl ?? materialB?.blobUrl ?? ''

          if (videoUrlB && transitionVideoB.src !== videoUrlB) {
            console.log('[TransitionHandler] 预加载转场视频:', videoUrlB)
            transitionVideoB.src = videoUrlB
            transitionVideoB.load()
            transitionVideoB.pause()
            transitionVideoB.currentTime = clipB.inPoint
          }
          break
        }
      }
    }
  }

  /**
   * 同步转场视频播放状态
   * 
   * @param clipTime 片段内时间
   * @param isPlaying 是否正在播放
   */
  function syncPlayState(clipTime: number, isPlaying: boolean): void {
    if (!transitionVideoB) return

    if (isPlaying && transitionVideoB.paused) {
      transitionVideoB.play().catch(() => {})
    } else if (!isPlaying && !transitionVideoB.paused) {
      transitionVideoB.pause()
    }

    // 时间漂移修正
    if (Math.abs(transitionVideoB.currentTime - clipTime) > 0.1) {
      transitionVideoB.currentTime = clipTime
    }
  }

  /**
   * 检查转场视频是否就绪
   */
  function isReady(): boolean {
    return transitionVideoB !== null && transitionVideoB.readyState >= 2
  }

  /**
   * 检查转场视频源是否匹配
   */
  function hasSource(url: string): boolean {
    return transitionVideoB !== null && transitionVideoB.src === url
  }

  /**
   * 加载转场视频源
   */
  function loadSource(url: string, startTime: number = 0): void {
    if (!transitionVideoB || !url) return

    if (transitionVideoB.src !== url) {
      transitionVideoB.src = url
      transitionVideoB.load()
    }
    transitionVideoB.currentTime = startTime
  }

  /**
   * 清理资源
   */
  function destroy(): void {
    if (transitionVideoB) {
      transitionVideoB.pause()
      transitionVideoB.src = ''
      transitionVideoB = null
    }
  }

  onUnmounted(() => {
    destroy()
  })

  return {
    init,
    getTransitionVideo,
    checkPreload,
    syncPlayState,
    isReady,
    hasSource,
    loadSource,
    destroy
  }
}
