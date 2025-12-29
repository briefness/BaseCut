/**
 * HLS 播放器引擎
 * 基于 hls.js 实现 HLS 流媒体播放支持
 */
import Hls from 'hls.js'

export interface HLSPlayerConfig {
  autoStartLoad?: boolean
  startPosition?: number
  maxBufferLength?: number
  maxBufferSize?: number
  enableWorker?: boolean
}

export interface HLSQualityLevel {
  index: number
  width: number
  height: number
  bitrate: number
  name: string
}

export class HLSPlayer {
  private hls: Hls | null = null
  private videoElement: HTMLVideoElement | null = null
  private currentSource: string | null = null
  private isDestroyed = false

  // 事件回调
  private onLoadedCallback: (() => void) | null = null
  private onErrorCallback: ((error: Error) => void) | null = null
  private onQualityChangeCallback: ((level: HLSQualityLevel) => void) | null = null
  private onBufferingCallback: ((isBuffering: boolean) => void) | null = null

  /**
   * 检查 HLS.js 是否可用
   */
  static isSupported(): boolean {
    return Hls.isSupported()
  }

  /**
   * 检查浏览器是否原生支持 HLS
   */
  static isNativeSupported(): boolean {
    const video = document.createElement('video')
    return video.canPlayType('application/vnd.apple.mpegurl') !== ''
  }

  /**
   * 初始化 HLS 播放器
   */
  init(videoElement: HTMLVideoElement, config?: HLSPlayerConfig): void {
    this.videoElement = videoElement
    
    if (!HLSPlayer.isSupported()) {
      console.warn('[HLSPlayer] hls.js 不支持，尝试使用原生 HLS')
      return
    }

    // 创建 HLS 实例
    this.hls = new Hls({
      autoStartLoad: config?.autoStartLoad ?? true,
      startPosition: config?.startPosition ?? -1,
      maxBufferLength: config?.maxBufferLength ?? 30,
      maxBufferSize: config?.maxBufferSize ?? 60 * 1000 * 1000, // 60MB
      enableWorker: config?.enableWorker ?? true,
      // 低延迟模式
      lowLatencyMode: true,
      // 启用硬件加速
      enableSoftwareAES: false
    })

    // 绑定事件
    this.setupEventListeners()

    console.log('[HLSPlayer] 初始化完成')
  }

