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
  AudioBufferSource,
  QUALITY_HIGH,
  QUALITY_MEDIUM,
  QUALITY_LOW
} from 'mediabunny'
import type { Subtitle, Transform } from '@/types'
import { subtitleRenderer, type RenderContext } from '@/utils/SubtitleRenderer'
import { WebGLRenderer } from '@/engine/WebGLRenderer'

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

// 贴纸片段信息
export interface WebCodecsStickerClip {
  image: HTMLImageElement | ImageBitmap
  transform: Transform
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

// 转场信息
export interface WebCodecsTransition {
  clipAIndex: number              // 第一个片段索引
  clipBIndex: number              // 第二个片段索引
  type: string                    // 转场类型
  duration: number                // 转场时长（秒）
}

// 导出配置
export interface WebCodecsExportOptions {
  clips: WebCodecsExportClip[]
  subtitleClips?: WebCodecsSubtitleClip[]
  audioClips?: WebCodecsAudioClip[]
  stickerClips?: WebCodecsStickerClip[]
  transitions?: WebCodecsTransition[]
  width: number
  height: number
  frameRate: number
  videoBitrate: number
  quality?: 'high' | 'medium' | 'low'
}

export class WebCodecsExporter {
  private progressCallback: ((progress: number) => void) | null = null
  private aborted = false
  private renderer: WebGLRenderer | null = null

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
      audioClips = [],
      stickerClips = [],
      transitions = [],
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

    console.log(`[WebCodecsExporter] 开始导出: ${clips.length} 个视频, ${subtitleClips.length} 个字幕, ${width}x${height}@${frameRate}fps`)

    // 1. 创建 WebGL 画布（用于视频渲染）
    const webglCanvas = document.createElement('canvas')
    webglCanvas.width = width
    webglCanvas.height = height
    this.renderer = new WebGLRenderer(webglCanvas)

    // 2. 创建合成画布（用于字幕叠加和最终输出）
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    // @ts-ignore
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
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

    // 添加音频轨道（如果有音频片段）
    let audioSource: AudioBufferSource | null = null
    
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
    
    // 也考虑音频的结束时间
    for (const audio of audioClips) {
      const audioEnd = audio.startTime + audio.duration
      if (audioEnd > totalDuration) {
        totalDuration = audioEnd
      }
    }

    const totalFrames = Math.ceil(totalDuration * frameRate)
    const frameDuration = 1 / frameRate  // 每帧时长（秒）

    console.log(`[WebCodecsExporter] 总帧数: ${totalFrames}, 总时长: ${totalDuration.toFixed(2)}s`)

    // 混合音频（如果有音频片段）- 先混合，稍后在 start() 之后添加
    let mixedBuffer: AudioBuffer | null = null
    
    if (audioClips.length > 0) {
      console.log(`[WebCodecsExporter] 混合 ${audioClips.length} 个音频片段`)
      
      const sampleRate = audioClips[0].audioBuffer.sampleRate
      const numberOfChannels = Math.max(...audioClips.map(a => a.audioBuffer.numberOfChannels))
      const outputLength = Math.ceil(totalDuration * sampleRate)
      
      // 使用 OfflineAudioContext 混合音频
      const offlineCtx = new OfflineAudioContext(numberOfChannels, outputLength, sampleRate)
      
      for (const audioClip of audioClips) {
        const source = offlineCtx.createBufferSource()
        source.buffer = audioClip.audioBuffer
        
        // 应用音量
        const gainNode = offlineCtx.createGain()
        gainNode.gain.value = audioClip.volume
        
        source.connect(gainNode)
        gainNode.connect(offlineCtx.destination)
        
        // 从 inPoint 开始，在 startTime 位置播放
        source.start(audioClip.startTime, audioClip.inPoint, audioClip.duration)
      }
      
      mixedBuffer = await offlineCtx.startRendering()
      console.log(`[WebCodecsExporter] 音频混合完成: ${mixedBuffer.duration.toFixed(2)}s`)
      
      // 创建音频源并添加到输出（但不添加数据，留到 start() 之后）
      audioSource = new AudioBufferSource({
        codec: 'aac',
        bitrate: 128_000  // 128kbps
      })
      output.addAudioTrack(audioSource)
    }

    // 启动输出
    await output.start()
    
    // 在 start() 之后添加混合后的音频
    if (audioSource && mixedBuffer) {
      await audioSource.add(mixedBuffer)
      console.log(`[WebCodecsExporter] 音频已添加到输出`)
    }

