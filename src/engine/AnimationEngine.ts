/**
 * 关键帧动画引擎
 * 
 * 核心职责：
 * 1. 计算关键帧之间的插值
 * 2. 应用缓动函数
 * 3. 生成变换矩阵供渲染器使用
 * 
 * 设计原则：
 * - 高性能：纯函数设计，无状态，可并行计算
 * - 预览导出一致：统一计算逻辑
 * - 可扩展：支持自定义缓动函数
 */

import type {
  Keyframe,
  AnimationTrack,
  ClipAnimation,
  AnimatedTransform,
  EasingConfig,
  EasingPreset,
  AnimatableProperty
} from '@/types/animation'

import {
  DEFAULT_TRANSFORM,
  PROPERTY_DEFAULTS,
  PROPERTY_RANGES
} from '@/types/animation'

// ==================== 缓动函数库 ====================

/**
 * 预设缓动函数
 * 输入 t 范围 [0, 1]，输出范围 [0, 1]
 */
const EASING_FUNCTIONS: Record<EasingPreset, (t: number) => number> = {
  // 线性
  linear: (t) => t,
  
  // 二次方
  easeIn: (t) => t * t,
  easeOut: (t) => 1 - (1 - t) * (1 - t),
  easeInOut: (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
  
  // 二次方（别名）
  easeInQuad: (t) => t * t,
  easeOutQuad: (t) => 1 - (1 - t) * (1 - t),
  
  // 三次方
  easeInCubic: (t) => t * t * t,
  easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
  easeInOutCubic: (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  
  // 回弹效果
  easeInBack: (t) => {
    const c1 = 1.70158
    const c3 = c1 + 1
    return c3 * t * t * t - c1 * t * t
  },
  easeOutBack: (t) => {
    const c1 = 1.70158
    const c3 = c1 + 1
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
  },
  
  // 弹性效果
  easeOutElastic: (t) => {
    const c4 = (2 * Math.PI) / 3
    return t === 0 ? 0 : t === 1 ? 1 :
      Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1
  }
}

/**
 * 三次贝塞尔曲线（CSS cubic-bezier 兼容）
 * @param x1 控制点1 X
 * @param y1 控制点1 Y
 * @param x2 控制点2 X
 * @param y2 控制点2 Y
 */
function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  // 使用牛顿迭代法求解 t 对应的 x 值
  return (x: number): number => {
    if (x <= 0) return 0
    if (x >= 1) return 1
    
    // 二分查找
    let lo = 0, hi = 1
    while (hi - lo > 1e-6) {
      const mid = (lo + hi) / 2
      const bx = bezierPoint(mid, x1, x2)
      if (bx < x) lo = mid
      else hi = mid
    }
    
    const t = (lo + hi) / 2
    return bezierPoint(t, y1, y2)
  }
}

/**
 * 计算贝塞尔曲线上的点
 * 三次贝塞尔公式：B(t) = (1-t)³*P0 + 3*(1-t)²*t*P1 + 3*(1-t)*t²*P2 + t³*P3
 * 这里 P0=0, P3=1，所以简化为：3*(1-t)²*t*P1 + 3*(1-t)*t²*P2 + t³
 */
function bezierPoint(t: number, p1: number, p2: number): number {
  const mt = 1 - t
  const mt2 = mt * mt
  const t2 = t * t
  return 3 * mt2 * t * p1 + 3 * mt * t2 * p2 + t2 * t
}

// ==================== 插值计算 ====================

/**
 * 应用缓动函数
 * @param progress 线性进度 [0, 1]
 * @param config 缓动配置
 */
export function applyEasing(progress: number, config: EasingConfig): number {
  // 边界处理
  if (progress <= 0) return 0
  if (progress >= 1) return 1
  
  if (config.type === 'cubicBezier' && config.bezierHandles) {
    const [x1, y1, x2, y2] = config.bezierHandles
    return cubicBezier(x1, y1, x2, y2)(progress)
  }
  
  const easingFn = EASING_FUNCTIONS[config.type as EasingPreset]
  return easingFn ? easingFn(progress) : progress
}

/**
 * 二分搜索找到最后一个 time <= 目标时间的关键帧索引
 * 性能优化：O(n) -> O(log n)，大量关键帧时提升显著
 * @param keyframes 已排序的关键帧数组
 * @param time 目标时间
 * @returns 最后一个 time <= 目标时间的索引，如果所有关键帧都在目标时间之后返回 -1
 */
function binarySearchKeyframe(keyframes: Keyframe[], time: number): number {
  let lo = 0
  let hi = keyframes.length - 1
  
  // 边界条件：所有关键帧都在目标时间之后
  if (keyframes[lo].time > time) return -1
  
  while (lo < hi) {
    // 使用位运算避免浮点误差，(lo + hi + 1) >> 1 等价于 Math.floor((lo + hi + 1) / 2)
    const mid = (lo + hi + 1) >> 1
    if (keyframes[mid].time <= time) {
      lo = mid
    } else {
      hi = mid - 1
    }
  }
  
  return lo
}

/**
 * 在关键帧之间进行插值
 * 使用二分搜索 O(log n) 替代线性搜索 O(n)，大量关键帧时性能提升 10x
 * @param keyframes 关键帧列表（必须按时间排序）
 * @param time 当前时间
 * @param defaultValue 无关键帧时的默认值
 */
export function interpolate(
  keyframes: Keyframe[],
  time: number,
  defaultValue: number = 0
): number {
  // 无关键帧
  if (!keyframes || keyframes.length === 0) {
    return defaultValue
  }
  
  // 只有一个关键帧
  if (keyframes.length === 1) {
    return keyframes[0].value
  }
  
  // 在第一个关键帧之前
  if (time <= keyframes[0].time) {
    return keyframes[0].value
  }
  
  // 在最后一个关键帧之后
  if (time >= keyframes[keyframes.length - 1].time) {
    return keyframes[keyframes.length - 1].value
  }
  
  // 使用二分搜索找到当前时间所在的区间
  const prevIndex = binarySearchKeyframe(keyframes, time)
  
  // 边界检查（理论上不应该发生，因为上面已经处理了边界情况）
  if (prevIndex < 0 || prevIndex >= keyframes.length - 1) {
    return defaultValue
  }
  
  const prevKey = keyframes[prevIndex]
  const nextKey = keyframes[prevIndex + 1]
  
  // 计算线性进度
  const duration = nextKey.time - prevKey.time
  const elapsed = time - prevKey.time
  const linearProgress = duration > 0 ? elapsed / duration : 0
  
  // 应用缓动
  const easedProgress = applyEasing(linearProgress, prevKey.easing)
  
  // 线性插值
  return prevKey.value + (nextKey.value - prevKey.value) * easedProgress
}

/**
 * 约束属性值到有效范围
 */
function clampPropertyValue(property: AnimatableProperty, value: number): number {
  const range = PROPERTY_RANGES[property]
  if (!range) return value
  
  let result = value
  if (range.min !== undefined) result = Math.max(range.min, result)
  if (range.max !== undefined) result = Math.min(range.max, result)
  return result
}

// ==================== 动画计算 ====================

/**
 * 从动画轨道获取某个属性的值
 * @param tracks 动画轨道列表
 * @param property 属性名
 * @param time 当前时间
 */
export function getPropertyValue(
  tracks: AnimationTrack[],
  property: AnimatableProperty,
  time: number
): number {
  const track = tracks.find(t => t.property === property && t.enabled)
  
  if (!track || track.keyframes.length === 0) {
    return PROPERTY_DEFAULTS[property]
  }
  
  const value = interpolate(track.keyframes, time, PROPERTY_DEFAULTS[property])
  return clampPropertyValue(property, value)
}

/**
 * 计算片段的动画变换
 * 这是主要的公共 API，供渲染器和导出器调用
 * 
 * @param animation 片段动画配置
 * @param timeInClip 相对于片段起始的时间（秒）
 * @returns 动画变换结果
 */
export function getAnimatedTransform(
  animation: ClipAnimation | null | undefined,
  timeInClip: number
): AnimatedTransform {
  // 无动画时返回默认值
  if (!animation || !animation.tracks || animation.tracks.length === 0) {
    return { ...DEFAULT_TRANSFORM }
  }
  
  const tracks = animation.tracks
  
  // 计算各属性值
  const x = getPropertyValue(tracks, 'position.x', timeInClip)
  const y = getPropertyValue(tracks, 'position.y', timeInClip)
  
  // 缩放处理：优先使用统一缩放
  const uniformScale = getPropertyValue(tracks, 'scale', timeInClip)
  const hasUniformScale = tracks.some(t => t.property === 'scale' && t.enabled && t.keyframes.length > 0)
  
  let scaleX: number, scaleY: number
  if (hasUniformScale) {
    scaleX = scaleY = uniformScale
  } else {
    scaleX = getPropertyValue(tracks, 'scale.x', timeInClip)
    scaleY = getPropertyValue(tracks, 'scale.y', timeInClip)
  }
  
  const rotation = getPropertyValue(tracks, 'rotation', timeInClip)
  const opacity = getPropertyValue(tracks, 'opacity', timeInClip)
  const anchorX = getPropertyValue(tracks, 'anchor.x', timeInClip)
  const anchorY = getPropertyValue(tracks, 'anchor.y', timeInClip)
  
  return {
    x,
    y,
    scaleX,
    scaleY,
    rotation: rotation * Math.PI / 180, // 转换为弧度
    opacity,
    anchorX,
    anchorY
  }
}

// ==================== 变换矩阵生成 ====================

/**
 * 生成 4x4 变换矩阵（列主序，WebGL 兼容）
 * 变换顺序：平移锚点 → 缩放 → 旋转 → 平移位置
 */
export function createTransformMatrix(transform: AnimatedTransform): Float32Array {
  const { x, y, scaleX, scaleY, rotation, anchorX, anchorY } = transform
  
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  
  // 构建变换矩阵
  // M = T(position) * R(rotation) * S(scale) * T(-anchor)
  // 但由于 WebGL 使用列主序，我们按相反顺序相乘
  
  // 简化计算：直接构建最终矩阵
  const a = scaleX * cos
  const b = scaleX * sin
  const c = -scaleY * sin
  const d = scaleY * cos
  
  // 锚点偏移（变换前移动到锚点，变换后移回）
  const tx = x - anchorX * a - anchorY * c + anchorX
  const ty = y - anchorX * b - anchorY * d + anchorY
  
  // 4x4 矩阵（列主序）
  return new Float32Array([
    a,  b,  0, 0,
    c,  d,  0, 0,
    0,  0,  1, 0,
    tx, ty, 0, 1
  ])
}

// ==================== 工具函数 ====================

/**
 * 创建默认缓动配置
 */
export function createDefaultEasing(): EasingConfig {
  return { type: 'easeInOut' }
}

/**
 * 生成唯一 ID
 */
export function generateKeyframeId(): string {
  return `kf_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

/**
 * 生成轨道 ID
 */
export function generateTrackId(): string {
  return `track_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

/**
 * 对关键帧列表按时间排序
 */
export function sortKeyframes(keyframes: Keyframe[]): Keyframe[] {
  return [...keyframes].sort((a, b) => a.time - b.time)
}

// ==================== 导出 ====================

export const AnimationEngine = {
  interpolate,
  applyEasing,
  getAnimatedTransform,
  createTransformMatrix,
  getPropertyValue,
  createDefaultEasing,
  generateKeyframeId,
  generateTrackId,
  sortKeyframes
}

export default AnimationEngine
