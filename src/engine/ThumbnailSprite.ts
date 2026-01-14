/**
 * 缩略图雪碧图生成器
 * 
 * 功能：
 * 1. 从视频中提取多个时间点的帧
 * 2. 合并为雪碧图（支持长视频分片）
 * 3. 生成帧索引 metadata
 * 
 * 设计原则：
 * - 单张雪碧图最大 4096x4096（兼容大多数 GPU）
 * - 超长视频自动分片为多张雪碧图
 */

// ==================== 类型定义 ====================

/**
 * 单张雪碧图元数据
 */
export interface SpriteSheetMeta {
  index: number         // 雪碧图索引（第几张）
  cols: number          // 列数
  rows: number          // 行数
  frameWidth: number    // 单帧宽度
  frameHeight: number   // 单帧高度
  frameCount: number    // 此雪碧图包含的帧数
  startFrame: number    // 起始帧索引（全局）
  startTime: number     // 起始时间（秒）
}

/**
 * 完整雪碧图集元数据
 */
export interface SpriteMetadata {
  materialId: string
  totalFrames: number      // 总帧数
  frameInterval: number    // 采样间隔（秒）
  totalDuration: number    // 视频总时长
  frameWidth: number       // 单帧宽度
  frameHeight: number      // 单帧高度
  sheets: SpriteSheetMeta[] // 各雪碧图信息
}

/**
 * 雪碧图生成结果
 */
export interface SpriteResult {
  blobs: Blob[]            // 雪碧图 Blob 数组
  metadata: SpriteMetadata
}

// ==================== 配置常量 ====================

const DEFAULT_CONFIG = {
  frameWidth: 160,           // 单帧宽度
  frameHeight: 90,           // 单帧高度（16:9）
  maxSheetSize: 4096,        // 单张雪碧图最大尺寸
  framesPerSecond: 1,        // 每秒采样帧数
  maxFramesPerSheet: 100,    // 单张雪碧图最大帧数
}

// ==================== 雪碧图生成器 ====================

export class ThumbnailSprite {
  /**
   * 生成雪碧图集
   * 
   * @param videoUrl 视频 URL
   * @param materialId 素材 ID
   * @param options 配置选项
   */
  static async generate(
    videoUrl: string,
    materialId: string,
    options: Partial<typeof DEFAULT_CONFIG> = {}
  ): Promise<SpriteResult> {
    const config = { ...DEFAULT_CONFIG, ...options }
    
    // 1. 加载视频获取元信息
    const video = await this.loadVideo(videoUrl)
    const duration = video.duration
    const videoAspect = video.videoWidth / video.videoHeight
    
    // 调整帧高度以匹配视频宽高比
    const frameHeight = Math.round(config.frameWidth / videoAspect)
    
    // 2. 计算采样参数
    const frameInterval = 1 / config.framesPerSecond
    const totalFrames = Math.ceil(duration * config.framesPerSecond)
    
    // 3. 计算单张雪碧图可容纳的帧数
    const maxCols = Math.floor(config.maxSheetSize / config.frameWidth)
    const maxRows = Math.floor(config.maxSheetSize / frameHeight)
    const maxFramesPerSheet = Math.min(maxCols * maxRows, config.maxFramesPerSheet)
    
    // 4. 计算需要多少张雪碧图
    const sheetCount = Math.ceil(totalFrames / maxFramesPerSheet)
    
    console.log(`[ThumbnailSprite] 视频 ${duration.toFixed(1)}s, 共 ${totalFrames} 帧, 分 ${sheetCount} 张雪碧图`)
    
    // 5. 生成每张雪碧图
    const blobs: Blob[] = []
    const sheets: SpriteSheetMeta[] = []
    
    for (let sheetIndex = 0; sheetIndex < sheetCount; sheetIndex++) {
      const startFrame = sheetIndex * maxFramesPerSheet
      const framesInThisSheet = Math.min(maxFramesPerSheet, totalFrames - startFrame)
      
      // 计算最优网格布局
      const cols = Math.ceil(Math.sqrt(framesInThisSheet))
      const rows = Math.ceil(framesInThisSheet / cols)
      
      // 生成此雪碧图
      const blob = await this.generateSheet(
        video,
        startFrame,
        framesInThisSheet,
        frameInterval,
        config.frameWidth,
        frameHeight,
        cols,
        rows
      )
      
      blobs.push(blob)
      sheets.push({
        index: sheetIndex,
        cols,
        rows,
        frameWidth: config.frameWidth,
        frameHeight,
        frameCount: framesInThisSheet,
        startFrame,
        startTime: startFrame * frameInterval
      })
    }
    
    // 6. 清理视频元素
    video.src = ''
    video.load()
    
    return {
      blobs,
      metadata: {
        materialId,
        totalFrames,
        frameInterval,
        totalDuration: duration,
        frameWidth: config.frameWidth,
        frameHeight,
        sheets
      }
    }
  }

