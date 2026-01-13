/**
 * 视频特效类型定义
 * 
 * 设计原则：
 * 1. 可扩展性 - 新特效只需添加类型和着色器
 * 2. 高性能 - 所有特效通过 GPU 渲染
 * 3. 类型安全 - 完整的 TypeScript 类型定义
 */

// ==================== 特效类型枚举 ====================

/**
 * 视频特效类型
 * 参考剪映等专业工具的特效分类
 */
export type VideoEffectType =
  | 'flash'         // 闪白 - 画面瞬间变白
  | 'shake'         // 震动 - 画面抖动
  | 'glitch'        // 故障 - RGB 分离 + 扫描线 + 随机偏移
  | 'radialBlur'    // 径向模糊 - 从中心向外发散的模糊
  | 'chromatic'     // 色差 - RGB 通道分离偏移
  | 'pixelate'      // 像素化 - 马赛克效果
  | 'invert'        // 负片 - 颜色反转
  | 'filmGrain'     // 老电影 - 噪点 + 划痕 + 闪烁
  | 'vignette'      // 晕影 - 边缘暗角
  | 'splitScreen'   // 分屏 - 2/3/4 分屏复制

// ==================== 特效参数定义 ====================

/**
 * 闪白特效参数
 */
export interface FlashParams {
  intensity: number       // 强度 0-1，1 为纯白
  color: string           // 闪光颜色，默认 #ffffff
}

/**
 * 震动特效参数
 */
export interface ShakeParams {
  intensity: number       // 震动强度 0-1
  frequency: number       // 震动频率（次/秒）
  direction: 'horizontal' | 'vertical' | 'both'  // 震动方向
}

/**
 * 故障特效参数
 */
export interface GlitchParams {
  intensity: number       // 故障强度 0-1
  rgbSplit: number        // RGB 分离程度 0-1
  scanlineIntensity: number  // 扫描线强度 0-1
  blockGlitch: boolean    // 是否启用块状故障
}

/**
 * 径向模糊特效参数
 */
export interface RadialBlurParams {
  intensity: number       // 模糊强度 0-1
  centerX: number         // 中心点 X (0-1)
  centerY: number         // 中心点 Y (0-1)
  samples: number         // 采样次数，越高越平滑（8-32）
}

/**
 * 色差特效参数
 */
export interface ChromaticParams {
  intensity: number       // 色差强度 0-1
  angle: number           // 分离角度 (0-360)
}

/**
 * 像素化特效参数
 */
export interface PixelateParams {
  pixelSize: number       // 像素块大小 (1-100)
}

/**
 * 负片特效参数
 */
export interface InvertParams {
  intensity: number       // 反转强度 0-1（可用于渐变）
}

/**
 * 老电影特效参数
 */
export interface FilmGrainParams {
  grainIntensity: number  // 噪点强度 0-1
  scratchIntensity: number // 划痕强度 0-1
  flickerIntensity: number // 闪烁强度 0-1
  sepiaAmount: number     // 复古色调强度 0-1
}

/**
 * 晕影特效参数
 */
export interface VignetteParams {
  intensity: number       // 暗角强度 0-1
  radius: number          // 暗角半径 0-1
  softness: number        // 边缘柔和度 0-1
}

/**
 * 分屏特效参数
 */
export interface SplitScreenParams {
  splitCount: 2 | 3 | 4   // 分屏数量
  direction: 'horizontal' | 'vertical' | 'grid'  // 分屏方向
  gap: number             // 分屏间隙 (像素)
}

/**
 * 各特效参数类型映射（用于类型推导）
 */
export interface EffectParamsMap {
  flash: FlashParams
  shake: ShakeParams
  glitch: GlitchParams
  radialBlur: RadialBlurParams
  chromatic: ChromaticParams
  pixelate: PixelateParams
  invert: InvertParams
  filmGrain: FilmGrainParams
  vignette: VignetteParams
  splitScreen: SplitScreenParams
}

/**
 * 所有特效参数的联合类型
 */
export type AllEffectParams = 
  | FlashParams 
  | ShakeParams 
  | GlitchParams 
  | RadialBlurParams 
  | ChromaticParams 
  | PixelateParams 
  | InvertParams 
  | FilmGrainParams 
  | VignetteParams 
  | SplitScreenParams

/**
 * 带类型标签的特效参数（用于判别联合类型）
 */
