/**
 * 帧提取工具类
 * 支持 LRU 缓存、懒加载和性能优化
 */

interface FrameCacheItem {
  dataUrl: string
  timestamp: number
  lastAccessed: number
}

interface ExtractOptions {
  width?: number        // 缩略图宽度，默认 160
  quality?: number      // JPEG 质量，默认 0.6
}

// 素材胶卷缓存（存储完整视频的帧序列）
interface FilmstripCache {
  frames: string[]           // 帧数据 URL 列表
  interval: number           // 帧间隔（秒）
  duration: number           // 素材总时长
  lastAccessed: number
}

class FrameExtractor {
  private cache: Map<string, FrameCacheItem> = new Map()
  private maxCacheSize: number
  private pendingRequests: Map<string, Promise<string>> = new Map()
  
  // 素材胶卷缓存（按素材 ID 存储完整帧序列）
  private filmstrips: Map<string, FilmstripCache> = new Map()
  private filmstripPending: Map<string, Promise<FilmstripCache>> = new Map()
  private maxFilmstrips = 10  // 最多缓存 10 个素材的胶卷
  
  constructor(maxCacheSize = 100) {
    this.maxCacheSize = maxCacheSize
  }
  
  /**
   * 生成缓存键
   */
  private getCacheKey(materialId: string, time: number): string {
    // 四舍五入到 0.1 秒精度，减少重复提取
    const roundedTime = Math.round(time * 10) / 10
    return `${materialId}_${roundedTime}`
  }
  
  /**
   * 从缓存获取帧
   */
  getFromCache(materialId: string, time: number): string | null {
    const key = this.getCacheKey(materialId, time)
    const item = this.cache.get(key)
    if (item) {
      item.lastAccessed = Date.now()
      return item.dataUrl
    }
    return null
  }
  
  /**
   * 清理最久未使用的缓存项
   */
  private evictIfNeeded(): void {
    if (this.cache.size < this.maxCacheSize) return
    
    // 找到最久未访问的项
    let oldestKey: string | null = null
    let oldestTime = Infinity
    
    for (const [key, item] of this.cache) {
      if (item.lastAccessed < oldestTime) {
        oldestTime = item.lastAccessed
        oldestKey = key
      }
    }
    
    if (oldestKey) {
      const item = this.cache.get(oldestKey)
      if (item) {
        // 释放 Data URL 内存
        URL.revokeObjectURL(item.dataUrl)
      }
      this.cache.delete(oldestKey)
    }
  }
  
  /**
   * 提取单帧
   */
  async extractFrame(
    video: HTMLVideoElement,
    materialId: string,
    time: number,
    options: ExtractOptions = {}
  ): Promise<string> {
    const { width = 160, quality = 0.6 } = options
    
    // 检查缓存
    const cached = this.getFromCache(materialId, time)
    if (cached) return cached
    
    // 检查是否有正在进行的相同请求
    const cacheKey = this.getCacheKey(materialId, time)
    const pendingRequest = this.pendingRequests.get(cacheKey)
    if (pendingRequest) return pendingRequest
    
    // 创建新的提取请求
    const extractPromise = this.doExtractFrame(video, materialId, time, width, quality)
    this.pendingRequests.set(cacheKey, extractPromise)
    
    try {
      const result = await extractPromise
      return result
    } finally {
      this.pendingRequests.delete(cacheKey)
    }
  }
  
