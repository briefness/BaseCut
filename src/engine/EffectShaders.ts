/**
 * 特效着色器集合
 * 
 * 所有特效通过 WebGL 着色器实现 GPU 加速渲染
 * 每个着色器接收以下 uniform：
 * - u_texture: 输入纹理
 * - u_time: 当前时间（用于动画）
 * - u_resolution: 画布分辨率
 * - u_intensity: 特效强度 (0-1)
 * - 各特效特定参数
 */

import type { VideoEffectType } from '@/types/effects'

// ==================== 通用顶点着色器 ====================

/**
 * 通用特效顶点着色器
 * 大多数特效使用此顶点着色器
 */
export const EFFECT_VERTEX_SHADER = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;
  
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
  }
`

/**
 * 震动特效顶点着色器
 * 通过顶点偏移实现画面抖动
 */
export const SHAKE_VERTEX_SHADER = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;
  
  uniform float u_time;
  uniform float u_intensity;
  uniform float u_frequency;
  uniform int u_direction; // 0: horizontal, 1: vertical, 2: both
  
  // 伪随机函数
  float random(float seed) {
    return fract(sin(seed * 12.9898) * 43758.5453);
  }
  
  void main() {
    vec2 offset = vec2(0.0);
    float shake = u_intensity * 0.05; // 最大偏移 5%
    
    // 基于时间和频率生成震动
    float t = u_time * u_frequency;
    float rx = random(floor(t)) * 2.0 - 1.0;
    float ry = random(floor(t) + 0.5) * 2.0 - 1.0;
    
    if (u_direction == 0 || u_direction == 2) {
      offset.x = rx * shake;
    }
    if (u_direction == 1 || u_direction == 2) {
      offset.y = ry * shake;
    }
    
    gl_Position = vec4(a_position + offset, 0.0, 1.0);
    v_texCoord = a_texCoord;
  }
`

// ==================== 片段着色器 ====================

/**
 * 闪白特效
 * 将画面与指定颜色混合
 * 
 * [修复] 透明区域直接输出，确保黑边区域不受影响
 */
export const FLASH_FRAGMENT_SHADER = `
  precision mediump float;
  
  varying vec2 v_texCoord;
  uniform sampler2D u_texture;
  uniform float u_intensity;
  uniform vec3 u_color;
  
  void main() {
    vec4 texColor = texture2D(u_texture, v_texCoord);
    
    // [关键] 透明区域直接输出，不混合闪白颜色
    if (texColor.a < 0.001) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
      return;
    }
    
    vec3 flashColor = u_color;
    
    // 线性混合（仅影响不透明区域）
    vec3 result = mix(texColor.rgb, flashColor, u_intensity);
    
    gl_FragColor = vec4(result, texColor.a);
  }
`

/**
 * 震动特效片段着色器
 * 配合震动顶点着色器使用，这里只做直通
 */
export const SHAKE_FRAGMENT_SHADER = `
  precision mediump float;
  
  varying vec2 v_texCoord;
  uniform sampler2D u_texture;
  
  void main() {
    gl_FragColor = texture2D(u_texture, v_texCoord);
  }
`

/**
 * 故障特效 (Glitch)
 * RGB 分离 + 扫描线 + 块状故障
 */