export type EffectParams =
  | { type: 'flash'; params: FlashParams }
  | { type: 'shake'; params: ShakeParams }
  | { type: 'glitch'; params: GlitchParams }
  | { type: 'radialBlur'; params: RadialBlurParams }
  | { type: 'chromatic'; params: ChromaticParams }
  | { type: 'pixelate'; params: PixelateParams }
  | { type: 'invert'; params: InvertParams }
  | { type: 'filmGrain'; params: FilmGrainParams }
  | { type: 'vignette'; params: VignetteParams }
  | { type: 'splitScreen'; params: SplitScreenParams }

// ==================== 特效动画（入场/出场）====================

/**
 * 特效过渡类型
 */
export type EffectTransitionType =
  | 'none'          // 无过渡
  | 'fadeIn'        // 淡入
  | 'fadeOut'       // 淡出
  | 'easeIn'        // 缓入
  | 'easeOut'       // 缓出
  | 'easeInOut'     // 缓入缓出
  | 'bounce'        // 弹跳

/**
 * 特效过渡配置
 */
export interface EffectTransition {
  type: EffectTransitionType
  duration: number        // 过渡时长（秒）
}

// ==================== 特效实例定义 ====================

/**
 * 视频特效实例
 * 表示应用到片段上的一个特效
 */
export interface VideoEffect {
  id: string                      // 特效唯一 ID
  type: VideoEffectType           // 特效类型
  name: string                    // 特效显示名称
  
  // 时间范围（相对于片段）
  startTime: number               // 开始时间（秒）
  duration: number                // 持续时间（秒）
  
  // 特效参数（收紧为联合类型，提供更好的类型安全）
  params: Partial<AllEffectParams> & Record<string, unknown>
  
  // 入场/出场动画
  enterTransition?: EffectTransition
  exitTransition?: EffectTransition
  
  // 是否启用
  enabled: boolean
  
  // 渲染顺序（用于多特效叠加）
  order: number
}

// ==================== 特效预设 ====================

/**
 * 特效预设（用于 UI 展示）
 */
export interface VideoEffectPreset {
  type: VideoEffectType
  name: string                    // 显示名称
  icon: string                    // 图标（emoji 或 URL）
  description: string             // 描述
  category: EffectCategory        // 分类
  defaultParams: Partial<AllEffectParams> & Record<string, unknown>
  defaultDuration: number         // 默认时长
}

/**
 * 特效分类
 */
export type EffectCategory =
  | 'basic'         // 基础特效
  | 'distort'       // 扭曲特效
  | 'blur'          // 模糊特效
  | 'color'         // 颜色特效
  | 'retro'         // 复古特效
  | 'creative'      // 创意特效

// ==================== 预设列表 ====================

/**
 * 所有特效的预设配置
 */
export const VIDEO_EFFECT_PRESETS: VideoEffectPreset[] = [
  // 基础特效
  {
    type: 'flash',
    name: '闪白',
    icon: '💥',
    description: '画面瞬间变白，常用于转场或强调',
    category: 'basic',
    defaultParams: { intensity: 0.8, color: '#ffffff' },
    defaultDuration: 0.2
  },
  {
    type: 'shake',
    name: '震动',
    icon: '📳',
    description: '画面抖动效果，营造紧张感',
    category: 'basic',
    defaultParams: { intensity: 0.5, frequency: 30, direction: 'both' },
    defaultDuration: 0.5
  },
  
  // 扭曲特效
  {
    type: 'glitch',
    name: '故障',
    icon: '📺',
    description: 'RGB 分离和扫描线，模拟信号故障',
    category: 'distort',
    defaultParams: { intensity: 0.6, rgbSplit: 0.5, scanlineIntensity: 0.3, blockGlitch: true },
    defaultDuration: 0.3
  },
  {
    type: 'pixelate',
    name: '像素化',
    icon: '🎮',
    description: '马赛克效果，可用于模糊敏感内容',
    category: 'distort',
    defaultParams: { pixelSize: 10 },
    defaultDuration: 1.0
  },
  
  // 模糊特效
  {
    type: 'radialBlur',
    name: '径向模糊',
    icon: '🌀',
    description: '从中心向外发散的动感模糊',
    category: 'blur',
    defaultParams: { intensity: 0.5, centerX: 0.5, centerY: 0.5, samples: 16 },
    defaultDuration: 0.5
  },
  
  // 颜色特效
  {
    type: 'chromatic',
    name: '色差',
    icon: '🌈',
    description: 'RGB 通道分离，营造科幻感',
    category: 'color',
    defaultParams: { intensity: 0.3, angle: 0 },
    defaultDuration: 0.5
  },
  {
    type: 'invert',
    name: '负片',
    icon: '🔄',
    description: '颜色反转，可用于创意效果',
    category: 'color',
    defaultParams: { intensity: 1.0 },
    defaultDuration: 0.5
  },
  
  // 复古特效
  {
    type: 'filmGrain',
    name: '老电影',
    icon: '🎞️',
    description: '复古胶片效果，带噪点和划痕',
    category: 'retro',
    defaultParams: { grainIntensity: 0.3, scratchIntensity: 0.2, flickerIntensity: 0.1, sepiaAmount: 0.5 },
    defaultDuration: 2.0
  },
  {
    type: 'vignette',
    name: '晕影',
    icon: '⭕',
    description: '边缘暗角效果，聚焦画面中心',
    category: 'retro',
    defaultParams: { intensity: 0.5, radius: 0.8, softness: 0.5 },
    defaultDuration: 1.0
  },
  
  // 创意特效
  {
    type: 'splitScreen',
    name: '分屏',
    icon: '🔲',
    description: '画面分割复制，创意效果',
    category: 'creative',
    defaultParams: { splitCount: 2, direction: 'horizontal', gap: 0 },
    defaultDuration: 1.0
  }
]

