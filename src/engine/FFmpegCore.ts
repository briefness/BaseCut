/**
 * FFmpeg WASM 核心
 * 封装 FFmpeg WASM，支持视频转码、音频提取等功能
 */
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile } from '@ffmpeg/util'

export interface TranscodeOptions {
  inputFile: File
  outputFormat: string
  videoBitrate?: string
  audioBitrate?: string
  width?: number
  height?: number
}

export interface ExtractAudioOptions {
  inputFile: File
  outputFormat: 'mp3' | 'wav' | 'aac'
  bitrate?: string
}

export class FFmpegCore {
  private ffmpeg: FFmpeg | null = null
  private loaded = false
  private loading = false
  private progressCallback: ((progress: number) => void) | null = null
  private logCallback: ((message: string) => void) | null = null

  /**
   * 加载 FFmpeg WASM
   */
  async load(): Promise<void> {
    if (this.loaded) return
    if (this.loading) {
      // 等待加载完成
      while (this.loading) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      return
    }

    this.loading = true

    try {
      this.ffmpeg = new FFmpeg()

      // 设置日志回调
      this.ffmpeg.on('log', ({ message }) => {
        if (this.logCallback) {
          this.logCallback(message)
        }
      })

      // 设置进度回调
      this.ffmpeg.on('progress', ({ progress }) => {
        if (this.progressCallback) {
          this.progressCallback(progress)
        }
      })

      // 加载本地 FFmpeg 核心文件（使用 fetch + Blob URL 绕过 Vite 限制）
      console.log('[FFmpegCore] 加载本地 FFmpeg 核心...')
      
      // 将本地文件转换为 Blob URL
      const coreResponse = await fetch('/ffmpeg/ffmpeg-core.js')
      const coreBlob = await coreResponse.blob()
      const coreURL = URL.createObjectURL(coreBlob)
      
      const wasmResponse = await fetch('/ffmpeg/ffmpeg-core.wasm')
      const wasmBlob = await wasmResponse.blob()
      const wasmURL = URL.createObjectURL(wasmBlob)
      
      await this.ffmpeg.load({
        coreURL,
        wasmURL
      })

      this.loaded = true
      console.log('[FFmpegCore] 加载完成')
    } catch (error) {
      console.error('[FFmpegCore] 加载失败:', error)
      throw error
    } finally {
      this.loading = false
    }
  }

  /**
   * 设置进度回调
   */
  onProgress(callback: (progress: number) => void): void {
    this.progressCallback = callback
  }

  /**
   * 设置日志回调
   */
  onLog(callback: (message: string) => void): void {
    this.logCallback = callback
  }

  /**
   * 视频转码
   */
  async transcode(options: TranscodeOptions): Promise<Blob> {
    await this.load()
    if (!this.ffmpeg) throw new Error('FFmpeg 未加载')

    const inputName = 'input' + this.getExtension(options.inputFile.name)
    const outputName = 'output.' + options.outputFormat

    // 写入输入文件
    await this.ffmpeg.writeFile(inputName, await fetchFile(options.inputFile))

    // 构建命令参数
    const args: string[] = ['-i', inputName]

    if (options.videoBitrate) {
      args.push('-b:v', options.videoBitrate)
    }
    if (options.audioBitrate) {
      args.push('-b:a', options.audioBitrate)
    }
    if (options.width && options.height) {
      args.push('-vf', `scale=${options.width}:${options.height}`)
    }

    args.push('-y', outputName)

    // 执行转码
    await this.ffmpeg.exec(args)

    // 读取输出文件
    const data = await this.ffmpeg.readFile(outputName)
    
    // 清理临时文件
    await this.ffmpeg.deleteFile(inputName)
    await this.ffmpeg.deleteFile(outputName)

    return new Blob([data], { type: this.getMimeType(options.outputFormat) })
  }

  /**
   * 提取音频
   */
  async extractAudio(options: ExtractAudioOptions): Promise<Blob> {
    await this.load()
    if (!this.ffmpeg) throw new Error('FFmpeg 未加载')

    const inputName = 'input' + this.getExtension(options.inputFile.name)
    const outputName = 'output.' + options.outputFormat

    await this.ffmpeg.writeFile(inputName, await fetchFile(options.inputFile))

    const args: string[] = ['-i', inputName, '-vn']

    if (options.bitrate) {
      args.push('-b:a', options.bitrate)
    }

    args.push('-y', outputName)

    await this.ffmpeg.exec(args)

    const data = await this.ffmpeg.readFile(outputName)

    await this.ffmpeg.deleteFile(inputName)
    await this.ffmpeg.deleteFile(outputName)

    return new Blob([data], { type: this.getMimeType(options.outputFormat) })
  }

