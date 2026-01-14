// ==================== 素材类型 ====================

// 导出特效类型
export * from './effects'

export type MaterialType = 'video' | 'audio' | 'image' | 'sticker'

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
export type TrackType = 'video' | 'audio' | 'text' | 'sticker'

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

// ==================== 变换属性 ====================
export interface Transform {
  x: number           // 屏幕坐标 x% (0-100)
  y: number           // 屏幕坐标 y% (0-100)
  scale: number       // 缩放比例 (1 = 100%) - 兼容旧数据，等比缩放时使用
  scaleX?: number     // X轴缩放比例 - 非等比缩放时使用
  scaleY?: number     // Y轴缩放比例 - 非等比缩放时使用
  rotation: number    // 旋转角度 (度)
  opacity: number     // 不透明度 (0-1)
}

export const DEFAULT_TRANSFORM: Transform = {
  x: 50,
  y: 50,
  scale: 1,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  opacity: 1
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
  
  // [新增] 变换属性 (用于画中画、贴纸等)
  transform?: Transform
  
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

// ==================== 转场类型 ====================
export type TransitionType = 
  | 'fade'        // 淡入淡出
  | 'slideLeft'   // 从左滑入
  | 'slideRight'  // 从右滑入
  | 'slideUp'     // 从上滑入
  | 'slideDown'   // 从下滑入
  | 'zoom'        // 缩放
  | 'blur'        // 模糊过渡
  | 'wipe'        // 擦除
  | 'dissolve'    // 溶解

export interface Transition {
  id: string
  type: TransitionType
  duration: number      // 转场时长（秒），默认 0.5
  clipAId: string       // 前一个片段 ID
  clipBId: string       // 后一个片段 ID
}

// 转场效果预设
export interface TransitionPreset {
  type: TransitionType
  name: string          // 显示名称
  icon: string          // 图标
  defaultDuration: number
}

// 预定义的转场效果列表
export const TRANSITION_PRESETS: TransitionPreset[] = [
  { type: 'fade', name: '淡入淡出', icon: '🌅', defaultDuration: 0.5 },
  { type: 'dissolve', name: '溶解', icon: '✨', defaultDuration: 0.5 },
  { type: 'slideLeft', name: '向左滑动', icon: '⬅️', defaultDuration: 0.5 },
  { type: 'slideRight', name: '向右滑动', icon: '➡️', defaultDuration: 0.5 },
  { type: 'slideUp', name: '向上滑动', icon: '⬆️', defaultDuration: 0.5 },
  { type: 'slideDown', name: '向下滑动', icon: '⬇️', defaultDuration: 0.5 },
  { type: 'zoom', name: '缩放', icon: '🔍', defaultDuration: 0.5 },
  { type: 'blur', name: '模糊', icon: '🌫️', defaultDuration: 0.5 },
  { type: 'wipe', name: '擦除', icon: '🧹', defaultDuration: 0.5 },
]

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
  
  // 雪碧图缓存
  spriteSheets?: ArrayBuffer[]   // 雪碧图二进制数据（可能多张）
  spriteMetadata?: {
    totalFrames: number
    frameInterval: number
    totalDuration: number
    frameWidth: number
    frameHeight: number
    sheets: Array<{
      index: number
      cols: number
      rows: number
      frameWidth: number
      frameHeight: number
      frameCount: number
      startFrame: number
      startTime: number
    }>
  }
}

export interface DBProject {
  id: string
  name: string
  data: Project
  createdAt: number
  updatedAt: number
}