    // 按时间线时间逐帧处理
    for (let frameIndex = 0; frameIndex < totalFrames && !this.aborted; frameIndex++) {
      const timelineTime = frameIndex / frameRate
      
      // 1. 检查是否在转场区域
      let isInTransition = false
      for (const trans of transitions) {
        // [修复] 转场索引是基于原始 clips 列表的，不能使用排序后的 sortedClips
        const clipA = clips[trans.clipAIndex]
        const clipB = clips[trans.clipBIndex]
        if (!clipA || !clipB) continue
        
        // 转场区域：clipB 开始时间为中心
        const transitionStart = clipB.startTime - trans.duration / 2
        const transitionEnd = clipB.startTime + trans.duration / 2
        
        if (timelineTime >= transitionStart && timelineTime < transitionEnd) {
          isInTransition = true
          const progress = (timelineTime - transitionStart) / trans.duration
          
          // 首帧输出调试信息
          if (frameIndex % 30 === 0) {
            console.log(`[WebCodecsExporter] WebGL渲染转场: ${trans.type}, time=${timelineTime.toFixed(2)}, progress=${progress.toFixed(2)}`)
          }
          // 缓动函数：easeInOutCubic
          const easedProgress = progress < 0.5 
            ? 4 * progress * progress * progress 
            : 1 - Math.pow(-2 * progress + 2, 3) / 2
          
          // 渲染帧 A
          const clipTimeA = clipA.inPoint + (timelineTime - clipA.startTime)
          clipA.videoElement.currentTime = Math.max(0, clipTimeA)
          await this.waitForSeek(clipA.videoElement)
          
          // 渲染帧 B
          const clipTimeB = clipB.inPoint + (timelineTime - clipB.startTime)
          clipB.videoElement.currentTime = Math.max(0, clipTimeB)
          await this.waitForSeek(clipB.videoElement)
          
          // 使用 WebGL 硬件加速渲染转场
          if (this.renderer) {
            this.renderer.renderTransition(
              clipA.videoElement,
              clipB.videoElement,
              easedProgress,
              trans.type
            )
          }
          break
        }
      }
      
      // 2. 如果不在转场区域，正常渲染单帧
      if (!isInTransition) {
        const activeClip = sortedClips.find(clip => 
          timelineTime >= clip.startTime && 
          timelineTime < clip.startTime + clip.duration
        )
        
        if (activeClip && this.renderer) {
          const clipTime = activeClip.inPoint + (timelineTime - activeClip.startTime)
          activeClip.videoElement.currentTime = clipTime
          await this.waitForSeek(activeClip.videoElement)
          // WebGL 渲染单帧
          this.renderer.renderFrame(activeClip.videoElement)
        } else if (this.renderer) {
           // 黑屏 (WebGL渲染器负责清空)
           this.renderer.clear()
        }
      }
      
      // 2.a 渲染贴纸 (Overlay)
      if (this.renderer && stickerClips.length > 0) {
         const activeStickers = stickerClips.filter(s => 
           timelineTime >= s.startTime && timelineTime < s.startTime + s.duration
         )
         // 按 ZIndex (这里假设 array order 就是 Z order)
         for (const sticker of activeStickers) {
            this.renderer.renderOverlay(sticker.image, sticker.transform)
         }
      }
      
      // 3. 将 WebGL 画布内容绘制到合成画布
      if (webglCanvas) {
         ctx.drawImage(webglCanvas, 0, 0)
      }
      
      // 4. 渲染字幕（叠加在视频上）
      // 使用合成画布的 ctx（2D）
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
      
      // 5. 使用正确的 Mediabunny API 添加帧
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
  /**
   * 等待视频 seek 完成并确保帧已渲染
   */
  private async waitForSeek(video: HTMLVideoElement): Promise<void> {
    // 1. 等待 seeking 结束
    if (video.seeking) {
      await new Promise<void>(resolve => {
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked)
          resolve()
        }
        video.addEventListener('seeked', onSeeked, { once: true })
      })
    } else if (video.readyState < 2) {
      // 还没加载好数据
      await new Promise<void>(resolve => {
        const onCanPlay = () => {
          video.removeEventListener('canplay', onCanPlay)
          resolve()
        }
        video.addEventListener('canplay', onCanPlay, { once: true })
      })
    }

    // 2. 关键：等待帧实际上传到 GPU/合成器
    // 解决快速 seek 时画面未更新导致"跳帧"或"黑屏"的问题
    if ('requestVideoFrameCallback' in video) {
      await Promise.race([
        new Promise<void>(resolve => {
          // @ts-ignore - TS 可能还没包含这个 API 定义
          video.requestVideoFrameCallback(() => {
             // console.log('[Exporter] Frame synced via rVFC')
             resolve()
          })
        }),
        // [修复] 防止 rVFC 在后台或未挂载元素上不触发导致的死锁
        // 设置 100ms 超时强制继续
        new Promise<void>(resolve => setTimeout(resolve, 100))
      ])
    } else {
      // 降级方案
      await new Promise(resolve => setTimeout(resolve, 50))
    }
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