  /**
   * 提取视频帧
   */
  async extractFrames(
    file: File,
    timestamps: number[],
    width?: number
  ): Promise<Blob[]> {
    await this.load()
    if (!this.ffmpeg) throw new Error('FFmpeg 未加载')

    const inputName = 'input' + this.getExtension(file.name)
    await this.ffmpeg.writeFile(inputName, await fetchFile(file))

    const frames: Blob[] = []

    for (let i = 0; i < timestamps.length; i++) {
      const outputName = `frame_${i}.jpg`
      const args: string[] = [
        '-ss', timestamps[i].toString(),
        '-i', inputName,
        '-frames:v', '1'
      ]

      if (width) {
        args.push('-vf', `scale=${width}:-1`)
      }

      args.push('-y', outputName)

      await this.ffmpeg.exec(args)

      const data = await this.ffmpeg.readFile(outputName)
      frames.push(new Blob([data], { type: 'image/jpeg' }))
      await this.ffmpeg.deleteFile(outputName)
    }

    await this.ffmpeg.deleteFile(inputName)

    return frames
  }

  /**
   * 生成缩略图
   */
  async generateThumbnail(file: File, time = 0, width = 160): Promise<Blob> {
    const frames = await this.extractFrames(file, [time], width)
    return frames[0]
  }

  /**
   * 将视频转换为 HLS 格式
   * 返回 m3u8 播放列表和 ts 分片文件
   */
  async convertToHLS(file: File, options?: {
    segmentDuration?: number  // 分片时长（秒），默认 4
    videoBitrate?: string     // 视频码率，如 '2M'
    audioBitrate?: string     // 音频码率，如 '128k'
  }): Promise<{
    playlist: Blob           // m3u8 播放列表
    segments: Blob[]         // ts 分片文件
    playlistUrl: string      // Blob URL
  }> {
    await this.load()
    if (!this.ffmpeg) throw new Error('FFmpeg 未加载')

    const segmentDuration = options?.segmentDuration ?? 4
    const inputName = 'input' + this.getExtension(file.name)
    const playlistName = 'output.m3u8'
    const segmentPattern = 'segment_%03d.ts'

    // 写入输入文件
    await this.ffmpeg.writeFile(inputName, await fetchFile(file))

    // 构建 HLS 转换参数
    const args: string[] = [
      '-i', inputName,
      '-codec', 'copy',                           // 尽可能不重新编码
      '-start_number', '0',
      '-hls_time', segmentDuration.toString(),    // 分片时长
      '-hls_list_size', '0',                      // 包含所有分片
      '-hls_segment_filename', segmentPattern,
      '-f', 'hls'
    ]

    // 如果需要重新编码
    if (options?.videoBitrate || options?.audioBitrate) {
      args.splice(2, 2) // 移除 -codec copy
      if (options?.videoBitrate) {
        args.push('-b:v', options.videoBitrate)
      }
      if (options?.audioBitrate) {
        args.push('-b:a', options.audioBitrate)
      }
    }

    args.push('-y', playlistName)

    console.log('[FFmpegCore] HLS 转换参数:', args.join(' '))

    // 执行转换
    await this.ffmpeg.exec(args)

    // 读取 m3u8 播放列表
    const playlistData = await this.ffmpeg.readFile(playlistName)
    const playlistBlob = new Blob([playlistData], { type: 'application/vnd.apple.mpegurl' })
    const playlistText = new TextDecoder().decode(playlistData as Uint8Array)

    // 解析 m3u8 获取分片文件名
    const segmentNames = playlistText
      .split('\n')
      .filter(line => line.endsWith('.ts'))
      .map(line => line.trim())

    // 读取所有分片
    const segments: Blob[] = []
    for (const segName of segmentNames) {
      try {
        const segData = await this.ffmpeg.readFile(segName)
        segments.push(new Blob([segData], { type: 'video/mp2t' }))
        await this.ffmpeg.deleteFile(segName)
      } catch (e) {
        console.warn(`[FFmpegCore] 无法读取分片 ${segName}:`, e)
      }
    }

    // 清理文件
    await this.ffmpeg.deleteFile(inputName)
    await this.ffmpeg.deleteFile(playlistName)

    // 创建内存中的 HLS 结构并生成可播放的 URL
    const playlistUrl = this.createHLSBlobUrl(playlistBlob, segments, segmentNames)

    console.log(`[FFmpegCore] HLS 转换完成: ${segments.length} 个分片`)

    return { playlist: playlistBlob, segments, playlistUrl }
  }

