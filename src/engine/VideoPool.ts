/**
 * VideoPool - 视频元素预加载池
 * 复用 Video 元素，避免频繁创建和加载
 */

export interface PooledVideo {
  element: HTMLVideoElement
  materialId: string
  url: string
  lastUsed: number
  ready: boolean
}

export class VideoPool {
  private pool: Map<string, PooledVideo> = new Map()
  private maxSize: number
  private pendingLoads: Map<string, Promise<HTMLVideoElement>> = new Map()
  
  constructor(maxSize: number = 6) {  // 增加默认容量到 6
    this.maxSize = maxSize
  }
  
  /**
   * 预加载视频
   */
  async preload(materialId: string, url: string): Promise<HTMLVideoElement> {
    // 已在池中
    const existing = this.pool.get(materialId)
    if (existing) {
      existing.lastUsed = Date.now()
      if (existing.ready) {
        return existing.element
      }
    }
    
    // 正在加载中
    const pending = this.pendingLoads.get(materialId)
    if (pending) {
      return pending
    }
    
    // 开始新的加载
    const loadPromise = this.loadVideo(materialId, url)
    this.pendingLoads.set(materialId, loadPromise)
    
    try {
      const video = await loadPromise
      return video
    } finally {
      this.pendingLoads.delete(materialId)
    }
  }
  
  /**
   * 加载视频
   */
  private async loadVideo(materialId: string, url: string): Promise<HTMLVideoElement> {
    // 检查池容量，必要时淘汰
    if (this.pool.size >= this.maxSize) {
      this.evictLRU()
    }
    
    const video = document.createElement('video')
    video.playsInline = true
    video.crossOrigin = 'anonymous'
    video.preload = 'auto'
    video.muted = true  // 初始静音，避免自动播放限制
    
    const pooledVideo: PooledVideo = {
      element: video,
      materialId,
      url,
      lastUsed: Date.now(),
      ready: false
    }
    
    this.pool.set(materialId, pooledVideo)
    
    return new Promise((resolve, reject) => {
      const onCanPlay = () => {
        pooledVideo.ready = true
        video.removeEventListener('canplay', onCanPlay)
        video.removeEventListener('error', onError)
        resolve(video)
      }
      
      const onError = (e: Event) => {
        video.removeEventListener('canplay', onCanPlay)
        video.removeEventListener('error', onError)
        this.pool.delete(materialId)
        reject(new Error(`视频加载失败: ${materialId}`))
      }
      
      video.addEventListener('canplay', onCanPlay)
      video.addEventListener('error', onError)
      
      video.src = url
      video.load()
    })
  }
  
  /**
   * 获取已加载的视频（同步）
   */
  get(materialId: string): HTMLVideoElement | null {
    const pooled = this.pool.get(materialId)
    if (pooled && pooled.ready) {
      pooled.lastUsed = Date.now()
      return pooled.element
    }
    return null
  }
  
  /**
   * 检查视频是否已加载
   */
  has(materialId: string): boolean {
    const pooled = this.pool.get(materialId)
    return pooled?.ready ?? false
  }
  
  /**
   * 淘汰最久未使用的视频
   */
  private evictLRU(): void {
    let oldest: string | null = null
    let oldestTime = Infinity
    
    for (const [id, video] of this.pool) {
      if (video.lastUsed < oldestTime) {
        oldestTime = video.lastUsed
        oldest = id
      }
    }
    
    if (oldest) {
      const video = this.pool.get(oldest)
      if (video) {
        video.element.pause()
        video.element.src = ''
        video.element.load()
      }
      this.pool.delete(oldest)
      console.log(`[VideoPool] 淘汰视频: ${oldest}`)
    }
  }
  
  /**
   * 释放指定视频之外的所有视频
   */
  evict(keepIds: string[]): void {
    const keepSet = new Set(keepIds)
    
    for (const [id, video] of this.pool) {
      if (!keepSet.has(id)) {
        video.element.pause()
        video.element.src = ''
        video.element.load()
        this.pool.delete(id)
      }
    }
  }
  
  /**
   * 获取池中所有视频 ID
   */
  getLoadedIds(): string[] {
    return Array.from(this.pool.keys()).filter(id => this.pool.get(id)?.ready)
  }
  
  /**
   * 销毁池
   */
  destroy(): void {
    for (const [, video] of this.pool) {
      video.element.pause()
      video.element.src = ''
      video.element.load()
    }
    this.pool.clear()
    this.pendingLoads.clear()
  }
}

// 导出单例（6 个视频预加载池）
export const videoPool = new VideoPool(6)
