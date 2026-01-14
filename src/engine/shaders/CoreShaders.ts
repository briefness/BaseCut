/**
 * 着色器源代码集合
 * 从 WebGLRenderer.ts 提取，便于维护和复用
 * 
 * @module engine/shaders
 */

// ==================== 公共着色器函数 ====================

/**
 * GLSL 公共函数：RGB 与 HSL 互转
 * 被多个着色器复用，避免代码重复
 */
export const GLSL_COLOR_FUNCTIONS = `
  // RGB 转 HSL
  vec3 rgb2hsl(vec3 c) {
    float maxC = max(max(c.r, c.g), c.b);
    float minC = min(min(c.r, c.g), c.b);
    float l = (maxC + minC) / 2.0;
    
    if (maxC == minC) {
      return vec3(0.0, 0.0, l);
    }
    
    float d = maxC - minC;
    float s = l > 0.5 ? d / (2.0 - maxC - minC) : d / (maxC + minC);
    float h;
    
    if (maxC == c.r) {
      h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
    } else if (maxC == c.g) {
      h = (c.b - c.r) / d + 2.0;
    } else {
      h = (c.r - c.g) / d + 4.0;
    }
    h /= 6.0;
    
    return vec3(h, s, l);
  }
  
  // HSL 转 RGB 辅助函数
  float hue2rgb(float p, float q, float t) {
    if (t < 0.0) t += 1.0;
    if (t > 1.0) t -= 1.0;
    if (t < 1.0/6.0) return p + (q - p) * 6.0 * t;
    if (t < 1.0/2.0) return q;
    if (t < 2.0/3.0) return p + (q - p) * (2.0/3.0 - t) * 6.0;
    return p;
  }
  
  vec3 hsl2rgb(vec3 c) {
    if (c.y == 0.0) {
      return vec3(c.z);
    }
    
    float q = c.z < 0.5 ? c.z * (1.0 + c.y) : c.z + c.y - c.z * c.y;
    float p = 2.0 * c.z - q;
    
    return vec3(
      hue2rgb(p, q, c.x + 1.0/3.0),
      hue2rgb(p, q, c.x),
      hue2rgb(p, q, c.x - 1.0/3.0)
    );
  }
`

// ==================== 基础渲染着色器 ====================

/**
 * 基础顶点着色器
 * 简单的坐标传递和纹理坐标插值
 */
export const BASIC_VERTEX_SHADER = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;
  
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
  }
`

/**
 * 基础片段着色器
 * 支持亮度、对比度、饱和度、色相滤镜
 */
export const BASIC_FRAGMENT_SHADER = `
  precision mediump float;
  
  varying vec2 v_texCoord;
  uniform sampler2D u_texture;
  
  // 滤镜参数
  uniform float u_brightness;
  uniform float u_contrast;
  uniform float u_saturation;
  uniform float u_hue;
  uniform float u_blur;
  
  ${GLSL_COLOR_FUNCTIONS}
  
  void main() {
    vec4 color = texture2D(u_texture, v_texCoord);
    vec3 rgb = color.rgb;
    
    // 应用亮度 (-1 ~ 1)
    rgb += u_brightness;
    
    // 应用对比度 (0 ~ 2, 1 为中性)
    rgb = (rgb - 0.5) * u_contrast + 0.5;
    
    // 应用饱和度和色相
    vec3 hsl = rgb2hsl(rgb);
    hsl.x = mod(hsl.x + u_hue, 1.0);  // 色相偏移
    hsl.y *= u_saturation;             // 饱和度
    rgb = hsl2rgb(hsl);
    
    // Clamp 到有效范围
    rgb = clamp(rgb, 0.0, 1.0);
    
    gl_FragColor = vec4(rgb, color.a);
  }