  /**
   * 创建可播放的 HLS Blob URL
   * 由于 HLS 需要相对路径加载 ts 分片，我们需要创建一个特殊的结构
   */
  private createHLSBlobUrl(playlist: Blob, segments: Blob[], segmentNames: string[]): string {
    // 创建分片的 Blob URL 映射
    const segmentUrls: Map<string, string> = new Map()
    segments.forEach((seg, index) => {
      const url = URL.createObjectURL(seg)
      segmentUrls.set(segmentNames[index], url)
    })

    // 修改 m3u8 内容，将分片文件名替换为 Blob URL
    const reader = new FileReader()
    let modifiedPlaylist = ''
    
    return new Promise<string>((resolve) => {
      reader.onload = () => {
        const content = reader.result as string
        modifiedPlaylist = content
        
        // 替换分片路径为 Blob URL
        segmentNames.forEach(name => {
          const blobUrl = segmentUrls.get(name)
          if (blobUrl) {
            modifiedPlaylist = modifiedPlaylist.replace(name, blobUrl)
          }
        })
        
        // 创建修改后的 m3u8 Blob URL
        const modifiedBlob = new Blob([modifiedPlaylist], { type: 'application/vnd.apple.mpegurl' })
        const playlistUrl = URL.createObjectURL(modifiedBlob)
        
        resolve(playlistUrl)
      }
      reader.readAsText(playlist)
    }) as unknown as string
  }

  /**
   * 同步创建 HLS Blob URL（阻塞版本）
   */
  async createHLSBlobUrlAsync(playlist: Blob, segments: Blob[], segmentNames: string[]): Promise<string> {
    // 创建分片的 Blob URL
    const segmentUrls: Map<string, string> = new Map()
    segments.forEach((seg, index) => {
      const url = URL.createObjectURL(seg)
      segmentUrls.set(segmentNames[index], url)
    })

    // 读取 m3u8 内容
    const content = await playlist.text()
    
    // 替换分片路径为 Blob URL
    let modifiedPlaylist = content
    segmentNames.forEach(name => {
      const blobUrl = segmentUrls.get(name)
      if (blobUrl) {
        modifiedPlaylist = modifiedPlaylist.replace(name, blobUrl)
      }
    })
    
    // 创建修改后的 m3u8 Blob URL
    const modifiedBlob = new Blob([modifiedPlaylist], { type: 'application/vnd.apple.mpegurl' })
    return URL.createObjectURL(modifiedBlob)
  }

  /**
   * 获取视频信息
   */
  async getVideoInfo(file: File): Promise<{
    duration: number
    width: number
    height: number
    frameRate: number
  }> {
    await this.load()
    if (!this.ffmpeg) throw new Error('FFmpeg 未加载')

    const inputName = 'input' + this.getExtension(file.name)
    await this.ffmpeg.writeFile(inputName, await fetchFile(file))

    // 使用 ffprobe 风格的输出
    let logOutput = ''
    const originalCallback = this.logCallback
    this.logCallback = (msg) => {
      logOutput += msg + '\n'
    }

    await this.ffmpeg.exec(['-i', inputName])

    this.logCallback = originalCallback
    await this.ffmpeg.deleteFile(inputName)

    // 解析信息
    const durationMatch = logOutput.match(/Duration: (\d+):(\d+):(\d+\.\d+)/)
    const resolutionMatch = logOutput.match(/(\d{2,4})x(\d{2,4})/)
    const fpsMatch = logOutput.match(/(\d+(?:\.\d+)?) fps/)

    return {
      duration: durationMatch
        ? parseInt(durationMatch[1]) * 3600 +
          parseInt(durationMatch[2]) * 60 +
          parseFloat(durationMatch[3])
        : 0,
      width: resolutionMatch ? parseInt(resolutionMatch[1]) : 0,
      height: resolutionMatch ? parseInt(resolutionMatch[2]) : 0,
      frameRate: fpsMatch ? parseFloat(fpsMatch[1]) : 30
    }
  }

  /**
   * 获取文件扩展名
   */
  private getExtension(filename: string): string {
    const match = filename.match(/\.[^.]+$/)
    return match ? match[0] : '.mp4'
  }

  /**
   * 获取 MIME 类型
   */
  private getMimeType(format: string): string {
    const mimeTypes: Record<string, string> = {
      mp4: 'video/mp4',
      webm: 'video/webm',
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      aac: 'audio/aac'
    }
    return mimeTypes[format] ?? 'application/octet-stream'
  }

  /**
   * 检查是否已加载
   */
  isLoaded(): boolean {
    return this.loaded
  }

  /**
   * 终止操作
   */
  terminate(): void {
    if (this.ffmpeg) {
      this.ffmpeg.terminate()
      this.ffmpeg = null
      this.loaded = false
    }
  }
}

// 单例导出
export const ffmpegCore = new FFmpegCore()
