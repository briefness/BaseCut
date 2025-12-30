/**
 * 波形提取工具类
 * 支持缓存、分段提取和性能优化
 */

interface WaveformCacheItem {
  peaks: number[]
  duration: number
  lastAccessed: number
}

interface ExtractWaveformOptions {
  samplesPerSecond?: number  // 每秒采样点数，默认 100
  channel?: number           // 声道，默认 0（左声道）
}

class WaveformExtractor {
  private cache: Map<string, WaveformCacheItem> = new Map()
  private maxCacheSize: number
  private pendingRequests: Map<string, Promise<number[]>> = new Map()
  private audioContext: AudioContext | null = null
  
  constructor(maxCacheSize = 50) {
    this.maxCacheSize = maxCacheSize
  }
  
  /**
   * 获取或创建 AudioContext
   */
  private getAudioContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new AudioContext()
    }
    return this.audioContext
  }
  
  /**
   * 生成缓存键
   */
  private getCacheKey(materialId: string, samplesPerSecond: number): string {
    return `${materialId}_${samplesPerSecond}`
  }
  
  /**
   * 从缓存获取波形
   */
  getFromCache(materialId: string, samplesPerSecond: number): number[] | null {
    const key = this.getCacheKey(materialId, samplesPerSecond)
    const item = this.cache.get(key)
    if (item) {
      item.lastAccessed = Date.now()
      return item.peaks
    }
    return null
  }
  
  /**
   * 清理最久未使用的缓存项
   */
  private evictIfNeeded(): void {
    if (this.cache.size < this.maxCacheSize) return
    
    let oldestKey: string | null = null
    let oldestTime = Infinity
    
    for (const [key, item] of this.cache) {
      if (item.lastAccessed < oldestTime) {
        oldestTime = item.lastAccessed
        oldestKey = key
      }
    }
    
    if (oldestKey) {
      this.cache.delete(oldestKey)
    }
  }
  
  /**
   * 提取完整波形数据
   */
  async extractWaveform(
    audioUrl: string,
    materialId: string,
    options: ExtractWaveformOptions = {}
  ): Promise<number[]> {
    const { samplesPerSecond = 100, channel = 0 } = options
    
    // 检查缓存
    const cached = this.getFromCache(materialId, samplesPerSecond)
    if (cached) return cached
    
    // 检查是否有正在进行的相同请求
    const cacheKey = this.getCacheKey(materialId, samplesPerSecond)
    const pendingRequest = this.pendingRequests.get(cacheKey)
    if (pendingRequest) return pendingRequest
    
    // 创建新的提取请求
    const extractPromise = this.doExtractWaveform(audioUrl, materialId, samplesPerSecond, channel)
    this.pendingRequests.set(cacheKey, extractPromise)
    
    try {
      const result = await extractPromise
      return result
    } finally {
      this.pendingRequests.delete(cacheKey)
    }
  }
  
  /**
   * 实际执行波形提取
   */
  private async doExtractWaveform(
    audioUrl: string,
    materialId: string,
    samplesPerSecond: number,
    channel: number
  ): Promise<number[]> {
    // 获取音频数据
    const response = await fetch(audioUrl)
    const arrayBuffer = await response.arrayBuffer()
    
    // 解码音频
    const audioContext = this.getAudioContext()
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
    
    // 获取指定声道数据
    const channelData = audioBuffer.getChannelData(Math.min(channel, audioBuffer.numberOfChannels - 1))
    
    // 计算采样参数
    const duration = audioBuffer.duration
    const totalSamples = Math.ceil(duration * samplesPerSecond)
    const samplesPerPeak = Math.floor(channelData.length / totalSamples)
    
    // 提取峰值
    const peaks: number[] = []
    for (let i = 0; i < totalSamples; i++) {
      const start = i * samplesPerPeak
      const end = Math.min(start + samplesPerPeak, channelData.length)
      
      let maxPeak = 0
      for (let j = start; j < end; j++) {
        const absValue = Math.abs(channelData[j])
        if (absValue > maxPeak) {
          maxPeak = absValue
        }
      }
      peaks.push(maxPeak)
    }
    
    // 保存到缓存
    this.saveToCache(materialId, samplesPerSecond, peaks, duration)
    
    return peaks
  }
  
  /**
   * 保存波形到缓存
   */
  private saveToCache(materialId: string, samplesPerSecond: number, peaks: number[], duration: number): void {
    this.evictIfNeeded()
    
    const key = this.getCacheKey(materialId, samplesPerSecond)
    this.cache.set(key, {
      peaks,
      duration,
      lastAccessed: Date.now()
    })
  }
  
  /**
   * 获取指定时间范围的波形片段
   */
  getWaveformSlice(
    peaks: number[],
    totalDuration: number,
    inPoint: number,
    outPoint: number,
    targetSamples: number
  ): number[] {
    if (peaks.length === 0 || totalDuration <= 0) return []
    
    const samplesPerSecond = peaks.length / totalDuration
    const startIndex = Math.floor(inPoint * samplesPerSecond)
    const endIndex = Math.ceil(outPoint * samplesPerSecond)
    
    // 提取范围内的采样点
    const slicePeaks = peaks.slice(startIndex, endIndex)
    
    // 如果目标采样数与当前采样数差异较大，进行重采样
    if (Math.abs(slicePeaks.length - targetSamples) > targetSamples * 0.2) {
      return this.resample(slicePeaks, targetSamples)
    }
    
    return slicePeaks
  }
  
  /**
   * 重采样波形数据
   */
  private resample(peaks: number[], targetLength: number): number[] {
    if (peaks.length === 0 || targetLength <= 0) return []
    if (peaks.length === targetLength) return peaks
    
    const result: number[] = []
    const ratio = peaks.length / targetLength
    
    for (let i = 0; i < targetLength; i++) {
      const start = Math.floor(i * ratio)
      const end = Math.ceil((i + 1) * ratio)
      
      let maxPeak = 0
      for (let j = start; j < end && j < peaks.length; j++) {
        if (peaks[j] > maxPeak) {
          maxPeak = peaks[j]
        }
      }
      result.push(maxPeak)
    }
    
    return result
  }
  
  /**
   * 清理指定素材的缓存
   */
  clearCache(materialId?: string): void {
    if (materialId) {
      for (const key of this.cache.keys()) {
        if (key.startsWith(materialId)) {
          this.cache.delete(key)
        }
      }
    } else {
      this.cache.clear()
    }
  }
  
  /**
   * 获取缓存统计
   */
  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize
    }
  }
  
  /**
   * 销毁实例
   */
  destroy(): void {
    this.cache.clear()
    this.pendingRequests.clear()
    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }
  }
}

// 导出单例
export const waveformExtractor = new WaveformExtractor(50)
export { WaveformExtractor }
export type { ExtractWaveformOptions }
