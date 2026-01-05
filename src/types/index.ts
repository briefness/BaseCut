// ==================== 素材类型 ====================
export type MaterialType = 'video' | 'audio' | 'image'

// 素材处理状态
export type MaterialProcessingStatus = 'local' | 'uploading' | 'processing' | 'ready' | 'error'

// HLS 多码率变体
export interface HlsVariant {
  resolution: string      // 如 "1080p", "720p"
  bandwidth: number       // 带宽
  url: string             // 变体播放列表 URL
}

// 缩略图 Sprite 配置
export interface ThumbnailSprite {
  url: string             // sprite 图片 URL
  width: number           // 单帧宽度
  height: number          // 单帧高度
  columns: number         // 每行帧数
  interval: number        // 帧间隔（秒）
  totalFrames: number     // 总帧数
}

// 关键帧信息（用于精确 seek）
export interface KeyframeInfo {
  times: number[]         // 关键帧时间戳列表
  thumbnails?: string[]   // 关键帧缩略图 URL（可选）
}

export interface Material {
  id: string
  name: string
  type: MaterialType
  file?: File             // 本地模式有值
  duration?: number       // 视频/音频时长（秒）
  width?: number          // 视频/图片宽度
  height?: number         // 视频/图片高度
  thumbnail?: string      // 封面缩略图 URL
  createdAt: number
  
  // === 本地模式 ===
  blobUrl?: string        // 本地 Blob URL
  
  // === 云端模式 ===
  processingStatus?: MaterialProcessingStatus  // 处理状态
  processingProgress?: number                  // 处理进度 0-100
  
  // HLS 流媒体
  hlsUrl?: string                // 主播放列表 URL
  hlsVariants?: HlsVariant[]     // 多码率变体
  
  // 预生成缩略图
  thumbnailSprite?: ThumbnailSprite  // Sprite 缩略图配置
  keyframes?: KeyframeInfo           // 关键帧信息
  
  // 波形数据
  waveformUrl?: string               // 波形数据 JSON URL
  
  // 兼容旧字段
  isConverting?: boolean   // @deprecated 使用 processingStatus
}

// ==================== 轨道类型 ====================
export type TrackType = 'video' | 'audio' | 'text'

export interface Track {
  id: string
  type: TrackType
  name: string
  clips: Clip[]
  muted: boolean
  locked: boolean
}

// ==================== 字幕类型 ====================

// 字幕样式
export interface SubtitleStyle {
  // 基础样式
  fontFamily: string           // 字体
  fontSize: number             // 字号 (px)
  fontWeight: 'normal' | 'bold'
  fontStyle: 'normal' | 'italic'
  color: string                // 文字颜色
  
  // 描边
  strokeEnabled?: boolean
  strokeColor?: string
  strokeWidth?: number
  
  // 阴影
  shadowEnabled?: boolean
  shadowColor?: string
  shadowOffsetX?: number
  shadowOffsetY?: number
  shadowBlur?: number
  
  // 背景
  backgroundEnabled?: boolean
  backgroundColor?: string
  backgroundPadding?: number
  backgroundRadius?: number
  
  // 对齐
  textAlign: 'left' | 'center' | 'right'
  lineHeight: number           // 行高倍数，如 1.5
}

// 字幕位置
export interface SubtitlePosition {
  x: number    // 相对画布宽度的百分比 (0-100)
  y: number    // 相对画布高度的百分比 (0-100)
}

// 字幕动画类型
export type SubtitleAnimationType = 
  | 'none' 
  | 'fadeIn' 
  | 'fadeOut' 
  | 'typewriter' 
  | 'bounce' 
  | 'slideUp' 
  | 'slideDown'
  | 'scale'

// 字幕动画
export interface SubtitleAnimation {
  type: SubtitleAnimationType
  duration: number  // 动画时长 (秒)
}

// 完整字幕配置
export interface Subtitle {
  text: string
  style: SubtitleStyle
  position: SubtitlePosition
  enterAnimation?: SubtitleAnimation
  exitAnimation?: SubtitleAnimation
}

// 默认字幕样式
export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  fontFamily: 'Microsoft YaHei, PingFang SC, sans-serif',
  fontSize: 48,
  fontWeight: 'normal',
  fontStyle: 'normal',
  color: '#ffffff',
  strokeEnabled: true,
  strokeColor: '#000000',
  strokeWidth: 2,
  shadowEnabled: false,
  shadowColor: '#000000',
  shadowOffsetX: 2,
  shadowOffsetY: 2,
  shadowBlur: 4,
  backgroundEnabled: false,
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  backgroundPadding: 8,
  backgroundRadius: 4,
  textAlign: 'center',
  lineHeight: 1.4
}

// 默认字幕位置（底部居中）
export const DEFAULT_SUBTITLE_POSITION: SubtitlePosition = {
  x: 50,
  y: 85
}

// ==================== 片段类型 ====================

export interface Clip {
  id: string
  trackId: string
  materialId?: string  // 关联的素材 ID
  startTime: number    // 在时间轴上的开始时间（秒）
  duration: number     // 片段时长（秒）
  inPoint: number      // 素材入点（秒）
  outPoint: number     // 素材出点（秒）
  effects: Effect[]
  
  // 音频属性（音频轨道专用）
  volume?: number      // 音量 0-100，默认 40
  
  // 字幕（文字轨道专用）
  subtitle?: Subtitle
  
  // @deprecated 使用 subtitle.text
  text?: string
  // @deprecated 使用 subtitle.style.fontSize
  fontSize?: number
  // @deprecated 使用 subtitle.style.color
  fontColor?: string
}

// ==================== 特效类型 ====================
export type EffectType = 'filter' | 'transition' | 'animation'

export interface Effect {
  id: string
  type: EffectType
  name: string
  params: Record<string, number | string | boolean>
}

// ==================== 滤镜参数 ====================
export interface FilterParams {
  brightness: number  // -100 ~ 100
  contrast: number    // -100 ~ 100
  saturation: number  // -100 ~ 100
  hue: number         // 0 ~ 360
  blur: number        // 0 ~ 100
}

// ==================== 项目类型 ====================
export interface Project {
  id: string
  name: string
  width: number       // 画布宽度
  height: number      // 画布高度
  frameRate: number   // 帧率
  duration: number    // 项目总时长
  tracks: Track[]
  createdAt: number
  updatedAt: number
}

// ==================== 播放状态 ====================
export interface PlaybackState {
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number
  playbackRate: number
}

// ==================== Worker 消息类型 ====================
export interface WorkerMessage {
  type: string
  payload: unknown
  id?: string
}

export interface DecodeTask {
  id: string
  materialId: string
  startFrame: number
  endFrame: number
}

// ==================== IndexedDB 存储类型 ====================
export interface DBMaterial {
  id: string
  name: string
  type: MaterialType
  fileData: ArrayBuffer
  mimeType: string
  duration?: number
  width?: number
  height?: number
  thumbnailData?: ArrayBuffer
  createdAt: number
}

export interface DBProject {
  id: string
  name: string
  data: Project
  createdAt: number
  updatedAt: number
}