  /**
   * 实际执行帧提取
   */
  private async doExtractFrame(
    video: HTMLVideoElement,
    materialId: string,
    time: number,
    width: number,
    quality: number
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      // 创建临时视频元素
      const tempVideo = document.createElement('video')
      tempVideo.crossOrigin = 'anonymous'
      tempVideo.muted = true
      tempVideo.playsInline = true
      tempVideo.preload = 'auto'
      
      let timeoutId: number | null = null
      
      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId)
        tempVideo.removeEventListener('loadeddata', handleLoaded)
        tempVideo.removeEventListener('seeked', handleSeeked)
        tempVideo.removeEventListener('error', handleError)
        tempVideo.pause()
        tempVideo.src = ''
        tempVideo.load()
      }
      
      const captureFrame = () => {
        try {
          // 确保视频尺寸有效
          if (tempVideo.videoWidth === 0 || tempVideo.videoHeight === 0) {
            cleanup()
            reject(new Error('Invalid video dimensions'))
            return
          }
          
          // 计算缩放后的尺寸
          const aspectRatio = tempVideo.videoWidth / tempVideo.videoHeight
          const height = Math.round(width / aspectRatio)
          
          // 创建 Canvas
          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          
          if (!ctx) {
            cleanup()
            reject(new Error('Failed to get canvas context'))
            return
          }
          
          // 绘制帧
          ctx.drawImage(tempVideo, 0, 0, width, height)
          
          // 转换为 Data URL
          const dataUrl = canvas.toDataURL('image/jpeg', quality)
          
          // 保存到缓存
          this.saveToCache(materialId, time, dataUrl)
          cleanup()
          resolve(dataUrl)
        } catch (err) {
          cleanup()
          reject(err)
        }
      }
      
      const handleSeeked = () => {
        // 给一点额外时间确保帧已解码
        setTimeout(captureFrame, 50)
      }
      
      const handleLoaded = () => {
        // 视频数据已加载，现在可以安全 seek
        const targetTime = Math.max(0, Math.min(time, tempVideo.duration || 0))
        
        // 如果目标时间就是当前时间，直接捕获
        if (Math.abs(tempVideo.currentTime - targetTime) < 0.01) {
          captureFrame()
        } else {
          tempVideo.addEventListener('seeked', handleSeeked, { once: true })
          tempVideo.currentTime = targetTime
        }
      }
      
      const handleError = () => {
        cleanup()
        reject(new Error('Failed to load video for frame extraction'))
      }
      
      // 设置超时（10秒）
      timeoutId = window.setTimeout(() => {
        cleanup()
        reject(new Error('Frame extraction timeout'))
      }, 10000)
      
      tempVideo.addEventListener('loadeddata', handleLoaded, { once: true })
      tempVideo.addEventListener('error', handleError, { once: true })
      
      // 设置源 - 使用传入视频的 src
      tempVideo.src = video.src
    })
  }
  
  /**
   * 保存帧到缓存
   */
  private saveToCache(materialId: string, time: number, dataUrl: string): void {
    this.evictIfNeeded()
    
    const key = this.getCacheKey(materialId, time)
    this.cache.set(key, {
      dataUrl,
      timestamp: time,
      lastAccessed: Date.now()
    })
  }
  
  /**
   * 批量提取帧（用于轨道预览）
   */
  async extractFrames(
    video: HTMLVideoElement,
    materialId: string,
    inPoint: number,
    outPoint: number,
    count: number,
    options: ExtractOptions = {}
  ): Promise<string[]> {
    const duration = outPoint - inPoint
    if (duration <= 0 || count <= 0) return []
    
    // 帧均匀分布：第一帧在 inPoint，最后一帧接近 outPoint
    const times: number[] = []
    if (count === 1) {
      times.push(inPoint)
    } else {
      const interval = duration / (count - 1)
      for (let i = 0; i < count; i++) {
        times.push(inPoint + i * interval)
      }
    }
    
    // 并行提取，但限制并发数
    const concurrency = 3
    const results: string[] = []
    
    for (let i = 0; i < times.length; i += concurrency) {
      const batch = times.slice(i, i + concurrency)
      const batchResults = await Promise.all(
        batch.map(time => this.extractFrame(video, materialId, time, options))
      )
      results.push(...batchResults)
    }
    
    return results
  }

  /**
   * 获取素材胶卷（预提取整个视频的帧序列）
   * @param interval 帧间隔（秒），默认 0.5 秒一帧
   */
  async getFilmstrip(
    video: HTMLVideoElement,
    materialId: string,
    duration: number,
    options: ExtractOptions & { interval?: number } = {}
  ): Promise<FilmstripCache> {
    const { interval = 0.5, ...extractOptions } = options
    
    // 检查缓存
    const cached = this.filmstrips.get(materialId)
    if (cached) {
      cached.lastAccessed = Date.now()
      return cached
    }
    
    // 检查是否有正在进行的请求
    const pending = this.filmstripPending.get(materialId)
    if (pending) return pending
    
    // 创建新的提取请求
    const extractPromise = this.doExtractFilmstrip(video, materialId, duration, interval, extractOptions)
    this.filmstripPending.set(materialId, extractPromise)
    
    try {
      const result = await extractPromise
      return result
    } finally {
      this.filmstripPending.delete(materialId)
    }
  }

  /**
   * 实际执行胶卷提取
   */
  private async doExtractFilmstrip(
    video: HTMLVideoElement,
    materialId: string,
    duration: number,
    interval: number,
    options: ExtractOptions
  ): Promise<FilmstripCache> {
    // 清理旧的胶卷缓存（LRU）
    if (this.filmstrips.size >= this.maxFilmstrips) {
      let oldestKey: string | null = null
      let oldestTime = Infinity
      for (const [key, cache] of this.filmstrips) {
        if (cache.lastAccessed < oldestTime) {
          oldestTime = cache.lastAccessed
          oldestKey = key
        }
      }
      if (oldestKey) {
        const oldCache = this.filmstrips.get(oldestKey)
        if (oldCache) {
          // 不需要释放 dataUrl，因为它们也在 cache 中管理
        }
        this.filmstrips.delete(oldestKey)
      }
    }
    
    // 计算帧时间点
    const frameCount = Math.ceil(duration / interval)
    const times: number[] = []
    for (let i = 0; i < frameCount; i++) {
      times.push(i * interval)
    }
    
    // 批量提取帧
    const frames = await this.extractFrames(video, materialId, 0, duration, frameCount, options)
    
    // 保存到胶卷缓存
    const filmstrip: FilmstripCache = {
      frames,
      interval,
      duration,
      lastAccessed: Date.now()
    }
    this.filmstrips.set(materialId, filmstrip)
    
    return filmstrip
  }

  /**
   * 从胶卷中切片获取指定范围的帧
   */
  getFilmstripSlice(
    filmstrip: { frames: string[]; interval: number; duration: number },
    inPoint: number,
    outPoint: number,
    targetCount: number
  ): string[] {
    const { frames, interval, duration } = filmstrip
    if (frames.length === 0 || duration <= 0) return []
    
    // 计算起始和结束帧索引
    const startIndex = Math.floor(inPoint / interval)
    const endIndex = Math.ceil(outPoint / interval)
    
    // 获取范围内的帧
    const sliceFrames = frames.slice(
      Math.max(0, startIndex),
      Math.min(frames.length, endIndex)
    )
    
    // 如果目标数量与切片数量差异较大，进行均匀采样
    if (sliceFrames.length > targetCount * 1.5) {
      const step = sliceFrames.length / targetCount
      const sampled: string[] = []
      for (let i = 0; i < targetCount; i++) {
        const index = Math.min(Math.floor(i * step), sliceFrames.length - 1)
        sampled.push(sliceFrames[index])
      }
      return sampled
    }
    
    return sliceFrames
  }

  /**
   * 检查素材胶卷是否已缓存
   */
  hasFilmstrip(materialId: string): boolean {
    return this.filmstrips.has(materialId)
  }
  
  /**
   * 清理指定素材的缓存
   */
  clearCache(materialId?: string): void {
    if (materialId) {
      for (const [key, item] of this.cache) {
        if (key.startsWith(materialId)) {
          URL.revokeObjectURL(item.dataUrl)
          this.cache.delete(key)
        }
      }
    } else {
      for (const item of this.cache.values()) {
        URL.revokeObjectURL(item.dataUrl)
      }
      this.cache.clear()
    }
  }
  
  /**
   * 获取缓存统计
   */
  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize
    }
  }
}

// 导出单例
export const frameExtractor = new FrameExtractor(100)
export { FrameExtractor }
export type { ExtractOptions, FilmstripCache }