export const GLITCH_FRAGMENT_SHADER = `
  precision mediump float;
  
  varying vec2 v_texCoord;
  uniform sampler2D u_texture;
  uniform float u_time;
  uniform float u_intensity;
  uniform float u_rgbSplit;
  uniform float u_scanlineIntensity;
  uniform bool u_blockGlitch;
  uniform vec2 u_resolution;
  
  // 伪随机函数
  float random(vec2 co) {
    return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
  }
  
  // 噪声函数
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = random(i);
    float b = random(i + vec2(1.0, 0.0));
    float c = random(i + vec2(0.0, 1.0));
    float d = random(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }
  
  void main() {
    vec2 uv = v_texCoord;
    float time = u_time * 10.0;
    
    // 块状故障偏移
    float blockOffset = 0.0;
    if (u_blockGlitch) {
      float blockY = floor(uv.y * 20.0);
      float blockNoise = step(0.9 - u_intensity * 0.3, random(vec2(blockY, floor(time))));
      blockOffset = blockNoise * (random(vec2(blockY, floor(time) + 0.5)) * 2.0 - 1.0) * 0.1 * u_intensity;
    }
    
    // RGB 分离
    float splitAmount = u_rgbSplit * 0.02 * u_intensity;
    float r = texture2D(u_texture, vec2(uv.x + splitAmount + blockOffset, uv.y)).r;
    float g = texture2D(u_texture, vec2(uv.x + blockOffset, uv.y)).g;
    float b = texture2D(u_texture, vec2(uv.x - splitAmount + blockOffset, uv.y)).b;
    
    vec3 color = vec3(r, g, b);
    float alpha = texture2D(u_texture, uv).a; // 获取原始 Alpha
    
    // 扫描线 (应用 Alpha 遮罩)
    float scanline = sin(uv.y * u_resolution.y * 2.0) * 0.5 + 0.5;
    color -= scanline * u_scanlineIntensity * 0.1 * u_intensity * alpha;
    
    // 随机噪点 (应用 Alpha 遮罩)
    float grainNoise = random(uv + fract(time)) * 0.1 * u_intensity;
    color += (grainNoise - 0.05 * u_intensity) * alpha;
    
    // [修复] 强制应用 Alpha 遮罩，防止偏移采样导致内容溢出到透明区域
    color *= alpha;

    gl_FragColor = vec4(color, alpha);
  }
`

/**
 * 径向模糊特效
 * 从中心点向外发散的动感模糊
 */
export const RADIAL_BLUR_FRAGMENT_SHADER = `
  precision mediump float;
  
  varying vec2 v_texCoord;
  uniform sampler2D u_texture;
  uniform float u_intensity;
  uniform vec2 u_center;
  uniform int u_samples;
  
  void main() {
    vec2 uv = v_texCoord;
    vec2 direction = uv - u_center;
    float dist = length(direction);
    
    vec4 color = vec4(0.0);
    float totalWeight = 0.0;
    
    // 多重采样实现模糊
    for (int i = 0; i < 32; i++) {
      if (i >= u_samples) break;
      
      float t = float(i) / float(u_samples - 1);
      float weight = 1.0 - t; // 中心权重大，边缘权重小
      
      vec2 sampleUV = uv - direction * t * u_intensity * 0.1;
      color += texture2D(u_texture, sampleUV) * weight;
      totalWeight += weight;
    }
    
    gl_FragColor = color / totalWeight;
  }
`

/**
 * 色差特效 (Chromatic Aberration)
 * RGB 通道分离偏移
 */
export const CHROMATIC_FRAGMENT_SHADER = `
  precision mediump float;
  
  varying vec2 v_texCoord;
  uniform sampler2D u_texture;
  uniform float u_intensity;
  uniform float u_angle;
  
  void main() {
    vec2 uv = v_texCoord;
    
    // 计算偏移方向
    float angleRad = u_angle * 3.14159 / 180.0;
    vec2 direction = vec2(cos(angleRad), sin(angleRad));
    
    // 偏移量基于到中心的距离
    vec2 center = vec2(0.5);
    float dist = length(uv - center);
    float offset = u_intensity * 0.02 * dist;
    
    // 分离采样
    float r = texture2D(u_texture, uv + direction * offset).r;
    float g = texture2D(u_texture, uv).g;
    float b = texture2D(u_texture, uv - direction * offset).b;
    
    gl_FragColor = vec4(r, g, b, 1.0);
  }
`

/**
 * 像素化特效
 * 马赛克效果
 */
