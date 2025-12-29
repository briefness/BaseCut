// ==================== 素材类型 ====================
export type MaterialType = 'video' | 'audio' | 'image'

export interface Material {
  id: string
  name: string
  type: MaterialType
  file: File
  blobUrl: string
  hlsUrl?: string           // HLS 播放 URL（转换后）
  isConverting?: boolean    // 是否正在转换
  duration?: number  // 视频/音频时长（秒）
  width?: number     // 视频/图片宽度
  height?: number    // 视频/图片高度
  thumbnail?: string // 缩略图 Blob URL
  createdAt: number
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

export interface Clip {
  id: string
  trackId: string
  materialId?: string  // 关联的素材 ID
  startTime: number    // 在时间轴上的开始时间（秒）
  duration: number     // 片段时长（秒）
  inPoint: number      // 素材入点（秒）
  outPoint: number     // 素材出点（秒）
  effects: Effect[]
  // 文字轨道专用
  text?: string
  fontSize?: number
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
