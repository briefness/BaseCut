/**
 * 关键帧动画系统 - 类型定义
 * 
 * 设计原则：
 * 1. 类型安全：严格的 TypeScript 类型
 * 2. 可扩展：支持新增动画属性和缓动类型
 * 3. 性能友好：简洁的数据结构，便于序列化
 */

// ==================== 缓动类型 ====================

/**
 * 预设缓动类型
 * 参考 CSS easing-function 和 After Effects 标准
 */
export type EasingPreset = 
  | 'linear'      // 线性（匀速）
  | 'easeIn'      // 缓入（加速）
  | 'easeOut'     // 缓出（减速）
  | 'easeInOut'   // 缓入缓出（先加速后减速）
  | 'easeInQuad'  // 二次方缓入
  | 'easeOutQuad' // 二次方缓出
  | 'easeInCubic' // 三次方缓入
  | 'easeOutCubic'// 三次方缓出
  | 'easeInOutCubic' // 三次方缓入缓出
  | 'easeInBack'  // 回弹缓入
  | 'easeOutBack' // 回弹缓出
  | 'easeOutElastic' // 弹性缓出

/**
 * 缓动配置
 * 支持预设和自定义贝塞尔曲线
 */
export interface EasingConfig {
  type: EasingPreset | 'cubicBezier'
  // 贝塞尔控制点 [x1, y1, x2, y2]，仅当 type 为 'cubicBezier' 时有效
  bezierHandles?: [number, number, number, number]
}

// ==================== 关键帧 ====================

/**
 * 关键帧
 * 表示在某个时间点的属性值
 */
export interface Keyframe {
  id: string                 // 唯一标识
  time: number               // 相对于片段起始的时间（秒）
  value: number              // 属性值
  easing: EasingConfig       // 到下一个关键帧的缓动配置
}

// ==================== 可动画属性 ====================

/**
 * 可动画化的属性
 * 使用路径表示法，便于扩展
 */
export type AnimatableProperty = 
  // 位置
  | 'position.x'      // X 位置（像素，相对于画布中心）
  | 'position.y'      // Y 位置（像素，相对于画布中心）
  // 缩放
  | 'scale.x'         // X 缩放（1 = 100%）
  | 'scale.y'         // Y 缩放（1 = 100%）
  | 'scale'           // 统一缩放（同时影响 X 和 Y）
  // 旋转
  | 'rotation'        // 旋转角度（度）
  // 透明度
  | 'opacity'         // 透明度（0-1）
  // 锚点
  | 'anchor.x'        // 锚点 X（像素，相对于元素中心）
  | 'anchor.y'        // 锚点 Y（像素，相对于元素中心）

/**
 * 属性默认值映射
 */
export const PROPERTY_DEFAULTS: Record<AnimatableProperty, number> = {
  'position.x': 0,
  'position.y': 0,
  'scale.x': 1,
  'scale.y': 1,
  'scale': 1,
  'rotation': 0,
  'opacity': 1,
  'anchor.x': 0,
  'anchor.y': 0
}

/**
 * 属性范围约束
 */
export const PROPERTY_RANGES: Record<AnimatableProperty, { min?: number, max?: number }> = {
  'position.x': {},
  'position.y': {},
  'scale.x': { min: 0 },
  'scale.y': { min: 0 },
  'scale': { min: 0 },
  'rotation': {},
  'opacity': { min: 0, max: 1 },
  'anchor.x': {},
  'anchor.y': {}
}

// ==================== 动画轨道 ====================

/**
 * 动画轨道
 * 管理单个属性的所有关键帧
 */
export interface AnimationTrack {
  id: string                       // 轨道 ID
  property: AnimatableProperty     // 属性名
  keyframes: Keyframe[]            // 关键帧列表（按时间排序）
  enabled: boolean                 // 是否启用
}

// ==================== 片段动画 ====================

/**
 * 片段动画配置
 * 存储一个片段的所有动画轨道
 */
export interface ClipAnimation {
  clipId: string                   // 关联的片段 ID
  tracks: AnimationTrack[]         // 动画轨道列表
}

// ==================== 变换结果 ====================

/**
 * 动画变换结果
 * 由 AnimationEngine 计算，传递给渲染器
 */
export interface AnimatedTransform {
  // 位置（像素）
  x: number
  y: number
  // 缩放
  scaleX: number
  scaleY: number
  // 旋转（弧度）
  rotation: number
  // 透明度
  opacity: number
  // 锚点（像素）
  anchorX: number
  anchorY: number
}

/**
 * 默认变换（无动画时使用）
 */
export const DEFAULT_TRANSFORM: AnimatedTransform = {
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  opacity: 1,
  anchorX: 0,
  anchorY: 0
}

// ==================== 工具类型 ====================

/**
 * 创建关键帧的参数
 */
export interface CreateKeyframeParams {
  time: number
  value: number
  easing?: EasingConfig
}

/**
 * 更新关键帧的参数
 */
export interface UpdateKeyframeParams {
  time?: number
  value?: number
  easing?: EasingConfig
}
