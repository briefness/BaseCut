/**
 * usePlayerWatchers - 播放器监听器组合式函数
 * 
 * 优化策略：
 * 1. 合并相关的 watch，减少响应式开销
 * 2. 使用防抖处理高频更新
 * 3. 统一管理 Leafer 同步逻辑
 * 
 * @module composables/usePlayerWatchers
 */

import { watch, type Ref, type ComputedRef } from 'vue'
import type { Clip } from '@/types'

// 简单的防抖函数
function debounce<T extends (...args: never[]) => void>(
  fn: T, 
  delay: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}

/**
 * 播放器监听器配置
 */
export interface PlayerWatchersConfig {
  /** 时间线 Store */
  timelineStore: {
    currentTime: Ref<number>
    selectedClipId: Ref<string | null>
    getActiveClips: (time: number) => Clip[]
  }
  
  /** 项目 Store */
  projectStore: {
    canvasWidth: Ref<number>
    canvasHeight: Ref<number>
    aspectRatio: ComputedRef<number> | Ref<number>
  }
  
  /** 资源 Store */
  resourceStore: {
    getMaterial: (id: string) => { hlsUrl?: string; blobUrl?: string } | undefined
  }
  
  /** 活跃视频片段 */
  activeVideoClip: ComputedRef<Clip | undefined>
  
  /** 回调函数 */
  callbacks: {
    updateDisplaySize: () => void
    loadVideoSource: (url: string) => void
    syncStoreToLeafer: (clips: Clip[]) => void
    syncLeaferSelection: (id: string | null) => void
  }
  
  /** 配置选项 */
  options?: {
    /** 尺寸更新防抖延迟（毫秒）*/
    resizeDebounce?: number
    /** Leafer 同步防抖延迟（毫秒）*/
    leaferSyncDebounce?: number
  }
}

/**
 * 创建播放器监听器
 * 
 * @param config 配置
 */
export function usePlayerWatchers(config: PlayerWatchersConfig) {
  const {
    timelineStore,
    projectStore,
    activeVideoClip,
    resourceStore,
    callbacks,
    options = {}
  } = config

  const {
    resizeDebounce = 100,
    leaferSyncDebounce = 16 // 约 60fps
  } = options

  // ==================== 项目分辨率变化 ====================
  // 使用防抖，避免频繁调整尺寸
  const debouncedUpdateSize = debounce(callbacks.updateDisplaySize, resizeDebounce)
  
  watch(
    () => [
      projectStore.canvasWidth.value,
      projectStore.canvasHeight.value,
      projectStore.aspectRatio.value
    ],
    () => {
      debouncedUpdateSize()
    }
  )

  // ==================== 活跃视频片段变化 ====================
  // 当切换到不同素材时加载新视频源
  watch(activeVideoClip, (newClip, oldClip) => {
    if (newClip?.materialId !== oldClip?.materialId && newClip?.materialId) {
      const material = resourceStore.getMaterial(newClip.materialId)
      if (material) {
        const videoUrl = material.hlsUrl ?? material.blobUrl ?? ''
        if (videoUrl) {
          callbacks.loadVideoSource(videoUrl)
        }
      }
    }
  })

  // ==================== Leafer 同步（合并两个 watch） ====================
  // 使用单一 watch 同时处理 activeClips 和 selectedClipId
  // 通过防抖减少高频更新
  
  const debouncedLeaferSync = debounce(callbacks.syncStoreToLeafer, leaferSyncDebounce)
  
  // 监听活跃片段，同步到 Leafer
  watch(
    () => timelineStore.getActiveClips(timelineStore.currentTime.value),
    (clips) => {
      debouncedLeaferSync(clips)
    },
    { deep: true }
  )
  
  // 监听选中状态，同步 Leafer 选中框
  watch(
    () => timelineStore.selectedClipId.value,
    (id) => {
      callbacks.syncLeaferSelection(id)
    }
  )
}

/**
 * 创建波形监听器（用于 ClipWaveform.vue）
 * 
 * 优化：合并 inPoint/outPoint/duration/clipWidth 的监听
 */
export interface WaveformWatchersConfig {
  /** 片段属性 getter */
  getClipProps: () => {
    inPoint: number
    outPoint: number
    duration: number
  }
  
  /** 片段宽度（像素）*/
  clipWidth: ComputedRef<number>
  
  /** 波形数据是否已加载 */
  hasWaveform: () => boolean
  
  /** 回调 */
  callbacks: {
    updateDisplayWaveform: () => void
    drawWaveform: () => void
  }
  
  /** 防抖延迟（毫秒）*/
  debounceDelay?: number
}

/**
 * 创建波形监听器
 */
export function useWaveformWatchers(config: WaveformWatchersConfig) {
  const {
    getClipProps,
    clipWidth,
    hasWaveform,
    callbacks,
    debounceDelay = 300
  } = config

  // 合并两个 watch 为一个
  // 使用防抖处理裁剪变化
  const debouncedUpdate = debounce(callbacks.updateDisplayWaveform, debounceDelay)
  
  watch(
    () => {
      const props = getClipProps()
      return [props.inPoint, props.outPoint, props.duration, clipWidth.value]
    },
    () => {
      // 裁剪属性变化时，重新计算波形
      debouncedUpdate()
    }
  )
  
  // clipWidth 变化时立即重绘（不需要重新计算数据）
  watch(clipWidth, () => {
    if (hasWaveform()) {
      callbacks.drawWaveform()
    }
  })
}
