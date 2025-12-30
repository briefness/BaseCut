/**
 * WebCodecs 加速导出器
 * 使用 Mediabunny + WebCodecs API 进行硬件加速视频编码
 */
import {
  Output,
  Mp4OutputFormat,
  BufferTarget,
  CanvasSource,
  QUALITY_HIGH,
  QUALITY_MEDIUM,
  QUALITY_LOW
} from 'mediabunny'
import type { FilterParams } from '@/types'

// 导出片段信息
export interface WebCodecsExportClip {
  videoElement: HTMLVideoElement  // 已加载的视频元素
  startTime: number               // 片段在时间线上的开始时间（秒）
  duration: number                // 片段时长（秒）
  inPoint: number                 // 素材入点（秒）
  outPoint: number                // 素材出点（秒）
  filters?: Partial<FilterParams> // 滤镜参数
}

// 导出选项
export interface WebCodecsExportOptions {
  clips: WebCodecsExportClip[]    // 要导出的片段列表
  width: number                   // 输出宽度
  height: number                  // 输出高度
  frameRate: number               // 帧率
  videoBitrate?: number           // 视频码率 (bps)，默认 5Mbps
  quality?: 'low' | 'medium' | 'high'  // 质量预设
}

export class WebCodecsExporter {
  private progressCallback: ((progress: number) => void) | null = null
  private aborted = false

  /**
   * 检测浏览器是否支持 WebCodecs
   */
  static isSupported(): boolean {
    return (
      typeof VideoEncoder !== 'undefined' &&
      typeof VideoFrame !== 'undefined' &&
      typeof EncodedVideoChunk !== 'undefined'
    )
  }

  /**
   * 获取支持的编解码器
   */
  static async getSupportedCodec(): Promise<string | null> {
    if (!this.isSupported()) return null

    // 优先尝试 H.264 (AVC)
    const codecs = [
      'avc1.42001f',  // H.264 Baseline
      'avc1.4d001f',  // H.264 Main
      'avc1.64001f',  // H.264 High
    ]

    for (const codec of codecs) {
      try {
        const support = await VideoEncoder.isConfigSupported({
          codec,
          width: 1920,
          height: 1080,
          bitrate: 5_000_000,
          framerate: 30
        })
        if (support.supported) {
          console.log(`[WebCodecsExporter] 支持编解码器: ${codec}`)
          return codec
        }
      } catch {
        // 继续尝试下一个
      }
    }

    return null
  }

  /**
   * 设置进度回调
   */
  onProgress(callback: (progress: number) => void): void {
    this.progressCallback = callback
  }

  /**
   * 中止导出
   */
  abort(): void {
    this.aborted = true
  }

  /**
   * 导出视频
   */
  async export(options: WebCodecsExportOptions): Promise<Blob> {
    this.aborted = false

    const { clips, width, height, frameRate, videoBitrate, quality = 'high' } = options

    if (clips.length === 0) {
      throw new Error('没有可导出的片段')
    }

    console.log(`[WebCodecsExporter] 开始导出: ${clips.length} 个片段, ${width}x${height}@${frameRate}fps`)

    // 创建离屏画布
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('无法创建 Canvas 上下文')
    }

    // 获取质量预设
    const qualityPreset = quality === 'high' ? QUALITY_HIGH : quality === 'medium' ? QUALITY_MEDIUM : QUALITY_LOW

    // 创建 Mediabunny 输出
    const output = new Output({
      format: new Mp4OutputFormat(),
      target: new BufferTarget()
    })

    // 添加视频轨道，使用 CanvasSource
    const videoSource = new CanvasSource(canvas, {
      codec: 'avc',  // H.264
      bitrate: videoBitrate ?? qualityPreset,
      framerate: frameRate
    })
    output.addVideoTrack(videoSource)

    // 计算总帧数和总时长
    const sortedClips = [...clips].sort((a, b) => a.startTime - b.startTime)
    let totalDuration = 0
    for (const clip of sortedClips) {
      totalDuration += clip.outPoint - clip.inPoint
    }
    const totalFrames = Math.ceil(totalDuration * frameRate)
    const frameDuration = 1000 / frameRate  // 毫秒

    console.log(`[WebCodecsExporter] 总帧数: ${totalFrames}, 总时长: ${totalDuration}s`)

    // 启动输出
    await output.start()

    let globalFrameIndex = 0

    // 处理每个片段
    for (const clip of sortedClips) {
      if (this.aborted) break

      const clipDuration = clip.outPoint - clip.inPoint
      const clipFrames = Math.ceil(clipDuration * frameRate)

      console.log(`[WebCodecsExporter] 处理片段: ${clip.inPoint}s - ${clip.outPoint}s (${clipFrames} 帧)`)

      // 逐帧处理
      for (let i = 0; i < clipFrames && !this.aborted; i++) {
        const clipTime = clip.inPoint + (i / frameRate)
        
        // 设置视频时间并等待
        clip.videoElement.currentTime = clipTime
        await this.waitForSeek(clip.videoElement)

        // 绘制到画布
        ctx.drawImage(clip.videoElement, 0, 0, width, height)

        // 提交帧到 CanvasSource
        await videoSource.captureFrame()

        globalFrameIndex++

        // 更新进度
        if (this.progressCallback) {
          const progress = globalFrameIndex / totalFrames
          this.progressCallback(Math.min(progress, 0.99))
        }

        // 让出主线程处理,避免阻塞UI
        if (globalFrameIndex % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 0))
        }
      }
    }

    // 完成封装
    await output.finalize()
    const { buffer } = output.target as BufferTarget

    console.log(`[WebCodecsExporter] 导出完成: ${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB`)

    if (this.progressCallback) {
      this.progressCallback(1)
    }

    return new Blob([buffer], { type: 'video/mp4' })
  }

  /**
   * 等待视频 seek 完成
   */
  private waitForSeek(video: HTMLVideoElement): Promise<void> {
    return new Promise((resolve) => {
      if (video.readyState >= 2) {
        // 已经可以播放
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked)
          resolve()
        }
        video.addEventListener('seeked', onSeeked)
        
        // 如果当前时间已设置，可能不会触发 seeked
        setTimeout(() => {
          video.removeEventListener('seeked', onSeeked)
          resolve()
        }, 50)
      } else {
        // 等待视频加载
        const onCanPlay = () => {
          video.removeEventListener('canplay', onCanPlay)
          resolve()
        }
        video.addEventListener('canplay', onCanPlay)
      }
    })
  }

  /**
   * 从 Blob URL 创建视频元素
   */
  static createVideoElement(url: string): Promise<HTMLVideoElement> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video')
      video.muted = true
      video.playsInline = true
      video.preload = 'auto'
      
      video.onloadedmetadata = () => {
        resolve(video)
      }
      
      video.onerror = () => {
        reject(new Error('视频加载失败'))
      }
      
      video.src = url
    })
  }
}

// 单例导出
export const webCodecsExporter = new WebCodecsExporter()
