/**
 * SpriteThumbnailer - Sprite 缩略图工具类
 * 从服务端预生成的 sprite 图中获取帧
 */

import type { ThumbnailSprite } from '@/types'

// 帧位置信息
export interface FramePosition {
  x: number           // 帧在 sprite 中的 x 坐标
  y: number           // 帧在 sprite 中的 y 坐标
  width: number       // 帧宽度
  height: number      // 帧高度
  spriteUrl: string   // sprite 图片 URL
  time: number        // 对应的时间点
}

// Sprite 缓存
interface SpriteCache {
  image: HTMLImageElement
  loaded: boolean
  lastAccessed: number
}

class SpriteThumbnailer {
  private spriteCache: Map<string, SpriteCache> = new Map()
  private maxCacheSize = 5  // 最多缓存 5 个 sprite 图
  private pendingLoads: Map<string, Promise<HTMLImageElement>> = new Map()
  
  /**
   * 预加载 sprite 图片
   */
  async preloadSprite(sprite: ThumbnailSprite): Promise<HTMLImageElement> {
    const url = sprite.url
    
    // 检查缓存
    const cached = this.spriteCache.get(url)
    if (cached && cached.loaded) {
      cached.lastAccessed = Date.now()
      return cached.image
    }
    
    // 检查是否正在加载
    const pending = this.pendingLoads.get(url)
    if (pending) return pending
    
    // 创建加载 Promise
    const loadPromise = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      
      img.onload = () => {
        this.saveToCache(url, img)
        resolve(img)
      }
      
      img.onerror = () => {
        this.pendingLoads.delete(url)
        reject(new Error(`Failed to load sprite: ${url}`))
      }
      
      img.src = url
    })
    
    this.pendingLoads.set(url, loadPromise)
    
    try {
      const result = await loadPromise
      return result
    } finally {
      this.pendingLoads.delete(url)
    }
  }
  
  /**
   * 保存到缓存
   */
  private saveToCache(url: string, image: HTMLImageElement): void {
    // LRU 清理
    if (this.spriteCache.size >= this.maxCacheSize) {
      let oldestKey: string | null = null
      let oldestTime = Infinity
      
      for (const [key, cache] of this.spriteCache) {
        if (cache.lastAccessed < oldestTime) {
          oldestTime = cache.lastAccessed
          oldestKey = key
        }
      }
      
      if (oldestKey) {
        this.spriteCache.delete(oldestKey)
      }
    }
    
    this.spriteCache.set(url, {
      image,
      loaded: true,
      lastAccessed: Date.now()
    })
  }
  
  /**
   * 计算指定时间对应的帧在 sprite 中的位置
   */
  getFrameAtTime(sprite: ThumbnailSprite, time: number): FramePosition {
    const { url, width, height, columns, interval, totalFrames } = sprite
    
    // 计算帧索引
    const frameIndex = Math.min(
      Math.floor(time / interval),
      totalFrames - 1
    )
    
    // 计算行列
    const col = frameIndex % columns
    const row = Math.floor(frameIndex / columns)
    
    return {
      x: col * width,
      y: row * height,
      width,
      height,
      spriteUrl: url,
      time: frameIndex * interval
    }
  }
  
  /**
   * 获取时间范围内的帧列表（用于时间轴显示）
   */
  getFramesInRange(
    sprite: ThumbnailSprite,
    inPoint: number,
    outPoint: number,
    targetCount: number
  ): FramePosition[] {
    if (targetCount <= 0) return []
    
    const duration = outPoint - inPoint
    if (duration <= 0) return []
    
    const frames: FramePosition[] = []
    
    // 均匀分布采样
    for (let i = 0; i < targetCount; i++) {
      const ratio = i / (targetCount - 1 || 1)
      const time = inPoint + ratio * duration
      frames.push(this.getFrameAtTime(sprite, time))
    }
    
    return frames
  }
  
  /**
   * 生成 CSS background-position 样式
   */
  getBackgroundStyle(position: FramePosition): {
    backgroundImage: string
    backgroundPosition: string
    backgroundSize: string
  } {
    return {
      backgroundImage: `url(${position.spriteUrl})`,
      backgroundPosition: `-${position.x}px -${position.y}px`,
      backgroundSize: 'auto'
    }
  }
  
  /**
   * 绘制帧到 Canvas
   */
  drawFrameToCanvas(
    ctx: CanvasRenderingContext2D,
    image: HTMLImageElement,
    position: FramePosition,
    destX: number,
    destY: number,
    destWidth: number,
    destHeight: number
  ): void {
    ctx.drawImage(
      image,
      position.x,
      position.y,
      position.width,
      position.height,
      destX,
      destY,
      destWidth,
      destHeight
    )
  }
  
  /**
   * 清理缓存
   */
  clearCache(url?: string): void {
    if (url) {
      this.spriteCache.delete(url)
    } else {
      this.spriteCache.clear()
    }
  }
  
  /**
   * 检查 sprite 是否已缓存
   */
  isCached(url: string): boolean {
    const cached = this.spriteCache.get(url)
    return cached?.loaded ?? false
  }
}

// 导出单例
export const spriteThumbnailer = new SpriteThumbnailer()
export { SpriteThumbnailer }