// ==================== 工具函数 ====================

/**
 * 根据类型获取特效预设
 */
export function getEffectPreset(type: VideoEffectType): VideoEffectPreset | undefined {
  return VIDEO_EFFECT_PRESETS.find(preset => preset.type === type)
}

/**
 * 创建新的特效实例
 */
export function createVideoEffect(
  type: VideoEffectType,
  startTime: number = 0,
  duration?: number
): VideoEffect {
  const preset = getEffectPreset(type)
  if (!preset) {
    throw new Error(`未知的特效类型: ${type}`)
  }
  
  return {
    id: crypto.randomUUID(),
    type,
    name: preset.name,
    startTime,
    duration: duration ?? preset.defaultDuration,
    params: { ...preset.defaultParams },
    enabled: true,
    order: 0
  }
}

/**
 * 计算特效在某个时间点的进度（考虑入场/出场动画）
 * @param effect 特效实例
 * @param timeInClip 片段内的时间
 * @returns 0-1 的进度值，考虑过渡效果
 */
export function getEffectIntensity(effect: VideoEffect, timeInClip: number): number {
  const effectStart = effect.startTime
  const effectEnd = effect.startTime + effect.duration
  
  // 不在特效范围内
  if (timeInClip < effectStart || timeInClip > effectEnd) {
    return 0
  }
  
  let intensity = 1.0
  const timeInEffect = timeInClip - effectStart
  
  // 入场过渡
  if (effect.enterTransition && effect.enterTransition.type !== 'none') {
    const enterDur = effect.enterTransition.duration
    if (timeInEffect < enterDur) {
      const progress = timeInEffect / enterDur
      intensity *= applyEasing(progress, effect.enterTransition.type)
    }
  }
  
  // 出场过渡
  if (effect.exitTransition && effect.exitTransition.type !== 'none') {
    const exitDur = effect.exitTransition.duration
    const timeToEnd = effectEnd - timeInClip
    if (timeToEnd < exitDur) {
      const progress = timeToEnd / exitDur
      intensity *= applyEasing(progress, effect.exitTransition.type)
    }
  }
  
  return intensity
}

/**
 * 应用缓动函数
 */
function applyEasing(t: number, type: EffectTransitionType): number {
  switch (type) {
    case 'fadeIn':
    case 'fadeOut':
      return t
    case 'easeIn':
      return t * t
    case 'easeOut':
      return 1 - (1 - t) * (1 - t)
    case 'easeInOut':
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
    case 'bounce':
      const n1 = 7.5625
      const d1 = 2.75
      if (t < 1 / d1) {
        return n1 * t * t
      } else if (t < 2 / d1) {
        return n1 * (t -= 1.5 / d1) * t + 0.75
      } else if (t < 2.5 / d1) {
        return n1 * (t -= 2.25 / d1) * t + 0.9375
      } else {
        return n1 * (t -= 2.625 / d1) * t + 0.984375
      }
    default:
      return t
  }
}
