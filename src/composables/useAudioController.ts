/**
 * 音频控制 Composable
 * 
 * 从 Player.vue 拆分，负责：
 * - 独立音频元素管理
 * - 音频播放同步
 * - 音量控制
 * 
 * @module composables/useAudioController
 */

import { ref, onUnmounted } from 'vue'
import type { Clip } from '@/types'
import { useResourceStore } from '@/stores/resource'
import { useTimelineStore } from '@/stores/timeline'

export function useAudioController() {
  const resourceStore = useResourceStore()
  const timelineStore = useTimelineStore()
  
  let audioElement: HTMLAudioElement | null = null
  const currentMaterialId = ref<string | null>(null)

  /**
   * 初始化音频元素
   */
  function init(): HTMLAudioElement {
    audioElement = document.createElement('audio')
    audioElement.preload = 'auto'
    audioElement.volume = timelineStore.volume
    return audioElement
  }

  /**
   * 更新音频播放状态
   * 
   * @param audioClip 当前活跃的音频片段
   * @param currentTime 当前时间线时间
   */
  function updateAudioState(audioClip: Clip | undefined, currentTime: number): void {
    if (!audioElement) return

    if (audioClip && audioClip.materialId) {
      const material = resourceStore.getMaterial(audioClip.materialId)
      if (!material || material.type !== 'audio') return

      // 计算音量（片段音量 * 全局音量，限制在 0-1）
      const finalVolume = ((audioClip.volume ?? 40) / 100) * timelineStore.volume
      audioElement.volume = Math.min(1.0, Math.max(0, finalVolume))

      const clipTime = currentTime - audioClip.startTime + audioClip.inPoint

      // 检查是否需要加载新源
      if (currentMaterialId.value !== audioClip.materialId) {
        console.log('[AudioController] 加载音频素材:', material.name)
        audioElement.src = material.blobUrl || ''
        currentMaterialId.value = audioClip.materialId
        audioElement.load()
        
        // 加载完成后设置时间
        audioElement.addEventListener('loadeddata', () => {
          if (audioElement) {
            audioElement.currentTime = clipTime
          }
        }, { once: true })
      }

      // 同步播放状态
      if (timelineStore.isPlaying) {
        if (audioElement.paused && audioElement.readyState >= 2) {
          audioElement.currentTime = clipTime
          audioElement.play().catch(e => {
            console.warn('[AudioController] 播放失败:', e)
          })
        }
      } else if (!audioElement.paused) {
        audioElement.pause()
      }
    } else if (audioElement && !audioElement.paused) {
      // 没有音频片段时暂停
      audioElement.pause()
      currentMaterialId.value = null
    }
  }

  /**
   * 同步音量
   */
  function syncVolume(): void {
    if (audioElement) {
      audioElement.volume = Math.min(1.0, Math.max(0, timelineStore.volume))
    }
  }

  /**
   * 获取当前音频时间（用于时间线同步）
   */
  function getCurrentTime(): number | null {
    if (!audioElement || audioElement.paused) return null
    return audioElement.currentTime
  }

  /**
   * 检查音频是否正在播放
   */
  function isPlaying(): boolean {
    return audioElement !== null && !audioElement.paused
  }

  /**
   * 暂停音频
   */
  function pause(): void {
    audioElement?.pause()
  }

  /**
   * 清理资源
   */
  function destroy(): void {
    if (audioElement) {
      audioElement.pause()
      audioElement.src = ''
      audioElement = null
    }
    currentMaterialId.value = null
  }

  onUnmounted(() => {
    destroy()
  })

  return {
    init,
    updateAudioState,
    syncVolume,
    getCurrentTime,
    isPlaying,
    pause,
    destroy,
    currentMaterialId
  }
}