`

// ==================== 转场着色器 ====================

/**
 * 转场片段着色器
 * 支持多种 GPU 加速转场效果：fade, dissolve, slide, wipe, zoom 等
 */
export const TRANSITION_FRAGMENT_SHADER = `
  precision mediump float;
  
  varying vec2 v_texCoord;
  uniform sampler2D u_textureA;  // 第一个视频帧
  uniform sampler2D u_textureB;  // 第二个视频帧
  uniform float u_progress;       // 转场进度 0-1
  uniform int u_transitionType;   // 转场类型
  
  // 缓动函数 - 使转场更丝滑
  float easeInOutCubic(float t) {
    return t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0;
  }
  
  float easeOutQuad(float t) {
    return 1.0 - (1.0 - t) * (1.0 - t);
  }
  
  void main() {
    vec4 colorA = texture2D(u_textureA, v_texCoord);
    vec4 colorB = texture2D(u_textureB, v_texCoord);
    float p = easeInOutCubic(u_progress);
    
    vec4 result;
    
    // 0: fade 淡入淡出
    if (u_transitionType == 0) {
      result = mix(colorA, colorB, p);
    }
    // 1: dissolve 溶解（带噪点）
    else if (u_transitionType == 1) {
      float noise = fract(sin(dot(v_texCoord, vec2(12.9898, 78.233))) * 43758.5453);
      float threshold = p * 1.2 - 0.1;
      float blend = smoothstep(threshold - 0.1, threshold + 0.1, noise);
      result = mix(colorA, colorB, blend);
    }
    // 2: slideLeft 向左滑动
    else if (u_transitionType == 2) {
      float offset = p;
      vec2 coordA = v_texCoord + vec2(offset, 0.0);
      vec2 coordB = v_texCoord + vec2(offset - 1.0, 0.0);
      if (v_texCoord.x < 1.0 - offset) {
        result = texture2D(u_textureA, coordA);
      } else {
        result = texture2D(u_textureB, coordB);
      }
    }
    // 3: slideRight 向右滑动
    else if (u_transitionType == 3) {
      float offset = p;
      vec2 coordA = v_texCoord - vec2(offset, 0.0);
      vec2 coordB = v_texCoord + vec2(1.0 - offset, 0.0);
      if (v_texCoord.x > offset) {
        result = texture2D(u_textureA, coordA);
      } else {
        result = texture2D(u_textureB, coordB);
      }
    }
    // 4: wipe 擦除
    else if (u_transitionType == 4) {
      float edge = p;
      float softness = 0.05;
      float blend = smoothstep(edge - softness, edge + softness, v_texCoord.x);
      result = mix(colorA, colorB, blend);
    }
    // 5: zoom 缩放
    else if (u_transitionType == 5) {
      float scale = 1.0 + p * 0.5;
      vec2 center = vec2(0.5, 0.5);
      vec2 scaledCoord = (v_texCoord - center) / scale + center;
      vec4 scaledA = texture2D(u_textureA, clamp(scaledCoord, 0.0, 1.0));
      result = mix(scaledA, colorB, p);
    }
    // 6: blur 模糊过渡
    else if (u_transitionType == 6) {
      result = mix(colorA, colorB, p);
    }
    // 7: slideUp 向上滑动
    else if (u_transitionType == 7) {
      float offset = p;
      if (v_texCoord.y < 1.0 - offset) {
        result = texture2D(u_textureA, v_texCoord + vec2(0.0, offset));
      } else {
        result = texture2D(u_textureB, v_texCoord + vec2(0.0, offset - 1.0));
      }
    }
    // 8: slideDown 向下滑动
    else if (u_transitionType == 8) {
      float offset = p;
      if (v_texCoord.y > offset) {
        result = texture2D(u_textureA, v_texCoord - vec2(0.0, offset));
      } else {
        result = texture2D(u_textureB, v_texCoord + vec2(0.0, 1.0 - offset));
      }
    }
    else {
      result = mix(colorA, colorB, p);
    }
    
    gl_FragColor = result;
  }
`

// ==================== 叠加层着色器 ====================

/**
 * 叠加层顶点着色器
 * 支持位置、缩放、旋转变换（用于贴纸、画中画）
 */
export const OVERLAY_VERTEX_SHADER = `
  attribute vec2 a_position; // 标准 Quad (-1 到 1)
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;

  uniform vec2 u_resolution; // 画布分辨率 (px)
  uniform vec2 u_imgSize;    // 图片分辨率 (px)
  uniform vec2 u_translation;// 位置 (0.0 - 1.0)
  uniform vec2 u_scale;      // 缩放 (x, y) - 支持非等比缩放
  uniform float u_rotation;  // 旋转 (弧度)

  void main() {
    // 1. 转换到像素空间 (Pixel Space)
    // 基础尺寸：图片的原始像素大小 * 缩放倍率
    // a_position 是 2x2 的正方形 (-1~1)，所以乘以 0.5 得到 (-0.5~0.5) 作为单位基准
    vec2 pixelSize = u_imgSize * u_scale;
    vec2 pixelPos = a_position * 0.5 * pixelSize;

    // 2. 旋转 (在像素空间进行，保证各向同性，不会变形)
    float c = cos(u_rotation);
    float s = sin(u_rotation);
    mat2 rotMat = mat2(c, -s, s, c);
    pixelPos = rotMat * pixelPos;

    // 3. 位移 (在像素空间计算)
    // u_translation 是 0~1 的比例坐标，(0,0) 为左上角
    // 转换到 WebGL 坐标系 (中心为 0,0，Y轴向上)
    // X: (0~1) -> (-0.5W ~ 0.5W)
    // Y: (0~1) -> (0.5H ~ -0.5H) (因为屏幕坐标 Y 向下，WebGL Y 向上，需要翻转)
    float offsetX = (u_translation.x - 0.5) * u_resolution.x;
    float offsetY = (0.5 - u_translation.y) * u_resolution.y;
    
    pixelPos += vec2(offsetX, offsetY);

    // 4. 投影到裁剪空间 (Clip Space)
    // 像素坐标 / (分辨率/2) = Clip 坐标 (-1 ~ 1)
    gl_Position = vec4(pixelPos / (u_resolution * 0.5), 0.0, 1.0);
    
    v_texCoord = a_texCoord;
  }
