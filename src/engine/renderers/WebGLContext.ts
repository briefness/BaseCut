/**
 * WebGLContext - 共享 WebGL 上下文管理器
 * 
 * 参考剪映的 GPU 资源复用策略：
 * 1. 着色器程序缓存（避免重复编译）
 * 2. 预分配静态缓冲区（内存池）
 * 3. 统一的纹理参数设置
 * 
 * @module renderers/WebGLContext
 */

import {
  VERTEX_SHADER,
  FRAGMENT_SHADER,
  TRANSITION_FRAGMENT_SHADER,
  OVERLAY_VERTEX_SHADER,
  OVERLAY_FRAGMENT_SHADER,
  ANIMATED_VERTEX_SHADER,
  ANIMATED_FRAGMENT_SHADER,
  SHADER_PROGRAM_IDS
} from '../shaders/CoreShaders'

/**
 * WebGL 上下文配置选项
 */
export interface WebGLContextOptions {
  /** 是否保留绘图缓冲区（导出时必需）*/
  preserveDrawingBuffer?: boolean
  /** 是否启用抗锯齿 */
  antialias?: boolean
  /** GPU 功耗偏好 */
  powerPreference?: 'default' | 'high-performance' | 'low-power'
}

/**
 * 着色器程序信息
 */
interface ProgramInfo {
  program: WebGLProgram
  uniforms: Record<string, WebGLUniformLocation | null>
  attributes: Record<string, number>
}

/**
 * WebGL 共享上下文管理器
 * 
 * 核心职责：
 * - WebGL 上下文初始化与配置
 * - 着色器编译与程序链接（带缓存）
 * - 缓冲区创建与管理
 * - 纹理创建与参数设置
 */
export class WebGLContext {
  private canvas: HTMLCanvasElement | OffscreenCanvas
  private gl: WebGLRenderingContext | null = null
  private programCache: Map<string, ProgramInfo> = new Map()
  
  // ==================== 预分配静态缓冲区 ====================
  
  /** 主顶点缓冲区 */
  private positionBuffer: WebGLBuffer | null = null
  
  /** 主纹理坐标缓冲区 */
  private texCoordBuffer: WebGLBuffer | null = null
  
  /** 叠加层专用顶点缓冲区 */
  private overlayPositionBuffer: WebGLBuffer | null = null
  
  /** 叠加层专用纹理坐标缓冲区 */
  private overlayTexCoordBuffer: WebGLBuffer | null = null
  
  // ==================== 预分配的浮点数组（避免 GC） ====================
  
  /** 6 个顶点的 2D 坐标（6 * 2 = 12 个浮点数）*/
  public readonly staticPositions = new Float32Array(12)
  
  /** 6 个顶点的 UV 纹理坐标 */
  public readonly staticTexCoords = new Float32Array(12)
  
  /** FBO 专用纹理坐标（Y 轴不翻转）*/
  public readonly staticFboTexCoords = new Float32Array([
    0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1
  ])
  
  /** 全屏矩形顶点，覆盖 [-1, 1] × [-1, 1] */
  public readonly fullscreenQuad = new Float32Array([
    -1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1
  ])
  
  /** 标准视频纹理坐标（Y 轴翻转）*/
  public readonly standardTexCoords = new Float32Array([
    0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0
  ])

  constructor(canvas: HTMLCanvasElement | OffscreenCanvas, options: WebGLContextOptions = {}) {
    this.canvas = canvas
    this.init(options)
  }

  /**
   * 初始化 WebGL 上下文
   */
  private init(options: WebGLContextOptions): void {
    // 获取 WebGL 上下文
    this.gl = this.canvas.getContext('webgl', {
      alpha: false,
      antialias: options.antialias ?? false,
      powerPreference: options.powerPreference ?? 'high-performance',
      preserveDrawingBuffer: options.preserveDrawingBuffer ?? false
    })

    if (!this.gl) {
      console.error('[WebGLContext] WebGL 不可用')
      return
    }

    // 初始化缓冲区
    this.setupBuffers()
    
    // 预编译常用着色器程序
    this.precompilePrograms()
  }

