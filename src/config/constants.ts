/**
 * 全局配置常量
 * 
 * 集中管理项目中的所有配置常量，便于维护和调整
 * 避免在代码中硬编码数值
 * 
 * @module config/constants
 */

// ==================== 渲染相关 ====================

/** 渲染循环 Pinia 同步间隔（毫秒），20fps 足够 UI 更新 */
export const RENDER_SYNC_INTERVAL = 50

/** 转场预加载提前时间（秒） */
export const TRANSITION_PRELOAD_AHEAD = 1.5

/** 视频 seek 时间漂移容差（秒） */
export const SEEK_DRIFT_THRESHOLD = 0.1

/** 暂停状态 seek 容差（秒） */
export const PAUSE_SEEK_THRESHOLD = 0.05

// ==================== 缓存相关 ====================

/** 缩略图缓存最大数量 */
export const THUMBNAIL_CACHE_MAX_SIZE = 100

/** 帧图片缓存最大数量 */
export const FRAME_IMAGE_CACHE_MAX_SIZE = 50

/** 图片缓存最大数量 */
export const IMAGE_CACHE_MAX_SIZE = 30

/** 视频池默认大小 */
export const VIDEO_POOL_DEFAULT_SIZE = 6

// ==================== 雪碧图相关 ====================

/** 雪碧图单帧宽度（像素） */
export const SPRITE_FRAME_WIDTH = 160

/** 雪碧图单帧高度（16:9 比例，像素） */
export const SPRITE_FRAME_HEIGHT = 90

/** 单张雪碧图最大尺寸（像素，GPU 兼容性限制） */
export const SPRITE_MAX_SHEET_SIZE = 4096

/** 雪碧图每秒采样帧数 */
export const SPRITE_FRAMES_PER_SECOND = 1

/** 单张雪碧图最大帧数 */
export const SPRITE_MAX_FRAMES_PER_SHEET = 100

// ==================== 存储配额相关 ====================

/** 存储警告阈值（使用量占比） */
export const STORAGE_WARNING_THRESHOLD = 0.8

/** 存储临界阈值（触发清理） */
export const STORAGE_CRITICAL_THRESHOLD = 0.9

/** 清理目标剩余空间占比 */
export const STORAGE_TARGET_FREE_PERCENT = 0.3

// ==================== 上传相关 ====================

/** 批量上传默认并发数 */
export const UPLOAD_CONCURRENCY = 3

// ==================== 时间线相关 ====================

/** 默认轨道高度（像素） */
export const TRACK_HEIGHT = 48

/** 最小片段时长（秒） */
export const MIN_CLIP_DURATION = 0.1

/** 默认字幕时长（秒） */
export const DEFAULT_SUBTITLE_DURATION = 3

// ==================== 播放相关 ====================

/** 最小播放速率 */
export const MIN_PLAYBACK_RATE = 0.25

/** 最大播放速率 */
export const MAX_PLAYBACK_RATE = 4.0

/** 默认音量 */
export const DEFAULT_VOLUME = 1.0

// ==================== 导出相关 ====================

/** 默认视频码率（bps） */
export const DEFAULT_VIDEO_BITRATE = 8_000_000

/** 默认帧率 */
export const DEFAULT_FRAME_RATE = 30

/** 导出帧缓冲释放间隔（帧数） */
export const EXPORT_BUFFER_RELEASE_INTERVAL = 30

// ==================== 动画相关 ====================

/** 过渡动画持续时间（毫秒） */
export const TRANSITION_DURATION_FAST = 150

export const TRANSITION_DURATION_NORMAL = 250

export const TRANSITION_DURATION_SLOW = 350