export const PIXELATE_FRAGMENT_SHADER = `
  precision mediump float;
  
  varying vec2 v_texCoord;
  uniform sampler2D u_texture;
  uniform float u_pixelSize;
  uniform vec2 u_resolution;
  
  void main() {
    vec2 uv = v_texCoord;
    
    // 计算像素块
    vec2 pixelCount = u_resolution / u_pixelSize;
    vec2 pixelUV = floor(uv * pixelCount) / pixelCount;
    
    // 偏移到像素块中心
    pixelUV += 0.5 / pixelCount;
    
    gl_FragColor = texture2D(u_texture, pixelUV);
  }
`

/**
 * 负片特效
 * 颜色反转
 * 
 * [修复] 透明区域直接输出，不应用任何效果
 */
export const INVERT_FRAGMENT_SHADER = `
  precision mediump float;
  
  varying vec2 v_texCoord;
  uniform sampler2D u_texture;
  uniform float u_intensity;
  
  void main() {
    vec4 color = texture2D(u_texture, v_texCoord);
    
    // [关键] 透明区域直接输出
    if (color.a < 0.001) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
      return;
    }
    
    // 反转并混合
    vec3 inverted = 1.0 - color.rgb;
    vec3 result = mix(color.rgb, inverted, u_intensity);
    
    gl_FragColor = vec4(result, color.a);
  }
`

/**
 * 老电影特效
 * 噪点 + 划痕 + 闪烁 + 复古色调
 * 
 * [修复] 所有效果都应用 Alpha 遮罩，确保透明区域不受影响
 */
export const FILM_GRAIN_FRAGMENT_SHADER = `
  precision mediump float;
  
  varying vec2 v_texCoord;
  uniform sampler2D u_texture;
  uniform float u_time;
  uniform float u_grainIntensity;
  uniform float u_scratchIntensity;
  uniform float u_flickerIntensity;
  uniform float u_sepiaAmount;
  uniform vec2 u_resolution;
  
  // 伪随机
  float random(vec2 co) {
    return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
  }
  
  void main() {
    vec2 uv = v_texCoord;
    vec4 color = texture2D(u_texture, uv);
    
    // [关键] 透明区域直接输出，不应用任何效果
    if (color.a < 0.001) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
      return;
    }
    
    vec3 rgb = color.rgb;
    
    // 噪点 (应用 Alpha 遮罩)
    float grain = random(uv + fract(u_time * 100.0)) * 2.0 - 1.0;
    rgb += grain * u_grainIntensity * 0.2;
    
    // 划痕（垂直随机线条）
    float scratchX = random(vec2(floor(u_time * 5.0), 0.0));
    float scratch = step(0.99 - u_scratchIntensity * 0.02, abs(uv.x - scratchX));
    scratch *= random(vec2(uv.y, u_time)) * 0.3;
    rgb += scratch;
    
    // 闪烁
    float flicker = 1.0 - u_flickerIntensity * 0.1 * random(vec2(floor(u_time * 24.0), 0.0));
    rgb *= flicker;
    
    // 复古色调 (Sepia)
    vec3 sepia;
    sepia.r = dot(rgb, vec3(0.393, 0.769, 0.189));
    sepia.g = dot(rgb, vec3(0.349, 0.686, 0.168));
    sepia.b = dot(rgb, vec3(0.272, 0.534, 0.131));
    rgb = mix(rgb, sepia, u_sepiaAmount);
    
    gl_FragColor = vec4(rgb, color.a);
  }
`

/**
 * 晕影特效
 * 边缘暗角
 */
export const VIGNETTE_FRAGMENT_SHADER = `
  precision mediump float;
  
  varying vec2 v_texCoord;
  uniform sampler2D u_texture;
  uniform float u_intensity;
  uniform float u_radius;
  uniform float u_softness;
  
  void main() {
    vec4 color = texture2D(u_texture, v_texCoord);
    
    // 计算到中心的距离
    vec2 center = vec2(0.5);
    float dist = length(v_texCoord - center);
    
    // 晕影渐变
    float vignette = smoothstep(u_radius, u_radius - u_softness, dist);
    vignette = mix(1.0, vignette, u_intensity);
    
    gl_FragColor = vec4(color.rgb * vignette, color.a);
  }
`

