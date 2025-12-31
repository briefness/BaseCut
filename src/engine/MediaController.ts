/**
 * MediaController - 媒体播放统一调度器
 * 协调视频池、音频、时钟，实现流畅的多媒体播放
 */

import { VideoPool } from './VideoPool'
import { PlaybackClock } from './PlaybackClock'
import type { Clip, Material } from '@/types'

export interface MediaState {
  currentTime: number
  isPlaying: boolean
  duration: number
  volume: number
}

export interface ActiveMedia {
  clip: Clip
  material: Material
  element: HTMLVideoElement | HTMLAudioElement
}

export class MediaController {
  private videoPool: VideoPool
  private clock: PlaybackClock
  private audioElements: Map<string, HTMLAudioElement> = new Map()
  
  // 当前活跃媒体
  private activeVideo: ActiveMedia | null = null
  private activeAudio: ActiveMedia | null = null
  
  // 音量
  private _volume: number = 1
  
  // 预加载前瞻时间（秒）
  private lookahead: number = 3
  
  // 回调
  private onStateChange?: (state: MediaState) => void
  private getMaterial?: (materialId: string) => Material | null
  private getActiveClips?: (time: number) => Clip[]
  private getTrackType?: (trackId: string) => string | null
  
  constructor() {
    this.videoPool = new VideoPool(6)  // 6 个视频预加载池
    this.clock = new PlaybackClock()
    
    this.clock.setOnEnded(() => {
      this.notifyStateChange()
    })
  }
  
  /**
   * 初始化回调
   */
  init(options: {
    getMaterial: (materialId: string) => Material | null
    getActiveClips: (time: number) => Clip[]
    getTrackType: (trackId: string) => string | null
    onStateChange?: (state: MediaState) => void
  }): void {
    this.getMaterial = options.getMaterial
    this.getActiveClips = options.getActiveClips
    this.getTrackType = options.getTrackType
    this.onStateChange = options.onStateChange
  }
  
  /**
   * 设置时长
   */
  setDuration(duration: number): void {
    this.clock.duration = duration
  }
  
  /**
   * 获取当前时间
   */
  get currentTime(): number {
    return this.clock.currentTime
  }
  
  /**
   * 获取播放状态
   */
  get isPlaying(): boolean {
    return this.clock.isPlaying
  }
  
  /**
   * 获取/设置音量
   */
  get volume(): number {
    return this._volume
  }
  
  set volume(value: number) {
    this._volume = Math.max(0, Math.min(1, value))
    
    // 同步到活跃媒体
    if (this.activeVideo?.element) {
      this.activeVideo.element.volume = this._volume
    }
    if (this.activeAudio?.element) {
      this.activeAudio.element.volume = this._volume
    }
  }
  
  /**
   * 播放
   */
  async play(): Promise<void> {
    this.clock.play()
    
    // 同步媒体播放
    await this.syncMediaPlayback()
    
    this.notifyStateChange()
  }
  
  /**
   * 暂停
   */
  pause(): void {
    this.clock.pause()
    
    // 暂停所有活跃媒体
    if (this.activeVideo?.element && !this.activeVideo.element.paused) {
      this.activeVideo.element.pause()
    }
    if (this.activeAudio?.element && !this.activeAudio.element.paused) {
      this.activeAudio.element.pause()
    }
    
    this.notifyStateChange()
  }
  
  /**
   * 切换播放/暂停
   */
  async toggle(): Promise<void> {
    if (this.clock.isPlaying) {
      this.pause()
    } else {
      await this.play()
    }
  }
  
  /**
   * 跳转
   */
  async seek(time: number): Promise<void> {
    this.clock.seek(time)
    
    // 更新活跃媒体
    await this.updateActiveMedia()
    
    // 同步媒体时间
    await this.syncMediaTime()
    
    this.notifyStateChange()
  }
  
  /**
   * 渲染循环 tick（在 requestAnimationFrame 中调用）
   */
  async tick(): Promise<HTMLVideoElement | null> {
    // 检查是否播放结束
    if (this.clock.checkEnded()) {
      return null
    }
    
    const time = this.clock.currentTime
    
    // 更新活跃媒体
    await this.updateActiveMedia()
    
    // 预加载即将播放的视频
    this.preloadUpcoming(time)
    
    // 同步播放状态
    if (this.clock.isPlaying) {
      await this.syncMediaPlayback()
    }
    
    // 返回当前视频帧
    return this.activeVideo?.element as HTMLVideoElement ?? null
  }
  