  /**
   * 设置事件监听
   */
  private setupEventListeners(): void {
    if (!this.hls) return

    // 清单加载完成
    this.hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
      console.log(`[HLSPlayer] 清单解析完成，${data.levels.length} 个质量级别`)
      this.onLoadedCallback?.()
    })

    // 质量级别切换
    this.hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
      const level = this.hls?.levels[data.level]
      if (level) {
        const qualityLevel: HLSQualityLevel = {
          index: data.level,
          width: level.width,
          height: level.height,
          bitrate: level.bitrate,
          name: `${level.height}p`
        }
        console.log(`[HLSPlayer] 切换到 ${qualityLevel.name}`)
        this.onQualityChangeCallback?.(qualityLevel)
      }
    })

    // 缓冲状态
    this.hls.on(Hls.Events.FRAG_BUFFERED, () => {
      this.onBufferingCallback?.(false)
    })

    // 使用 ERROR 事件处理缓冲问题
    this.hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data.details === 'bufferStalledError') {
        this.onBufferingCallback?.(true)
      }
    })

    // 错误处理
    this.hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) {
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            console.error('[HLSPlayer] 网络错误，尝试恢复...')
            this.hls?.startLoad()
            break
          case Hls.ErrorTypes.MEDIA_ERROR:
            console.error('[HLSPlayer] 媒体错误，尝试恢复...')
            this.hls?.recoverMediaError()
            break
          default:
            console.error('[HLSPlayer] 致命错误:', data)
            this.onErrorCallback?.(new Error(data.details))
            break
        }
      }
    })
  }

  /**
   * 加载 HLS 源
   */
  loadSource(url: string): void {
    if (this.isDestroyed) return

    this.currentSource = url

    // 检测是否是 HLS 流
    const isHLS = url.includes('.m3u8') || url.includes('application/x-mpegURL')

    if (isHLS && this.hls && this.videoElement) {
      // 使用 hls.js 播放
      this.hls.loadSource(url)
      this.hls.attachMedia(this.videoElement)
      console.log('[HLSPlayer] 加载 HLS 源:', url)
    } else if (isHLS && HLSPlayer.isNativeSupported() && this.videoElement) {
      // Safari 原生支持
      this.videoElement.src = url
      console.log('[HLSPlayer] 使用原生 HLS 播放:', url)
    } else if (this.videoElement) {
      // 普通视频源
      this.videoElement.src = url
      console.log('[HLSPlayer] 加载普通视频源:', url)
    }
  }

  /**
   * 判断 URL 是否为 HLS 流
   */
  static isHLSSource(url: string | undefined | null): boolean {
    if (!url || typeof url !== 'string') return false
    return url.includes('.m3u8') || 
           url.includes('application/x-mpegURL') ||
           url.includes('application/vnd.apple.mpegurl')
  }

  /**
   * 获取可用的质量级别
   */
  getQualityLevels(): HLSQualityLevel[] {
    if (!this.hls) return []

    return this.hls.levels.map((level, index) => ({
      index,
      width: level.width,
      height: level.height,
      bitrate: level.bitrate,
      name: `${level.height}p`
    }))
  }

  /**
   * 设置质量级别
   * @param levelIndex -1 表示自动
   */
  setQualityLevel(levelIndex: number): void {
    if (!this.hls) return
    this.hls.currentLevel = levelIndex
    console.log(`[HLSPlayer] 设置质量级别: ${levelIndex === -1 ? '自动' : levelIndex}`)
  }

  /**
   * 获取当前质量级别
   */
  getCurrentQualityLevel(): number {
    return this.hls?.currentLevel ?? -1
  }

  /**
   * 开始加载
   */
  startLoad(startPosition?: number): void {
    this.hls?.startLoad(startPosition)
  }

  /**
   * 停止加载
   */
  stopLoad(): void {
    this.hls?.stopLoad()
  }

  /**
   * 设置加载完成回调
   */
  onLoaded(callback: () => void): void {
    this.onLoadedCallback = callback
  }

  /**
   * 设置错误回调
   */
  onError(callback: (error: Error) => void): void {
    this.onErrorCallback = callback
  }

  /**
   * 设置质量切换回调
   */
  onQualityChange(callback: (level: HLSQualityLevel) => void): void {
    this.onQualityChangeCallback = callback
  }

  /**
   * 设置缓冲状态回调
   */
  onBuffering(callback: (isBuffering: boolean) => void): void {
    this.onBufferingCallback = callback
  }

  /**
   * 获取当前源
   */
  getCurrentSource(): string | null {
    return this.currentSource
  }

  /**
   * 获取缓冲信息
   */
  getBufferInfo(): { start: number; end: number; length: number } | null {
    if (!this.videoElement) return null

    const buffered = this.videoElement.buffered
    if (buffered.length === 0) return null

    const currentTime = this.videoElement.currentTime
    for (let i = 0; i < buffered.length; i++) {
      if (currentTime >= buffered.start(i) && currentTime <= buffered.end(i)) {
        return {
          start: buffered.start(i),
          end: buffered.end(i),
          length: buffered.end(i) - buffered.start(i)
        }
      }
    }

    return null
  }

  /**
   * 获取延迟信息（直播模式）
   */
  getLatency(): number {
    return this.hls?.latency ?? 0
  }

  /**
   * 销毁播放器
   */
  destroy(): void {
    this.isDestroyed = true

    if (this.hls) {
      this.hls.destroy()
      this.hls = null
    }

    this.videoElement = null
    this.currentSource = null
    this.onLoadedCallback = null
    this.onErrorCallback = null
    this.onQualityChangeCallback = null
    this.onBufferingCallback = null

    console.log('[HLSPlayer] 已销毁')
  }
}

// 导出单例
export const hlsPlayer = new HLSPlayer()
