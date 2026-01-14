/**
 * 视频渲染 Composable
 * 
 * 从 Player.vue 拆分，负责：
 * - WebGL 渲染器管理
 * - 缩略图帧渲染
 * - 图片缓存管理
 * 
 * @module composables/useVideoRenderer
 */

import { ref, onUnmounted } from 'vue'
import { WebGLRenderer } from '@/engine/WebGLRenderer'
import { LRUCache } from '@/utils/LRUCache'
import {
  THUMBNAIL_CACHE_MAX_SIZE,
  FRAME_IMAGE_CACHE_MAX_SIZE,
  IMAGE_CACHE_MAX_SIZE
} from '@/config/constants'

export function useVideoRenderer() {
  const canvasRef = ref<HTMLCanvasElement | null>(null)
  let renderer: WebGLRenderer | null = null
  
  // 使用 LRU 缓存替代无限制 Map
  const thumbnailCache = new LRUCache<string, HTMLImageElement>(THUMBNAIL_CACHE_MAX_SIZE)
  const frameImageCache = new LRUCache<string, HTMLImageElement>(FRAME_IMAGE_CACHE_MAX_SIZE)
  const imageCache = new LRUCache<string, HTMLImageElement>(IMAGE_CACHE_MAX_SIZE)

  /**
   * 初始化渲染器
   */
  function initRenderer(canvas: HTMLCanvasElement): WebGLRenderer {
    renderer = new WebGLRenderer(canvas)
    return renderer
  }

  /**
   * 获取渲染器实例
   */
  function getRenderer(): WebGLRenderer | null {
    return renderer
  }

  /**
   * 调整渲染器尺寸
   */
  function resizeRenderer(width: number, height: number): void {
    renderer?.resize(width, height)
  }

  /**
   * 渲染缩略图帧（拖拽预览时使用）
   */
  function renderThumbnailFrame(
    frameUrl: string,
    cacheKey: string,
    onRenderReady?: (img: HTMLImageElement) => void
  ): void {
    if (!renderer) return

    // 检查缓存
    const cached = thumbnailCache.get(cacheKey)
    if (cached && cached.complete) {
      renderer.renderFrame(cached)
      return
    }

    // 检查是否已在加载
    if (cached) return

    // 加载新图片
    const img = new Image()
    img.crossOrigin = 'anonymous'
    thumbnailCache.set(cacheKey, img)

    img.onload = () => {
      if (onRenderReady) {
        onRenderReady(img)
      } else if (renderer) {
        renderer.renderFrame(img)
      }
    }

    img.src = frameUrl
  }

  /**
   * 获取或加载帧图片（转场使用）
   */
  function getOrLoadFrameImage(frameUrl: string): HTMLImageElement | null {
    const cached = frameImageCache.get(frameUrl)
    if (cached && cached.complete) return cached

    if (!cached) {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.src = frameUrl
      frameImageCache.set(frameUrl, img)
    }

    return null
  }

  /**
   * 获取或加载图片（图片片段使用）
   */
  function getOrLoadImage(
    materialId: string,
    blobUrl: string,
    onLoaded?: (img: HTMLImageElement) => void
  ): HTMLImageElement | null {
    const cached = imageCache.get(materialId)
    if (cached && cached.complete) return cached

    if (!cached) {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        if (onLoaded) onLoaded(img)
      }
      img.src = blobUrl
      imageCache.set(materialId, img)
    }

    return null
  }

  /**
   * 清理资源
   */
  function destroy(): void {
    renderer?.destroy()
    renderer = null
    thumbnailCache.clear()
    frameImageCache.clear()
    imageCache.clear()
  }

  onUnmounted(() => {
    destroy()
  })

  return {
    canvasRef,
    initRenderer,
    getRenderer,
    resizeRenderer,
    renderThumbnailFrame,
    getOrLoadFrameImage,
    getOrLoadImage,
    destroy,
    // 暴露缓存（供高级用法）
    thumbnailCache,
    frameImageCache,
    imageCache
  }
}