`

/**
 * 叠加层片段着色器
 * 支持透明度控制
 */
export const OVERLAY_FRAGMENT_SHADER = `
  precision mediump float;
  varying vec2 v_texCoord;
  uniform sampler2D u_texture;
  uniform float u_opacity;

  void main() {
    vec4 color = texture2D(u_texture, v_texCoord);
    gl_FragColor = color * u_opacity;
  }
`

// ==================== 动画着色器 ====================

/**
 * 动画顶点着色器
 * 支持 4x4 变换矩阵，实现位置、缩放、旋转动画
 */
export const ANIMATED_VERTEX_SHADER = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;
  
  uniform mat4 u_transform;    // 变换矩阵（列主序）
  uniform vec2 u_resolution;   // 画布尺寸
  
  void main() {
    // 将 NDC 坐标（-1~1）转换为像素坐标
    vec2 pixelPos = a_position * u_resolution * 0.5;
    
    // 应用变换矩阵
    vec4 transformed = u_transform * vec4(pixelPos, 0.0, 1.0);
    
    // 转回 NDC 坐标
    gl_Position = vec4(transformed.xy / (u_resolution * 0.5), 0.0, 1.0);
    
    v_texCoord = a_texCoord;
  }
`

/**
 * 动画片段着色器
 * 支持透明度动画和滤镜参数
 */
export const ANIMATED_FRAGMENT_SHADER = `
  precision mediump float;
  
  varying vec2 v_texCoord;
  uniform sampler2D u_texture;
  uniform float u_opacity;      // 透明度 (0~1)
  
  // 滤镜参数
  uniform float u_brightness;
  uniform float u_contrast;
  uniform float u_saturation;
  uniform float u_hue;
  
  ${GLSL_COLOR_FUNCTIONS}
  
  void main() {
    vec4 color = texture2D(u_texture, v_texCoord);
    vec3 rgb = color.rgb;
    
    // 应用亮度
    rgb += u_brightness;
    
    // 应用对比度
    rgb = (rgb - 0.5) * u_contrast + 0.5;
    
    // 应用饱和度和色相
    vec3 hsl = rgb2hsl(rgb);
    hsl.x = mod(hsl.x + u_hue, 1.0);
    hsl.y *= u_saturation;
    rgb = hsl2rgb(hsl);
    
    // Clamp 到有效范围
    rgb = clamp(rgb, 0.0, 1.0);
    
    // 应用透明度
    gl_FragColor = vec4(rgb, color.a) * u_opacity;
  }
`

// ==================== 导出所有着色器 ====================

/**
 * 着色器程序标识符
 * 用于程序缓存的 key
 */
export const SHADER_PROGRAM_IDS = {
  BASIC: 'basic',
  TRANSITION: 'transition',
  OVERLAY: 'overlay',
  ANIMATED: 'animated',
} as const

/**
 * 转场类型映射（类型名 -> 数字 ID）
 */
export const TRANSITION_TYPE_MAP: Record<string, number> = {
  fade: 0,
  dissolve: 1,
  slideLeft: 2,
  slideRight: 3,
  wipe: 4,
  zoom: 5,
  blur: 6,
  slideUp: 7,
  slideDown: 8,
}

/**
 * 别名导出（兼容旧代码引用）
 */
export const VERTEX_SHADER = BASIC_VERTEX_SHADER
export const FRAGMENT_SHADER = BASIC_FRAGMENT_SHADER

/**
 * 核心着色器集合
 * 便于一次性导入
 */
export const CoreShaders = {
  // 基础
  BASIC_VERTEX: BASIC_VERTEX_SHADER,
  BASIC_FRAGMENT: BASIC_FRAGMENT_SHADER,
  
  // 转场
  TRANSITION_FRAGMENT: TRANSITION_FRAGMENT_SHADER,
  
  // 叠加层
  OVERLAY_VERTEX: OVERLAY_VERTEX_SHADER,
  OVERLAY_FRAGMENT: OVERLAY_FRAGMENT_SHADER,
  
  // 动画
  ANIMATED_VERTEX: ANIMATED_VERTEX_SHADER,
  ANIMATED_FRAGMENT: ANIMATED_FRAGMENT_SHADER,
  
  // 公共函数
  COLOR_FUNCTIONS: GLSL_COLOR_FUNCTIONS,
} as const

