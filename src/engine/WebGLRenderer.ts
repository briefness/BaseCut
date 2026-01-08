/**
 * WebGL 渲染器
 * 使用 WebGL 实现 GPU 加速的视频帧渲染和滤镜特效
 */
import type { FilterParams, Transform } from '@/types'
import type { VideoEffect } from '@/types/effects'
import { effectManager as defaultEffectManager, type EffectRenderContext, type EffectManager } from './EffectManager'


// 顶点着色器
const VERTEX_SHADER = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;
  
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
  }
`

// 片段着色器 - 支持滤镜效果
const FRAGMENT_SHADER = `
  precision mediump float;
  
  varying vec2 v_texCoord;
  uniform sampler2D u_texture;
  
  // 滤镜参数
  uniform float u_brightness;
  uniform float u_contrast;
  uniform float u_saturation;
  uniform float u_hue;
  uniform float u_blur;
  
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
  
  // HSL 转 RGB
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

// 转场片段着色器 - GPU 加速转场效果
const TRANSITION_FRAGMENT_SHADER = `
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

// 叠加层顶点着色器
const OVERLAY_VERTEX_SHADER = `
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

// 叠加层片段着色器
const OVERLAY_FRAGMENT_SHADER = `
  precision mediump float;
  varying vec2 v_texCoord;
  uniform sampler2D u_texture;
  uniform float u_opacity;

  void main() {
    vec4 color = texture2D(u_texture, v_texCoord);
    gl_FragColor = color * u_opacity;
  }
`

export class WebGLRenderer {
  private canvas: HTMLCanvasElement | OffscreenCanvas
  private gl: WebGLRenderingContext | null = null
  private program: WebGLProgram | null = null
  private texture: WebGLTexture | null = null
  private positionBuffer: WebGLBuffer | null = null
  private texCoordBuffer: WebGLBuffer | null = null
  
  // 转场相关
  private transitionProgram: WebGLProgram | null = null
  private textureB: WebGLTexture | null = null  // 第二个视频帧纹理
  private transitionUniforms: Record<string, WebGLUniformLocation | null> = {}
  
  // 叠加层 (Sticker/PIP)
  private overlayProgram: WebGLProgram | null = null
  private overlayBuffer: WebGLBuffer | null = null    // 独立顶点缓冲区，避免被主流程污染
  private overlayTexBuffer: WebGLBuffer | null = null // 独立UV缓冲区
  
  // Uniform 位置
  private uniforms: Record<string, WebGLUniformLocation | null> = {}
  
  // 当前滤镜参数
  private filterParams: FilterParams = {
    brightness: 0,
    contrast: 0,
    saturation: 0,
    hue: 0,
    blur: 0
  }

  // [新增] 构造选项
  private options: { 
    skipEffectManagerInit?: boolean, 
    effectManager?: EffectManager,
    preserveDrawingBuffer?: boolean // 是否保留绘图缓冲区 (导出时必需)
  } = {}
  
  // 实例绑定的 EffectManager
  private effectManager: EffectManager

  constructor(canvas: HTMLCanvasElement | OffscreenCanvas, options?: { 
    skipEffectManagerInit?: boolean, 
    effectManager?: EffectManager,
    preserveDrawingBuffer?: boolean
  }) {
    this.canvas = canvas
    this.options = options || {}
    // 使用传入的实例或默认单例
    this.effectManager = this.options.effectManager || defaultEffectManager
    this.init()
  }

