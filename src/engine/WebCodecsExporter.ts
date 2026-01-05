/**
 * WebCodecs 加速导出器
 * 使用 Mediabunny + WebCodecs API 进行硬件加速视频编码
 * 支持：视频拼接、音频混合、字幕烧录
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
import type { Subtitle } from '@/types'
import { subtitleRenderer, type RenderContext } from '@/utils/SubtitleRenderer'

// 导出片段信息
export interface WebCodecsExportClip {
  videoElement: HTMLVideoElement  // 已加载的视频元素
  startTime: number               // 片段在时间线上的开始时间（秒）
  duration: number                // 片段时长（秒）
  inPoint: number                 // 素材入点（秒）
  outPoint: number                // 素材出点（秒）
}

// 字幕片段信息
export interface WebCodecsSubtitleClip {
  subtitle: Subtitle              // 字幕配置（包含样式和位置）
  startTime: number               // 片段在时间线上的开始时间（秒）
  duration: number                // 片段时长（秒）
}

// 音频片段信息
export interface WebCodecsAudioClip {
  audioBuffer: AudioBuffer        // 已解码的音频数据
  startTime: number               // 片段在时间线上的开始时间（秒）
  duration: number                // 片段时长（秒）
  inPoint: number                 // 素材入点（秒）
  outPoint: number                // 素材出点（秒）
  volume: number                  // 音量 0-1，默认 0.4
}

// 导出选项
export interface WebCodecsExportOptions {
  clips: WebCodecsExportClip[]           // 视频片段列表
  subtitleClips?: WebCodecsSubtitleClip[] // 字幕片段列表
  audioClips?: WebCodecsAudioClip[]      // 音频片段列表
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
   * 使用较小分辨率检测，避免在某些环境下 1080p 不支持导致误判
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
        // 使用较小分辨率检测，实际编码时会使用用户选择的分辨率
        const support = await VideoEncoder.isConfigSupported({
          codec,
          width: 640,
          height: 480,
          bitrate: 1_000_000,
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
   * 按时间线时间逐帧处理，支持视频拼接和字幕烧录
   */
  async export(options: WebCodecsExportOptions): Promise<Blob> {
    this.aborted = false

    const { 
      clips, 
      subtitleClips = [], 
      width, 
      height, 
      frameRate, 
      videoBitrate, 
      quality = 'high' 
    } = options

    if (clips.length === 0) {
      throw new Error('没有可导出的片段')
    }

    console.log(`[WebCodecsExporter] 开始导出: ${clips.length} 个视频, ${subtitleClips.length} 个字幕, ${width}x${height}@${frameRate}fps`)

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
      bitrate: videoBitrate ?? qualityPreset
    })
    output.addVideoTrack(videoSource)

    // 计算时间线总时长（基于所有片段的最大结束时间）
    const sortedClips = [...clips].sort((a, b) => a.startTime - b.startTime)
    let totalDuration = 0
    
    for (const clip of sortedClips) {
      const clipEnd = clip.startTime + clip.duration
      if (clipEnd > totalDuration) {
        totalDuration = clipEnd
      }
    }
    
    // 也考虑字幕的结束时间
    for (const sub of subtitleClips) {
      const subEnd = sub.startTime + sub.duration
      if (subEnd > totalDuration) {
        totalDuration = subEnd
      }
    }

    const totalFrames = Math.ceil(totalDuration * frameRate)
    const frameDuration = 1 / frameRate  // 每帧时长（秒）

    console.log(`[WebCodecsExporter] 总帧数: ${totalFrames}, 总时长: ${totalDuration.toFixed(2)}s`)

    // 启动输出
    await output.start()

    // 按时间线时间逐帧处理
    for (let frameIndex = 0; frameIndex < totalFrames && !this.aborted; frameIndex++) {
      const timelineTime = frameIndex / frameRate
      
      // 清空画布（黑色背景）
      ctx.fillStyle = '#000000'
      ctx.fillRect(0, 0, width, height)
      
      // 1. 查找当前时间活跃的视频片段
      const activeClip = sortedClips.find(clip => 
        timelineTime >= clip.startTime && 
        timelineTime < clip.startTime + clip.duration
      )
      
      // 2. 渲染视频帧
      if (activeClip) {
        const clipTime = activeClip.inPoint + (timelineTime - activeClip.startTime)
        activeClip.videoElement.currentTime = clipTime
        await this.waitForSeek(activeClip.videoElement)
        ctx.drawImage(activeClip.videoElement, 0, 0, width, height)
      }
      
      // 3. 渲染字幕（叠加在视频上）
      for (const subClip of subtitleClips) {
        if (timelineTime >= subClip.startTime && 
            timelineTime < subClip.startTime + subClip.duration) {
          const renderContext: RenderContext = {
            ctx,
            canvasWidth: width,
            canvasHeight: height,
            currentTime: timelineTime,
            clipStartTime: subClip.startTime,
            clipDuration: subClip.duration
          }
          subtitleRenderer.render(subClip.subtitle, renderContext)
        }
      }
      
      // 4. 使用正确的 Mediabunny API 添加帧
      // add(timestamp, duration) - timestamp 和 duration 都是秒
      await videoSource.add(timelineTime, frameDuration)

      // 更新进度
      if (this.progressCallback) {
        const progress = (frameIndex + 1) / totalFrames
        this.progressCallback(Math.min(progress, 0.99))
      }

      // 让出主线程处理，避免阻塞 UI
      if (frameIndex % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 0))
      }
    }

    // 完成封装
    await output.finalize()
    const { buffer } = output.target as BufferTarget

    if (!buffer) {
      throw new Error('导出失败：输出缓冲区为空')
    }

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
   * 从 URL 创建视频元素
   */
  static createVideoElement(url: string): Promise<HTMLVideoElement> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video')
      video.muted = true
      video.playsInline = true
      video.preload = 'auto'
      video.crossOrigin = 'anonymous'
      
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