  /**
   * 更新活跃媒体
   */
  private async updateActiveMedia(): Promise<void> {
    if (!this.getActiveClips || !this.getMaterial || !this.getTrackType) return
    
    const time = this.clock.currentTime
    const activeClips = this.getActiveClips(time)
    
    // 找到当前视频片段
    const videoClip = activeClips.find(c => {
      if (!c.materialId) return false
      const m = this.getMaterial!(c.materialId)
      return m?.type === 'video'
    })
    
    // 找到当前音频片段
    const audioClip = activeClips.find(c => {
      if (!c.materialId) return false
      const m = this.getMaterial!(c.materialId)
      return m?.type === 'audio'
    })
    
    // 更新活跃视频
    if (videoClip?.materialId) {
      const material = this.getMaterial(videoClip.materialId)
      if (material) {
        // 检查是否需要切换视频
        if (this.activeVideo?.clip.id !== videoClip.id) {
          const url = material.hlsUrl ?? material.blobUrl ?? ''
          if (url) {
            const video = this.videoPool.get(material.id) ?? 
                          await this.videoPool.preload(material.id, url)
            
            this.activeVideo = {
              clip: videoClip,
              material,
              element: video
            }
            video.volume = this._volume
            video.muted = false
          }
        }
      }
    } else {
      this.activeVideo = null
    }
    
    // 更新活跃音频
    if (audioClip?.materialId) {
      const material = this.getMaterial(audioClip.materialId)
      if (material) {
        if (this.activeAudio?.clip.id !== audioClip.id) {
          let audio = this.audioElements.get(material.id)
          
          if (!audio) {
            audio = document.createElement('audio')
            audio.preload = 'auto'
            audio.src = material.blobUrl ?? ''
            this.audioElements.set(material.id, audio)
          }
          
          this.activeAudio = {
            clip: audioClip,
            material,
            element: audio
          }
          audio.volume = this._volume
        }
      }
    } else {
      if (this.activeAudio?.element && !this.activeAudio.element.paused) {
        this.activeAudio.element.pause()
      }
      this.activeAudio = null
    }
  }
  
  /**
   * 同步媒体时间
   */
  private async syncMediaTime(): Promise<void> {
    const time = this.clock.currentTime
    
    // 同步视频时间
    if (this.activeVideo) {
      const clip = this.activeVideo.clip
      const clipTime = time - clip.startTime + clip.inPoint
      const video = this.activeVideo.element as HTMLVideoElement
      
      if (Math.abs(video.currentTime - clipTime) > 0.1) {
        video.currentTime = clipTime
      }
    }
    
    // 同步音频时间
    if (this.activeAudio) {
      const clip = this.activeAudio.clip
      const clipTime = time - clip.startTime + clip.inPoint
      const audio = this.activeAudio.element as HTMLAudioElement
      
      if (Math.abs(audio.currentTime - clipTime) > 0.1) {
        audio.currentTime = clipTime
      }
    }
  }
  
  /**
   * 同步媒体播放状态
   */
  private async syncMediaPlayback(): Promise<void> {
    await this.syncMediaTime()
    
    // 播放视频
    if (this.activeVideo) {
      const video = this.activeVideo.element as HTMLVideoElement
      if (video.paused && video.readyState >= 2) {
        try {
          await video.play()
        } catch (e) {
          console.warn('[MediaController] 视频播放失败:', e)
        }
      }
    }
    
    // 播放音频
    if (this.activeAudio) {
      const audio = this.activeAudio.element as HTMLAudioElement
      if (audio.paused && audio.readyState >= 2) {
        try {
          await audio.play()
        } catch (e) {
          console.warn('[MediaController] 音频播放失败:', e)
        }
      }
    }
  }
  
  /**
   * 预加载即将播放的视频
   */
  private preloadUpcoming(currentTime: number): void {
    if (!this.getActiveClips || !this.getMaterial) return
    
    // 查找未来 lookahead 秒内的视频片段
    const futureTime = currentTime + this.lookahead
    const futureClips = this.getActiveClips(futureTime)
    
    for (const clip of futureClips) {
      if (!clip.materialId) continue
      
      const material = this.getMaterial(clip.materialId)
      if (material?.type === 'video') {
        const url = material.hlsUrl ?? material.blobUrl ?? ''
        if (url && !this.videoPool.has(material.id)) {
          // 后台预加载
          this.videoPool.preload(material.id, url).catch(() => {})
        }
      }
    }
  }
  
  /**
   * 获取当前状态
   */
  getState(): MediaState {
    return {
      currentTime: this.clock.currentTime,
      isPlaying: this.clock.isPlaying,
      duration: this.clock.duration,
      volume: this._volume
    }
  }
  
  /**
   * 通知状态变化
   */
  private notifyStateChange(): void {
    this.onStateChange?.(this.getState())
  }
  
  /**
   * 销毁
   */
  destroy(): void {
    this.pause()
    this.videoPool.destroy()
    
    for (const [, audio] of this.audioElements) {
      audio.pause()
      audio.src = ''
    }
    this.audioElements.clear()
    
    this.activeVideo = null
    this.activeAudio = null
  }
}

// 导出单例
export const mediaController = new MediaController()
