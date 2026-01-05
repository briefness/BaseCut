/**
 * WebGL 渲染器
 * 使用 WebGL 实现 GPU 加速的视频帧渲染和滤镜特效
 */
import type { FilterParams } from '@/types'

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

  constructor(canvas: HTMLCanvasElement | OffscreenCanvas) {
    this.canvas = canvas
    this.init()
  }

  private init(): void {
    // 获取 WebGL 上下文
    this.gl = this.canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      powerPreference: 'high-performance'
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
   * 渲染视频帧（支持多种显示模式）
   * @param source 视频/图片源
   * @param cropMode 显示模式：'contain' 保持比例有黑边，'cover' 居中裁剪，'fill' 拉伸
   */
  renderFrame(source: TexImageSource, cropMode: 'cover' | 'contain' | 'fill' = 'contain'): void {
    if (!this.gl || !this.texture || !this.program) return
    
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
    this.gl.clearColor(0, 0, 0, 1)
    this.gl.clear(this.gl.COLOR_BUFFER_BIT)
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 6)
  }

  /**
   * 简单渲染（不计算裁剪）
   */
  private renderFrameSimple(source: TexImageSource): void {
    if (!this.gl || !this.texture) return
    
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture)
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      source
    )
    
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR)
    
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    this.gl.clearColor(0, 0, 0, 1)
    this.gl.clear(this.gl.COLOR_BUFFER_BIT)
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 6)
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
    
    this.gl = null
    this.program = null
    this.texture = null
  }
}