  private init(): void {
    // 获取 WebGL 上下文
    this.gl = this.canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: this.options.preserveDrawingBuffer || false
    })
    
    if (!this.gl) {
      console.error('WebGL 不可用')
      return
    }

    // 创建着色器程序
    this.program = this.createProgram(VERTEX_SHADER, FRAGMENT_SHADER)
    if (!this.program) return

    this.gl.useProgram(this.program)

    // 设置顶点缓冲
    this.setupBuffers()
    
    // 创建纹理
    this.texture = this.gl.createTexture()
    
    // 获取 uniform 位置
    this.uniforms = {
      texture: this.gl.getUniformLocation(this.program, 'u_texture'),
      brightness: this.gl.getUniformLocation(this.program, 'u_brightness'),
      contrast: this.gl.getUniformLocation(this.program, 'u_contrast'),
      saturation: this.gl.getUniformLocation(this.program, 'u_saturation'),
      hue: this.gl.getUniformLocation(this.program, 'u_hue'),
      blur: this.gl.getUniformLocation(this.program, 'u_blur')
    }

    // 设置默认滤镜值
    this.updateFilterUniforms()
    
    // 初始化转场程序
    this.initTransitionProgram()
    
    // [修复] 条件性初始化特效管理器
    // 导出时使用独立的 EffectManager，避免破坏播放器的全局状态
    if (!this.options.skipEffectManagerInit) {
      this.initEffectManager()
    }
  }
  
  /**
   * 初始化特效管理器
   * 传递 WebGL 上下文和必要的资源给 EffectManager
   */
  private initEffectManager(): void {
    if (!this.gl) return
    
    const context: EffectRenderContext = {
      gl: this.gl,
      canvas: this.canvas,
      createProgram: this.createProgram.bind(this),
      positionBuffer: this.positionBuffer,
      texCoordBuffer: this.texCoordBuffer
    }
    
    this.effectManager.init(context)
  }
  
  /**
   * 渲染带特效的视频帧
   * @param source 视频源
   * @param effects 要应用的特效列表
   * @param timeInClip 片段内时间（秒）
   * @param globalTime 全局时间（秒）
   * @param cropMode 裁剪模式
   */
  renderFrameWithEffects(
    source: TexImageSource,
    effects: VideoEffect[],
    timeInClip: number,
    globalTime: number,
    cropMode: 'cover' | 'contain' | 'fill' = 'contain'
  ): void {
    if (!this.gl || !this.texture || !this.program) return
    
    // 如果没有特效，直接渲染到屏幕
    if (!effects || effects.length === 0) {
      // [关键] 确保渲染到默认帧缓冲（屏幕）
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null)
      this.renderFrame(source, cropMode)
      return
    }

    // 1. 确保 EffectManager 尺寸与画布一致 (防止视口不匹配导致的缩小/畸变)
    this.effectManager.updateSize(this.canvas.width, this.canvas.height)

    // 2. 预渲染流程：先把源画面渲染到 EffectManager 的 FBO 中
    // 这样做的好处是 renderFrame 的裁剪/黑边逻辑会固化在纹理中，
    // 后续特效处理（如 Glitch）基于这个"已合成"的画面，不会破坏纵横比。
    const fbo = this.effectManager.getFramebuffer(0)
    const fboTexture = this.effectManager.getTexture(0)

    if (fbo && fboTexture) {
      // 绑定 FBO
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, fbo)
      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height)
      
      // 清空 FBO
      this.gl.clearColor(0, 0, 0, 0)
      this.gl.clear(this.gl.COLOR_BUFFER_BIT)

      // 渲染源画面 (此时会绘制到 FBO 0)
      this.renderFrame(source, cropMode)

      // 解绑 FBO，恢复到屏幕
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null)
      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height)

      // 3. 应用特效 (输入为 FBO 0 的纹理)
      const effectsApplied = this.effectManager.applyEffects(
        fboTexture,
        effects,
        timeInClip,
        globalTime
      )
      
      // [关键修复] 如果没有激活的特效，需要手动将 FBO 内容绘制到屏幕
      // 这种情况发生在：片段附加了特效，但当前时间点不在特效的激活时间范围内
      if (!effectsApplied) {
        this.renderTextureToScreen(fboTexture)
      }
    } else {
      // 降级处理：如果没有 FBO，必须先渲染到屏幕，再抓取屏幕内容，再应用特效
      this.renderFrame(source, cropMode)
      
      // 抓取当前屏幕内容回纹理
      this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture)
      this.gl.copyTexImage2D(
        this.gl.TEXTURE_2D, 0, this.gl.RGBA,
        0, 0, this.canvas.width, this.canvas.height,
        0
      )
      
      const effectsApplied = this.effectManager.applyEffects(
        this.texture,
        effects,
        timeInClip,
        globalTime
      )
      
      // 如果没有激活的特效，画面已经在屏幕上了（从 renderFrame），无需额外处理
      // 但需要确保状态干净
      if (!effectsApplied) {
        // 画面已经正确渲染到屏幕，无需额外操作
      }
    }
  }
  
  /**
   * 将纹理直接渲染到屏幕
   * 用于处理"片段有特效但当前帧无激活特效"的情况
   * @param texture 要渲染的纹理
   */
  private renderTextureToScreen(texture: WebGLTexture): void {
    if (!this.gl || !this.program) return
    
    const gl = this.gl
    
    // 确保渲染到屏幕
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    
    // 使用基础着色器程序
    gl.useProgram(this.program)
    
    // 设置状态
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.disable(gl.BLEND)
    gl.disable(gl.DEPTH_TEST)
    
    // 绑定顶点缓冲区（全屏 Quad）
    if (this.positionBuffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer)
      const positions = new Float32Array([
        -1, -1,
         1, -1,
        -1,  1,
        -1,  1,
         1, -1,
         1,  1
      ])
      gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW)
      const posLoc = gl.getAttribLocation(this.program, 'a_position')
      gl.enableVertexAttribArray(posLoc)
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)
    }
    
    if (this.texCoordBuffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer)
      // FBO 纹理的 UV 不需要翻转
      const texCoords = new Float32Array([
        0, 0,
        1, 0,
        0, 1,
        0, 1,
        1, 0,
        1, 1
      ])
      gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.DYNAMIC_DRAW)
      const texLoc = gl.getAttribLocation(this.program, 'a_texCoord')
      gl.enableVertexAttribArray(texLoc)
      gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0)
    }
    
    // 清屏并绘制
    gl.clearColor(0, 0, 0, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }
  
  /**
   * 初始化转场 shader 程序
   */
  private initTransitionProgram(): void {
    if (!this.gl) return
    
    // 创建转场着色器程序
    this.transitionProgram = this.createProgram(VERTEX_SHADER, TRANSITION_FRAGMENT_SHADER)
    if (!this.transitionProgram) {
      console.error('[WebGLRenderer] 转场程序创建失败')
      return
    }
    
    // 创建第二个纹理
    this.textureB = this.gl.createTexture()
    
    // 获取转场 uniforms
    this.transitionUniforms = {
      textureA: this.gl.getUniformLocation(this.transitionProgram, 'u_textureA'),
      textureB: this.gl.getUniformLocation(this.transitionProgram, 'u_textureB'),
      progress: this.gl.getUniformLocation(this.transitionProgram, 'u_progress'),
      transitionType: this.gl.getUniformLocation(this.transitionProgram, 'u_transitionType')
    }
  }

  private createShader(type: number, source: string): WebGLShader | null {
    if (!this.gl) return null
    
    const shader = this.gl.createShader(type)
    if (!shader) return null
    
    this.gl.shaderSource(shader, source)
    this.gl.compileShader(shader)
    
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      console.error('着色器编译失败:', this.gl.getShaderInfoLog(shader))
      this.gl.deleteShader(shader)
      return null
    }
    
    return shader
  }

  private createProgram(vertexSource: string, fragmentSource: string): WebGLProgram | null {
    if (!this.gl) return null
    
    const vertexShader = this.createShader(this.gl.VERTEX_SHADER, vertexSource)
    const fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, fragmentSource)
    
    if (!vertexShader || !fragmentShader) return null
    
    const program = this.gl.createProgram()
    if (!program) return null
    
    this.gl.attachShader(program, vertexShader)
    this.gl.attachShader(program, fragmentShader)
    this.gl.linkProgram(program)
    
    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      console.error('程序链接失败:', this.gl.getProgramInfoLog(program))
      return null
    }
    
    return program
  }

  private setupBuffers(): void {
    if (!this.gl || !this.program) return
    
    // 顶点位置（覆盖整个画布）
    const positions = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1
    ])
    
    // 纹理坐标
    const texCoords = new Float32Array([
      0, 1,
      1, 1,
      0, 0,
      0, 0,
      1, 1,
      1, 0
    ])
    
    // 位置缓冲
    this.positionBuffer = this.gl.createBuffer()
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer)
    this.gl.bufferData(this.gl.ARRAY_BUFFER, positions, this.gl.STATIC_DRAW)
    
    const positionLoc = this.gl.getAttribLocation(this.program, 'a_position')
    this.gl.enableVertexAttribArray(positionLoc)
    this.gl.vertexAttribPointer(positionLoc, 2, this.gl.FLOAT, false, 0, 0)
    
    // 纹理坐标缓冲
    this.texCoordBuffer = this.gl.createBuffer()
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.texCoordBuffer)
    this.gl.bufferData(this.gl.ARRAY_BUFFER, texCoords, this.gl.STATIC_DRAW)
    
    const texCoordLoc = this.gl.getAttribLocation(this.program, 'a_texCoord')
    this.gl.enableVertexAttribArray(texCoordLoc)
    this.gl.vertexAttribPointer(texCoordLoc, 2, this.gl.FLOAT, false, 0, 0)
  }

  private updateFilterUniforms(): void {
    if (!this.gl) return
    
    // 转换参数到着色器范围
    this.gl.uniform1f(this.uniforms.brightness, this.filterParams.brightness / 100)
    this.gl.uniform1f(this.uniforms.contrast, 1 + this.filterParams.contrast / 100)
    this.gl.uniform1f(this.uniforms.saturation, 1 + this.filterParams.saturation / 100)
    this.gl.uniform1f(this.uniforms.hue, this.filterParams.hue / 360)
    this.gl.uniform1f(this.uniforms.blur, this.filterParams.blur / 100)
  }

  /**
   * 更新滤镜参数
   */
  setFilter(params: Partial<FilterParams>): void {
    this.filterParams = { ...this.filterParams, ...params }
    this.updateFilterUniforms()
  }

  /**
   * 获取当前滤镜参数
   */
  getFilter(): FilterParams {
    return { ...this.filterParams }
  }

  /**
   * 重置滤镜
   */
  resetFilter(): void {
    this.filterParams = {
      brightness: 0,
      contrast: 0,
      saturation: 0,
      hue: 0,
      blur: 0
    }
    this.updateFilterUniforms()
  }

  /**
   * 获取当前纹理（供导出时使用自定义 EffectManager）
   */
  getTexture(): WebGLTexture | null {
    return this.texture
  }

  /**
   * 获取渲染上下文（供初始化自定义 EffectManager）
   */
  getRenderContext(): EffectRenderContext | null {
    if (!this.gl) return null
    
    return {
      gl: this.gl,
      canvas: this.canvas,
      createProgram: this.createProgram.bind(this),
      positionBuffer: this.positionBuffer,
      texCoordBuffer: this.texCoordBuffer
    }
  }

  /**
   * 渲染视频帧（支持多种显示模式）
   * @param source 视频/图片源
   * @param cropMode 显示模式：'contain' 保持比例有黑边，'cover' 居中裁剪，'fill' 拉伸
   */
  renderFrame(source: TexImageSource, cropMode: 'cover' | 'contain' | 'fill' = 'contain'): void {
    if (!this.gl || !this.texture || !this.program) return
    
    const gl = this.gl
    
    // [关键修复] 完整的 GL 状态重置 - 确保每次渲染都从干净状态开始
    // 这是参考专业级 NLE 软件（如剪映/Premiere）的"状态沙箱"设计模式
    // 注意：不在这里绑定 Framebuffer，因为可能在 FBO 内渲染
    gl.useProgram(this.program)               // 确保使用正确的 Shader
    gl.activeTexture(gl.TEXTURE0)             // 确保使用正确的纹理单元
    gl.disable(gl.BLEND)                      // 禁用混合（视频渲染不需要）
    gl.disable(gl.DEPTH_TEST)                 // 禁用深度测试（2D渲染不需要）
    gl.disable(gl.SCISSOR_TEST)               // 禁用剪裁测试
    gl.disable(gl.CULL_FACE)                  // 禁用面剔除
    gl.colorMask(true, true, true, true)      // 确保所有颜色通道可写
    gl.depthMask(true)                        // 确保深度可写（虽然禁用了）
    
    // 获取源尺寸
    let sourceWidth = 0
    let sourceHeight = 0
    
    if (source instanceof HTMLVideoElement) {
      sourceWidth = source.videoWidth
      sourceHeight = source.videoHeight
    } else if (source instanceof HTMLImageElement) {
      sourceWidth = source.naturalWidth
      sourceHeight = source.naturalHeight
    } else if (source instanceof HTMLCanvasElement) {
      sourceWidth = source.width
      sourceHeight = source.height
    }
    
    // 如果源尺寸无效，直接渲染
    if (sourceWidth === 0 || sourceHeight === 0) {
      this.renderFrameSimple(source)
      return
    }
    
    const canvasWidth = this.canvas.width
    const canvasHeight = this.canvas.height
    const sourceAspect = sourceWidth / sourceHeight
    const canvasAspect = canvasWidth / canvasHeight
    
    // 计算顶点位置和纹理坐标
    let positions: Float32Array
    let texCoords: Float32Array
    
    if (cropMode === 'contain') {
      // Contain 模式：保持源比例，可能有黑边
      let scaleX = 1, scaleY = 1
      
      if (sourceAspect > canvasAspect) {
        // 源更宽，上下留黑边
        scaleY = canvasAspect / sourceAspect
      } else {
        // 源更高，左右留黑边
        scaleX = sourceAspect / canvasAspect
      }
      
      // 调整顶点位置
      positions = new Float32Array([
        -scaleX, -scaleY,
         scaleX, -scaleY,
        -scaleX,  scaleY,
        -scaleX,  scaleY,
         scaleX, -scaleY,
         scaleX,  scaleY
      ])
      
      // 使用完整纹理
      texCoords = new Float32Array([
        0, 1,
        1, 1,
        0, 0,
        0, 0,
        1, 1,
        1, 0
      ])
    } else if (cropMode === 'cover') {
      // Cover 模式：居中裁剪，填满画布
      positions = new Float32Array([
        -1, -1,
         1, -1,
        -1,  1,
        -1,  1,
         1, -1,
         1,  1
      ])
      
      let texLeft = 0, texRight = 1, texTop = 0, texBottom = 1
      
      if (sourceAspect > canvasAspect) {
        // 源更宽，左右裁剪
        const scale = canvasAspect / sourceAspect
        const offset = (1 - scale) / 2
        texLeft = offset
        texRight = 1 - offset
      } else {
        // 源更高，上下裁剪
        const scale = sourceAspect / canvasAspect
        const offset = (1 - scale) / 2
        texTop = offset
        texBottom = 1 - offset
      }
      
      texCoords = new Float32Array([
        texLeft,  texBottom,
        texRight, texBottom,
        texLeft,  texTop,
        texLeft,  texTop,
        texRight, texBottom,
        texRight, texTop
      ])
    } else {
      // Fill 模式：拉伸填满
      positions = new Float32Array([
        -1, -1,
         1, -1,
        -1,  1,
        -1,  1,
         1, -1,
         1,  1
      ])
      
      texCoords = new Float32Array([
        0, 1,
        1, 1,
        0, 0,
        0, 0,
        1, 1,
        1, 0
      ])
    }
    
    // [关键修复] 确保使用正确的 WebGL 程序
    this.gl.useProgram(this.program)
    
    // 更新顶点位置缓冲
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer)
    this.gl.bufferData(this.gl.ARRAY_BUFFER, positions, this.gl.DYNAMIC_DRAW)
    
    const positionLoc = this.gl.getAttribLocation(this.program, 'a_position')
    this.gl.enableVertexAttribArray(positionLoc)
    this.gl.vertexAttribPointer(positionLoc, 2, this.gl.FLOAT, false, 0, 0)
    
    // 更新纹理坐标缓冲
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.texCoordBuffer)
    this.gl.bufferData(this.gl.ARRAY_BUFFER, texCoords, this.gl.DYNAMIC_DRAW)
    
    const texCoordLoc = this.gl.getAttribLocation(this.program, 'a_texCoord')
    this.gl.enableVertexAttribArray(texCoordLoc)
    this.gl.vertexAttribPointer(texCoordLoc, 2, this.gl.FLOAT, false, 0, 0)
    
    // 更新纹理
    this.gl.activeTexture(this.gl.TEXTURE0) // [修复] 显式激活纹理单元0，防止 EffectManager 状态残留导致黑屏
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture)
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      source
    )
    
    // 设置纹理参数
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR)
    
    // 绘制
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    this.gl.clearColor(0, 0, 0, 1) // 不透明黑色背景（确保导出视频正确）
    this.gl.clear(this.gl.COLOR_BUFFER_BIT)
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 6)
  }

  /**
   * 简单渲染（不计算裁剪）
   */
  private renderFrameSimple(source: TexImageSource): void {
    if (!this.gl || !this.texture || !this.program) return
    
    const gl = this.gl
    
    // [关键修复] 完整的 GL 状态重置（不改变 Framebuffer - 由调用者负责）
    gl.useProgram(this.program)
    gl.activeTexture(gl.TEXTURE0)
    gl.disable(gl.BLEND)
    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.SCISSOR_TEST)
    gl.disable(gl.CULL_FACE)
    gl.colorMask(true, true, true, true)
    
    // [关键修复] 重新绑定顶点缓冲区 - 确保不使用 EffectManager 的缓冲区
    if (this.positionBuffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer)
      // 使用标准全屏 Quad
      const positions = new Float32Array([
        -1, -1,
         1, -1,
        -1,  1,
        -1,  1,
         1, -1,
         1,  1
      ])
      gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW)
      const posLoc = gl.getAttribLocation(this.program, 'a_position')
      gl.enableVertexAttribArray(posLoc)
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)
    }
    
    if (this.texCoordBuffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer)
      // 标准 UV 坐标（翻转 Y）
      const texCoords = new Float32Array([
        0, 1,
        1, 1,
        0, 0,
        0, 0,
        1, 1,
        1, 0
      ])
      gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.DYNAMIC_DRAW)
      const texLoc = gl.getAttribLocation(this.program, 'a_texCoord')
      gl.enableVertexAttribArray(texLoc)
      gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0)
    }
    
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      source
    )
    
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.clearColor(0, 0, 0, 1) // 不透明黑色背景
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }



  /**
   * 转场类型映射表
   */
  private static readonly TRANSITION_TYPE_MAP: Record<string, number> = {
    'fade': 0,
    'dissolve': 1,
    'slideLeft': 2,
    'slideRight': 3,
    'wipe': 4,
    'zoom': 5,
    'blur': 6,
    'slideUp': 7,
    'slideDown': 8
  }

  /**
   * GPU 加速转场渲染
   * @param sourceA 第一个视频帧
   * @param sourceB 第二个视频帧
   * @param progress 转场进度 (0-1)
   * @param transitionType 转场类型
   */
  renderTransition(
    sourceA: TexImageSource,
    sourceB: TexImageSource,
    progress: number,
    transitionType: string
  ): void {
    if (!this.gl || !this.transitionProgram || !this.texture || !this.textureB) return
    
    const gl = this.gl
    
    // 使用转场着色器程序
    gl.useProgram(this.transitionProgram)
    
    // 绑定顶点属性
    const posLoc = gl.getAttribLocation(this.transitionProgram, 'a_position')
    const texLoc = gl.getAttribLocation(this.transitionProgram, 'a_texCoord')
    
    if (this.positionBuffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer)
      gl.enableVertexAttribArray(posLoc)
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)
    }
    
    if (this.texCoordBuffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer)
      gl.enableVertexAttribArray(texLoc)
      gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0)
    }
    
    // 绑定纹理 A（第一个视频帧）
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceA)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    
    // 绑定纹理 B（第二个视频帧）
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.textureB)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceB)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    
    // 设置 uniforms
    gl.uniform1i(this.transitionUniforms.textureA, 0)
    gl.uniform1i(this.transitionUniforms.textureB, 1)
    gl.uniform1f(this.transitionUniforms.progress, progress)
    
    // 获取转场类型索引
    const typeIndex = WebGLRenderer.TRANSITION_TYPE_MAP[transitionType] ?? 0
    gl.uniform1i(this.transitionUniforms.transitionType, typeIndex)
    
    // 渲染
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.clearColor(0, 0, 0, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
    
    // 恢复到主着色器程序
    gl.useProgram(this.program)
  }

  /**
   * 调整画布尺寸
   */
  resize(width: number, height: number): void {
    this.canvas.width = width
    this.canvas.height = height
    
    if (this.gl) {
      this.gl.viewport(0, 0, width, height)
    }
  }

  /**
   * 清空画布
   */
  clear(): void {
    if (!this.gl) return
    
    this.gl.clearColor(0, 0, 0, 1)
    this.gl.clear(this.gl.COLOR_BUFFER_BIT)
  }

  /**
   * 销毁渲染器
   */
  destroy(): void {
    if (!this.gl) return
    
    if (this.texture) {
      this.gl.deleteTexture(this.texture)
    }
    if (this.positionBuffer) {
      this.gl.deleteBuffer(this.positionBuffer)
    }
    if (this.texCoordBuffer) {
      this.gl.deleteBuffer(this.texCoordBuffer)
    }
    if (this.program) {
      this.gl.deleteProgram(this.program)
    }
    
    // 清理叠加层资源
    if (this.overlayBuffer) this.gl.deleteBuffer(this.overlayBuffer)
    if (this.overlayTexBuffer) this.gl.deleteBuffer(this.overlayTexBuffer)
    if (this.overlayProgram) this.gl.deleteProgram(this.overlayProgram)
    
    this.gl = null
    this.program = null
    this.texture = null
    
    this.overlayBuffer = null
    this.overlayTexBuffer = null
    this.overlayProgram = null
  }

  /**
   * 渲染叠加层 (贴纸/画中画)
   * 必须在 renderFrame 之后调用
   */
  renderOverlay(source: CanvasImageSource, transform: Transform): void {
    if (!this.gl) return
    if (!this.overlayProgram) {
      this.initOverlay()
    }
    if (!this.overlayProgram) return

    const gl = this.gl
    gl.useProgram(this.overlayProgram)

    // 1. 绑定并上传纹理
    // 注意：这里复用 this.texture (主纹理)，如果想避免冲突可以使用独立的 textureOverlay
    // 但为了节省显存和逻辑，复用是可行的，因为每次 draw 都会重新绑定
    if (!this.texture) {
      this.texture = gl.createTexture()
    }
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    
    // 上传纹理数据
    try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source as any)
    } catch (e) {
        console.warn('Failed to upload overlay texture', e)
        return
    }
    
    // 2. 开启混合
    gl.enable(gl.BLEND)
    // 假设素材是标准的 PNG/Image, 未预乘 Alpha
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    // 3. 获取源尺寸
    let sourceWidth = 0
    let sourceHeight = 0
    if (source instanceof HTMLVideoElement) {
        sourceWidth = source.videoWidth
        sourceHeight = source.videoHeight
    } else if (source instanceof HTMLImageElement) {
        sourceWidth = source.naturalWidth
        sourceHeight = source.naturalHeight
    } else if (typeof VideoFrame !== 'undefined' && source instanceof VideoFrame) {
        sourceWidth = source.displayWidth
        sourceHeight = source.displayHeight
    } else {
        sourceWidth = (source as any).width || 0
        sourceHeight = (source as any).height || 0
    }
    
    if (sourceWidth === 0 || sourceHeight === 0) return

    // 4. 设置 Uniforms
    const uResolution = gl.getUniformLocation(this.overlayProgram, 'u_resolution')
    const uImgSize = gl.getUniformLocation(this.overlayProgram, 'u_imgSize')
    const uTranslation = gl.getUniformLocation(this.overlayProgram, 'u_translation')
    const uScale = gl.getUniformLocation(this.overlayProgram, 'u_scale')
    const uRotation = gl.getUniformLocation(this.overlayProgram, 'u_rotation')
    const uOpacity = gl.getUniformLocation(this.overlayProgram, 'u_opacity')
    const uTexture = gl.getUniformLocation(this.overlayProgram, 'u_texture')

    gl.uniform1i(uTexture, 0)
    gl.uniform2f(uResolution, this.canvas.width, this.canvas.height)
    gl.uniform2f(uImgSize, sourceWidth, sourceHeight)
    
    gl.uniform2f(uTranslation, transform.x / 100, transform.y / 100)
    // 支持非等比缩放：优先使用 scaleX/scaleY，否则回退到 scale
    const scaleX = transform.scaleX ?? transform.scale
    const scaleY = transform.scaleY ?? transform.scale
    gl.uniform2f(uScale, scaleX, scaleY)
    gl.uniform1f(uRotation, transform.rotation * Math.PI / 180)
    gl.uniform1f(uOpacity, transform.opacity)

    // 5. 绑定独立缓冲区 (确保几何形状为标准正方形，不受 renderFrame 裁剪影响)
    if (this.overlayBuffer) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.overlayBuffer)
        const posLoc = gl.getAttribLocation(this.overlayProgram, 'a_position')
        gl.enableVertexAttribArray(posLoc)
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)
    }
    if (this.overlayTexBuffer) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.overlayTexBuffer)
        const texLoc = gl.getAttribLocation(this.overlayProgram, 'a_texCoord')
        gl.enableVertexAttribArray(texLoc)
        gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0)
    }

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    
    // 6. 恢复状态
    gl.disable(gl.BLEND)
  }

  private initOverlay() {
    if (!this.gl) return
    this.overlayProgram = this.createProgram(OVERLAY_VERTEX_SHADER, OVERLAY_FRAGMENT_SHADER)
    
    // 初始化标准 Quad Strip 缓冲区 (-1~1)
    // 顺序: BL, BR, TL, TR
    const positions = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
       1,  1
    ])
    this.overlayBuffer = this.gl.createBuffer()
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.overlayBuffer)
    this.gl.bufferData(this.gl.ARRAY_BUFFER, positions, this.gl.STATIC_DRAW)
    
    // UV 坐标 (0,0 对应 BL)
    // WebGL 默认不翻转 Y，纹理数据 (0,0) 是图像 Top-Left。
    // 为了让图像 Top-Left 显示在 Quad TL (-1,1):
    // TL (-1,1) 需要 UV (0,0)
    // BL (-1,-1) 需要 UV (0,1)
    const texCoords = new Float32Array([
      0, 1, // BL
      1, 1, // BR
      0, 0, // TL
      1, 0  // TR
    ])
    this.overlayTexBuffer = this.gl.createBuffer()
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.overlayTexBuffer)
    this.gl.bufferData(this.gl.ARRAY_BUFFER, texCoords, this.gl.STATIC_DRAW)
  }
}
