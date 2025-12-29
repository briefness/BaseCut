/**
 * WebCodecs 视频解码器
 * 使用 WebCodecs API 实现硬件加速视频解码
 */
export interface DecodedFrame {
  timestamp: number
  duration: number
  width: number
  height: number
  frame: VideoFrame
}

export interface DecoderConfig {
  codec: string
  codedWidth: number
  codedHeight: number
  hardwareAcceleration?: 'no-preference' | 'prefer-hardware' | 'prefer-software'
}

export class VideoDecoderEngine {
  private decoder: VideoDecoder | null = null
  private pendingFrames: DecodedFrame[] = []
  private frameCallback: ((frame: DecodedFrame) => void) | null = null
  private errorCallback: ((error: DOMException) => void) | null = null
  private isConfigured = false
  private maxFrameBuffer = 30

  /**
   * 检查 WebCodecs 是否可用
   */
  static isSupported(): boolean {
    return 'VideoDecoder' in window
  }

  /**
   * 检查解码配置是否支持
   */
  static async isConfigSupported(config: DecoderConfig): Promise<boolean> {
    if (!this.isSupported()) return false
    
    try {
      const result = await VideoDecoder.isConfigSupported({
        codec: config.codec,
        codedWidth: config.codedWidth,
        codedHeight: config.codedHeight,
        hardwareAcceleration: config.hardwareAcceleration ?? 'prefer-hardware'
      })
      return result.supported
    } catch {
      return false
    }
  }

  /**
   * 初始化解码器
   */
  async init(config: DecoderConfig): Promise<void> {
    if (!VideoDecoderEngine.isSupported()) {
      throw new Error('WebCodecs API 不可用')
    }

    // 关闭已有解码器
    this.close()

    // 创建新解码器
    this.decoder = new VideoDecoder({
      output: (frame) => this.handleFrame(frame),
      error: (error) => this.handleError(error)
    })

    // 配置解码器
    this.decoder.configure({
      codec: config.codec,
      codedWidth: config.codedWidth,
      codedHeight: config.codedHeight,
      hardwareAcceleration: config.hardwareAcceleration ?? 'prefer-hardware'
    })

    this.isConfigured = true
    console.log('[VideoDecoder] 初始化完成:', config)
  }

  /**
   * 设置帧回调
   */
  onFrame(callback: (frame: DecodedFrame) => void): void {
    this.frameCallback = callback
  }

  /**
   * 设置错误回调
   */
  onError(callback: (error: DOMException) => void): void {
    this.errorCallback = callback
  }

  /**
   * 处理解码后的帧
   */
  private handleFrame(frame: VideoFrame): void {
    const decodedFrame: DecodedFrame = {
      timestamp: frame.timestamp,
      duration: frame.duration ?? 0,
      width: frame.displayWidth,
      height: frame.displayHeight,
      frame
    }

    // 添加到缓冲区
    this.pendingFrames.push(decodedFrame)

    // 清理溢出的旧帧
    while (this.pendingFrames.length > this.maxFrameBuffer) {
      const oldFrame = this.pendingFrames.shift()
      oldFrame?.frame.close()
    }

    // 触发回调
    if (this.frameCallback) {
      this.frameCallback(decodedFrame)
    }
  }

  /**
   * 处理错误
   */
  private handleError(error: DOMException): void {
    console.error('[VideoDecoder] 解码错误:', error)
    if (this.errorCallback) {
      this.errorCallback(error)
    }
  }

  /**
   * 解码数据块
   */
  decode(chunk: EncodedVideoChunk): void {
    if (!this.decoder || !this.isConfigured) {
      console.warn('[VideoDecoder] 解码器未就绪')
      return
    }

    if (this.decoder.state === 'closed') {
      console.warn('[VideoDecoder] 解码器已关闭')
      return
    }

    this.decoder.decode(chunk)
  }

  /**
   * 刷新解码器
   */
  async flush(): Promise<void> {
    if (!this.decoder || this.decoder.state === 'closed') return
    await this.decoder.flush()
  }

  /**
   * 获取待处理帧数
   */
  getQueueSize(): number {
    return this.decoder?.decodeQueueSize ?? 0
  }

  /**
   * 获取缓冲区帧
   */
  getBufferedFrames(): DecodedFrame[] {
    return [...this.pendingFrames]
  }

  /**
   * 获取指定时间戳的帧
   */
  getFrameAt(timestamp: number): DecodedFrame | null {
    // 找到最接近目标时间戳的帧
    let closestFrame: DecodedFrame | null = null
    let minDiff = Infinity

    for (const frame of this.pendingFrames) {
      const diff = Math.abs(frame.timestamp - timestamp)
      if (diff < minDiff) {
        minDiff = diff
        closestFrame = frame
      }
    }

    return closestFrame
  }

  /**
   * 清空缓冲区
   */
  clearBuffer(): void {
    for (const frame of this.pendingFrames) {
      frame.frame.close()
    }
    this.pendingFrames = []
  }

  /**
   * 重置解码器
   */
  reset(): void {
    if (!this.decoder) return

    this.clearBuffer()

    if (this.decoder.state !== 'closed') {
      this.decoder.reset()
      this.isConfigured = false
    }
  }

  /**
   * 关闭解码器
   */
  close(): void {
    this.clearBuffer()

    if (this.decoder && this.decoder.state !== 'closed') {
      this.decoder.close()
    }

    this.decoder = null
    this.isConfigured = false
  }

  /**
   * 获取解码器状态
   */
  getState(): 'unconfigured' | 'configured' | 'closed' | 'none' {
    return this.decoder?.state ?? 'none'
  }
}