/**
 * 分屏特效
 * 画面复制分割
 */
export const SPLIT_SCREEN_FRAGMENT_SHADER = `
  precision mediump float;
  
  varying vec2 v_texCoord;
  uniform sampler2D u_texture;
  uniform int u_splitCount;   // 2, 3, 4
  uniform int u_direction;    // 0: horizontal, 1: vertical, 2: grid
  uniform float u_gap;
  uniform vec2 u_resolution;
  
  void main() {
    vec2 uv = v_texCoord;
    float gapNorm = u_gap / u_resolution.x;
    
    vec2 newUV = uv;
    
    if (u_direction == 0) {
      // 水平分屏
      float segment = 1.0 / float(u_splitCount);
      float idx = floor(uv.x / segment);
      newUV.x = fract(uv.x / segment);
      
      // 间隙检测
      float edge = fract(uv.x / segment) * segment;
      if (edge < gapNorm * 0.5 || edge > segment - gapNorm * 0.5) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0); // 透明间隙以支持遮罩
        return;
      }
    } else if (u_direction == 1) {
      // 垂直分屏
      float segment = 1.0 / float(u_splitCount);
      float idx = floor(uv.y / segment);
      newUV.y = fract(uv.y / segment);
      
      float edge = fract(uv.y / segment) * segment;
      if (edge < gapNorm * 0.5 || edge > segment - gapNorm * 0.5) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0); // 透明间隙以支持遮罩
        return;
      }
    } else {
      // 网格分屏 (2x2)
      newUV = fract(uv * 2.0);
    }
    
    gl_FragColor = texture2D(u_texture, newUV);
  }
`

// ==================== 着色器映射表 ====================

/**
 * 特效类型到着色器的映射
 */
export interface EffectShaderSet {
  vertexShader: string
  fragmentShader: string
}

/**
 * 获取特效的着色器集合
 */
export function getEffectShaders(type: VideoEffectType): EffectShaderSet {
  switch (type) {
    case 'flash':
      return { vertexShader: EFFECT_VERTEX_SHADER, fragmentShader: FLASH_FRAGMENT_SHADER }
    case 'shake':
      return { vertexShader: SHAKE_VERTEX_SHADER, fragmentShader: SHAKE_FRAGMENT_SHADER }
    case 'glitch':
      return { vertexShader: EFFECT_VERTEX_SHADER, fragmentShader: GLITCH_FRAGMENT_SHADER }
    case 'radialBlur':
      return { vertexShader: EFFECT_VERTEX_SHADER, fragmentShader: RADIAL_BLUR_FRAGMENT_SHADER }
    case 'chromatic':
      return { vertexShader: EFFECT_VERTEX_SHADER, fragmentShader: CHROMATIC_FRAGMENT_SHADER }
    case 'pixelate':
      return { vertexShader: EFFECT_VERTEX_SHADER, fragmentShader: PIXELATE_FRAGMENT_SHADER }
    case 'invert':
      return { vertexShader: EFFECT_VERTEX_SHADER, fragmentShader: INVERT_FRAGMENT_SHADER }
    case 'filmGrain':
      return { vertexShader: EFFECT_VERTEX_SHADER, fragmentShader: FILM_GRAIN_FRAGMENT_SHADER }
    case 'vignette':
      return { vertexShader: EFFECT_VERTEX_SHADER, fragmentShader: VIGNETTE_FRAGMENT_SHADER }
    case 'splitScreen':
      return { vertexShader: EFFECT_VERTEX_SHADER, fragmentShader: SPLIT_SCREEN_FRAGMENT_SHADER }
    default:
      throw new Error(`未知的特效类型: ${type}`)
  }
}
