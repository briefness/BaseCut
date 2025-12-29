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

export class WebGLRenderer {
  private canvas: HTMLCanvasElement
  private gl: WebGLRenderingContext | null = null
  private program: WebGLProgram | null = null
  private texture: WebGLTexture | null = null
  private positionBuffer: WebGLBuffer | null = null
  private texCoordBuffer: WebGLBuffer | null = null
  
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

  constructor(canvas: HTMLCanvasElement) {
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