  /**
   * 生成单张雪碧图
   * 使用 OffscreenCanvas 避免阻塞主线程
   */
  private static async generateSheet(
    video: HTMLVideoElement,
    startFrame: number,
    frameCount: number,
    frameInterval: number,
    frameWidth: number,
    frameHeight: number,
    cols: number,
    rows: number
  ): Promise<Blob> {
    const width = cols * frameWidth
    const height = rows * frameHeight
    
    // 优先使用 OffscreenCanvas（性能更好，不阻塞主线程）
    const canvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(width, height)
      : document.createElement('canvas')
    
    if (canvas instanceof HTMLCanvasElement) {
      canvas.width = width
      canvas.height = height
    }
    
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
    if (!ctx) throw new Error('Failed to get canvas context')
    
    // 填充黑色背景
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, width, height)
    
    // 提取每一帧
    for (let i = 0; i < frameCount; i++) {
      const time = (startFrame + i) * frameInterval
      const col = i % cols
      const row = Math.floor(i / cols)
      
      await this.seekToTime(video, time)
      
      ctx.drawImage(
        video,
        col * frameWidth,
        row * frameHeight,
        frameWidth,
        frameHeight
      )
    }
    
    // 转换为 Blob
    if (canvas instanceof OffscreenCanvas) {
      return canvas.convertToBlob({ type: 'image/webp', quality: 0.8 })
    }
    
    // HTMLCanvas 回退
    return new Promise((resolve, reject) => {
      (canvas as HTMLCanvasElement).toBlob(
        blob => blob ? resolve(blob) : reject(new Error('Canvas toBlob failed')),
        'image/webp',
        0.8
      )
    })
  }

  /**
   * 加载视频并等待元数据
   */
  private static loadVideo(url: string): Promise<HTMLVideoElement> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video')
      video.crossOrigin = 'anonymous'
      video.muted = true
      video.preload = 'metadata'
      
      video.onloadedmetadata = () => resolve(video)
      video.onerror = () => reject(new Error('Failed to load video'))
      
      video.src = url
    })
  }

  /**
   * 精确跳转到指定时间
   */
  private static seekToTime(video: HTMLVideoElement, time: number): Promise<void> {
    return new Promise((resolve) => {
      // 限制在有效范围内
      const targetTime = Math.min(Math.max(0, time), video.duration - 0.1)
      
      if (Math.abs(video.currentTime - targetTime) < 0.01) {
        resolve()
        return
      }
      
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked)
        resolve()
      }
      
      video.addEventListener('seeked', onSeeked)
      video.currentTime = targetTime
    })
  }

  /**
   * 根据时间获取帧在雪碧图中的位置
   * 
   * @param time 时间（秒）
   * @param metadata 雪碧图元数据
   * @returns 雪碧图索引和帧位置
   */
  static getFramePosition(
    time: number,
    metadata: SpriteMetadata
  ): {
    sheetIndex: number
    x: number
    y: number
    frameWidth: number
    frameHeight: number
  } | null {
    if (!metadata.sheets.length) return null
    
    // 计算全局帧索引
    const globalFrame = Math.floor(time / metadata.frameInterval)
    const clampedFrame = Math.min(Math.max(0, globalFrame), metadata.totalFrames - 1)
    
    // 找到对应的雪碧图
    let sheetIndex = 0
    let localFrame = clampedFrame
    
    for (let i = 0; i < metadata.sheets.length; i++) {
      const sheet = metadata.sheets[i]
      if (clampedFrame >= sheet.startFrame && clampedFrame < sheet.startFrame + sheet.frameCount) {
        sheetIndex = i
        localFrame = clampedFrame - sheet.startFrame
        break
      }
    }
    
    const sheet = metadata.sheets[sheetIndex]
    const col = localFrame % sheet.cols
    const row = Math.floor(localFrame / sheet.cols)
    
    return {
      sheetIndex,
      x: col * sheet.frameWidth,
      y: row * sheet.frameHeight,
      frameWidth: sheet.frameWidth,
      frameHeight: sheet.frameHeight
    }
  }

  /**
   * 生成 CSS background-position 样式
   */
  static getBackgroundStyle(
    time: number,
    metadata: SpriteMetadata,
    spriteUrls: string[]
  ): { backgroundImage: string; backgroundPosition: string; backgroundSize: string } | null {
    const pos = this.getFramePosition(time, metadata)
    if (!pos || !spriteUrls[pos.sheetIndex]) return null
    
    const sheet = metadata.sheets[pos.sheetIndex]
    
    return {
      backgroundImage: `url(${spriteUrls[pos.sheetIndex]})`,
      backgroundPosition: `-${pos.x}px -${pos.y}px`,
      backgroundSize: `${sheet.cols * sheet.frameWidth}px ${sheet.rows * sheet.frameHeight}px`
    }
  }
}