  /**
   * 初始化顶点和纹理坐标缓冲区
   */
  private setupBuffers(): void {
    if (!this.gl) return

    const gl = this.gl

    // 主顶点缓冲区
    this.positionBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, this.fullscreenQuad, gl.DYNAMIC_DRAW)

    // 主纹理坐标缓冲区
    this.texCoordBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, this.standardTexCoords, gl.DYNAMIC_DRAW)

    // 叠加层顶点缓冲区（4 顶点 TRIANGLE_STRIP）
    const overlayPositions = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
       1,  1
    ])
    this.overlayPositionBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, this.overlayPositionBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, overlayPositions, gl.STATIC_DRAW)

    // 叠加层纹理坐标缓冲区
    const overlayTexCoords = new Float32Array([
      0, 1, // BL
      1, 1, // BR
      0, 0, // TL
      1, 0  // TR
    ])
    this.overlayTexCoordBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, this.overlayTexCoordBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, overlayTexCoords, gl.STATIC_DRAW)
  }

  /**
   * 预编译常用着色器程序
   */
  private precompilePrograms(): void {
    // 基础滤镜程序
    this.getOrCreateProgram(
      SHADER_PROGRAM_IDS.BASIC,
      VERTEX_SHADER,
      FRAGMENT_SHADER,
      ['u_texture', 'u_brightness', 'u_contrast', 'u_saturation', 'u_hue', 'u_blur']
    )

    // 转场程序
    this.getOrCreateProgram(
      SHADER_PROGRAM_IDS.TRANSITION,
      VERTEX_SHADER,
      TRANSITION_FRAGMENT_SHADER,
      ['u_textureA', 'u_textureB', 'u_progress', 'u_transitionType']
    )

    // 叠加层程序
    this.getOrCreateProgram(
      SHADER_PROGRAM_IDS.OVERLAY,
      OVERLAY_VERTEX_SHADER,
      OVERLAY_FRAGMENT_SHADER,
      ['u_texture', 'u_resolution', 'u_imgSize', 'u_translation', 'u_scale', 'u_rotation', 'u_opacity']
    )

    // 动画程序
    this.getOrCreateProgram(
      SHADER_PROGRAM_IDS.ANIMATED,
      ANIMATED_VERTEX_SHADER,
      ANIMATED_FRAGMENT_SHADER,
      ['u_texture', 'u_transform', 'u_resolution', 'u_opacity', 'u_brightness', 'u_contrast', 'u_saturation', 'u_hue']
    )
  }

  /**
   * 获取或创建着色器程序（带缓存）
   * 
   * @param id 程序标识符
   * @param vertexSource 顶点着色器源码
   * @param fragmentSource 片段着色器源码
   * @param uniformNames 需要获取位置的 uniform 名称列表
   */
  getOrCreateProgram(
    id: string,
    vertexSource: string,
    fragmentSource: string,
    uniformNames: string[] = []
  ): ProgramInfo | null {
    // 检查缓存
    if (this.programCache.has(id)) {
      return this.programCache.get(id)!
    }

    if (!this.gl) return null

    // 创建程序
    const program = this.createProgram(vertexSource, fragmentSource)
    if (!program) return null

    // 获取 uniform 位置
    const uniforms: Record<string, WebGLUniformLocation | null> = {}
    for (const name of uniformNames) {
      uniforms[name] = this.gl.getUniformLocation(program, name)
    }

    // 获取 attribute 位置
    const attributes: Record<string, number> = {
      a_position: this.gl.getAttribLocation(program, 'a_position'),
      a_texCoord: this.gl.getAttribLocation(program, 'a_texCoord')
    }

    const info: ProgramInfo = { program, uniforms, attributes }
    this.programCache.set(id, info)

    return info
  }

  /**
   * 创建着色器
   */
  private createShader(type: number, source: string): WebGLShader | null {
    if (!this.gl) return null

    const shader = this.gl.createShader(type)
    if (!shader) return null

    this.gl.shaderSource(shader, source)
    this.gl.compileShader(shader)

    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      console.error('[WebGLContext] 着色器编译失败:', this.gl.getShaderInfoLog(shader))
      this.gl.deleteShader(shader)
      return null
    }

    return shader
  }

  /**
   * 创建着色器程序
   */
  createProgram(vertexSource: string, fragmentSource: string): WebGLProgram | null {
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
      console.error('[WebGLContext] 程序链接失败:', this.gl.getProgramInfoLog(program))
      return null
    }

    // 链接完成后可以删除着色器对象
    this.gl.deleteShader(vertexShader)
    this.gl.deleteShader(fragmentShader)

    return program
  }

  /**
   * 创建纹理
   */
  createTexture(): WebGLTexture | null {
    if (!this.gl) return null
    return this.gl.createTexture()
  }

  /**
   * 设置纹理参数（标准设置）
   */
  setupTextureParams(texture: WebGLTexture): void {
    if (!this.gl) return

    this.gl.bindTexture(this.gl.TEXTURE_2D, texture)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR)
  }

  /**
   * 上传纹理数据
   */
  uploadTexture(texture: WebGLTexture, source: TexImageSource): void {
    if (!this.gl) return

    this.gl.bindTexture(this.gl.TEXTURE_2D, texture)
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      source
    )
  }

  /**
   * 重置 GL 状态到干净状态
   * 参考剪映/Premiere 的"状态沙箱"设计模式
   */
  resetState(): void {
    if (!this.gl) return

    const gl = this.gl
    gl.activeTexture(gl.TEXTURE0)
    gl.disable(gl.BLEND)
    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.SCISSOR_TEST)
    gl.disable(gl.CULL_FACE)
    gl.colorMask(true, true, true, true)
    gl.depthMask(true)
  }

  /**
   * 启用混合模式（用于叠加层）
   */
  enableBlend(): void {
    if (!this.gl) return
    this.gl.enable(this.gl.BLEND)
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA)
  }

  /**
   * 禁用混合模式
   */
  disableBlend(): void {
    if (!this.gl) return
    this.gl.disable(this.gl.BLEND)
  }

  // ==================== Getter ====================

  getGL(): WebGLRenderingContext | null {
    return this.gl
  }

  getCanvas(): HTMLCanvasElement | OffscreenCanvas {
    return this.canvas
  }

  getPositionBuffer(): WebGLBuffer | null {
    return this.positionBuffer
  }

  getTexCoordBuffer(): WebGLBuffer | null {
    return this.texCoordBuffer
  }

  getOverlayPositionBuffer(): WebGLBuffer | null {
    return this.overlayPositionBuffer
  }

  getOverlayTexCoordBuffer(): WebGLBuffer | null {
    return this.overlayTexCoordBuffer
  }

  getProgram(id: string): ProgramInfo | null {
    return this.programCache.get(id) ?? null
  }

  /**
   * 获取画布尺寸
   */
  getSize(): { width: number; height: number } {
    return {
      width: this.canvas.width,
      height: this.canvas.height
    }
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
   * 销毁上下文，释放资源
   */
  destroy(): void {
    if (!this.gl) return

    // 删除所有程序
    for (const [, info] of this.programCache) {
      this.gl.deleteProgram(info.program)
    }
    this.programCache.clear()

    // 删除缓冲区
    if (this.positionBuffer) this.gl.deleteBuffer(this.positionBuffer)
    if (this.texCoordBuffer) this.gl.deleteBuffer(this.texCoordBuffer)
    if (this.overlayPositionBuffer) this.gl.deleteBuffer(this.overlayPositionBuffer)
    if (this.overlayTexCoordBuffer) this.gl.deleteBuffer(this.overlayTexCoordBuffer)

    this.gl = null
  }
}
