/**
 * PlaybackClock - 精确播放时钟
 * 独立于 Pinia 状态，避免频繁状态更新导致的性能问题
 */

export type ClockCallback = (time: number) => void

export class PlaybackClock {
  private startTimestamp: number = 0      // 播放开始时的 performance.now()
  private startPosition: number = 0       // 播放开始时的时间线位置
  private _currentTime: number = 0        // 当前时间（暂停时使用）
  private _isPlaying: boolean = false
  private _playbackRate: number = 1
  private _duration: number = 0
  
  // 回调
  private onTimeUpdate?: ClockCallback
  private onEnded?: () => void
  
  /**
   * 获取当前播放时间（高精度）
   */
  get currentTime(): number {
    if (this._isPlaying) {
      const elapsed = (performance.now() - this.startTimestamp) / 1000
      const time = this.startPosition + elapsed * this._playbackRate
      return Math.min(time, this._duration)
    }
    return this._currentTime
  }
  
  /**
   * 设置当前时间
   */
  set currentTime(value: number) {
    this._currentTime = Math.max(0, Math.min(value, this._duration))
    if (this._isPlaying) {
      // 重置播放起点
      this.startTimestamp = performance.now()
      this.startPosition = this._currentTime
    }
  }
  
  get isPlaying(): boolean {
    return this._isPlaying
  }
  
  get playbackRate(): number {
    return this._playbackRate
  }
  
  set playbackRate(value: number) {
    if (this._isPlaying) {
      // 保存当前时间，然后用新速率重新开始
      this._currentTime = this.currentTime
      this.startTimestamp = performance.now()
      this.startPosition = this._currentTime
    }
    this._playbackRate = value
  }
  
  get duration(): number {
    return this._duration
  }
  
  set duration(value: number) {
    this._duration = value
  }
  
  /**
   * 开始播放
   */
  play(): void {
    if (this._isPlaying) return
    
    this._isPlaying = true
    this.startTimestamp = performance.now()
    this.startPosition = this._currentTime
  }
  
  /**
   * 暂停播放
   */
  pause(): void {
    if (!this._isPlaying) return
    
    this._currentTime = this.currentTime
    this._isPlaying = false
  }
  
  /**
   * 切换播放/暂停
   */
  toggle(): void {
    if (this._isPlaying) {
      this.pause()
    } else {
      this.play()
    }
  }
  
  /**
   * 跳转到指定时间
   */
  seek(time: number): void {
    this.currentTime = time
    this.onTimeUpdate?.(this.currentTime)
  }
  
  /**
   * 检查是否到达末尾
   */
  checkEnded(): boolean {
    if (this._isPlaying && this.currentTime >= this._duration) {
      this.pause()
      this._currentTime = 0
      this.onEnded?.()
      return true
    }
    return false
  }
  
  /**
   * 设置时间更新回调
   */
  setOnTimeUpdate(callback: ClockCallback): void {
    this.onTimeUpdate = callback
  }
  
  /**
   * 设置播放结束回调
   */
  setOnEnded(callback: () => void): void {
    this.onEnded = callback
  }
  
  /**
   * 重置时钟
   */
  reset(): void {
    this._isPlaying = false
    this._currentTime = 0
    this.startTimestamp = 0
    this.startPosition = 0
  }
}

// 导出单例
export const playbackClock = new PlaybackClock()
