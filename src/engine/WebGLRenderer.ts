/**
 * WebGL 渲染器
 * 使用 WebGL 实现 GPU 加速的视频帧渲染和滤镜特效
 * 
 * 着色器代码已提取到 shaders/ 模块，便于维护和复用
 */
import type { FilterParams, Transform } from '@/types'
import type { VideoEffect } from '@/types/effects'
import { effectManager as defaultEffectManager, type EffectRenderContext, type EffectManager } from './EffectManager'
import {
  BASIC_VERTEX_SHADER,
  BASIC_FRAGMENT_SHADER,
  TRANSITION_FRAGMENT_SHADER,
  OVERLAY_VERTEX_SHADER,
  OVERLAY_FRAGMENT_SHADER,
  ANIMATED_VERTEX_SHADER,
  ANIMATED_FRAGMENT_SHADER,
} from './shaders'

// 为保持向后兼容，保留本地别名
const VERTEX_SHADER = BASIC_VERTEX_SHADER
const FRAGMENT_SHADER = BASIC_FRAGMENT_SHADER

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

  // [新增] 动画渲染程序
  private animatedProgram: WebGLProgram | null = null
  private animatedUniforms: Record<string, WebGLUniformLocation | null> = {}

  // ==================== 静态缓冲区 ====================
  // 预分配的顶点和纹理坐标数组，渲染时直接修改内容而不重新创建
  
  // 6 个顶点的 2D 坐标（6 * 2 = 12 个浮点数）
  private readonly staticPositions = new Float32Array(12)
  
  // 6 个顶点的 UV 纹理坐标
  private readonly staticTexCoords = new Float32Array(12)
  
  // FBO 专用纹理坐标（Y 轴不翻转）
  private readonly staticFboTexCoords = new Float32Array([
    0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1
  ])
  
  // 全屏矩形顶点，覆盖 [-1, 1] × [-1, 1]
  private readonly fullscreenQuad = new Float32Array([
    -1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1
  ])
  
  // 标准视频纹理坐标（Y 轴翻转，因为视频原点在左上，WebGL 原点在左下）
  private readonly standardTexCoords = new Float32Array([
    0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0
  ])

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
    }) as WebGLRenderingContext | null
    
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
    
    // [新增] 初始化动画渲染程序
    this.initAnimatedProgram()
    
    // [修复] 条件性初始化特效管理器
    // 导出时使用独立的 EffectManager，避免破坏播放器的全局状态
    if (!this.options.skipEffectManagerInit) {
      this.initEffectManager()
    }
  }
  
  /**
   * 初始化动画渲染程序
   * 用于支持关键帧动画变换（位置、缩放、旋转、透明度）
   */
  private initAnimatedProgram(): void {
    if (!this.gl) return
    
    this.animatedProgram = this.createProgram(ANIMATED_VERTEX_SHADER, ANIMATED_FRAGMENT_SHADER)
    if (!this.animatedProgram) {
      console.error('[WebGLRenderer] 动画程序创建失败')
      return
    }
    
    // 获取 uniform 位置
    this.animatedUniforms = {
      texture: this.gl.getUniformLocation(this.animatedProgram, 'u_texture'),
      transform: this.gl.getUniformLocation(this.animatedProgram, 'u_transform'),
      resolution: this.gl.getUniformLocation(this.animatedProgram, 'u_resolution'),
      opacity: this.gl.getUniformLocation(this.animatedProgram, 'u_opacity'),
      brightness: this.gl.getUniformLocation(this.animatedProgram, 'u_brightness'),
      contrast: this.gl.getUniformLocation(this.animatedProgram, 'u_contrast'),
      saturation: this.gl.getUniformLocation(this.animatedProgram, 'u_saturation'),
      hue: this.gl.getUniformLocation(this.animatedProgram, 'u_hue')
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
   * 渲染带动画变换的视频帧
   * 支持关键帧动画：位置、缩放、旋转、透明度
   * 
   * @param source 视频源
   * @param transformMatrix 4x4 变换矩阵（由 AnimationEngine.createTransformMatrix 生成）
   * @param opacity 透明度（0-1）
   * @param cropMode 裁剪模式
   */
  renderFrameWithAnimation(
    source: TexImageSource,
    transformMatrix: Float32Array,
    opacity: number = 1,
    cropMode: 'cover' | 'contain' | 'fill' = 'contain'
  ): void {
    if (!this.gl || !this.texture || !this.animatedProgram) return
    
    const gl = this.gl
    
    // 1. 状态重置（确保干净的起点）
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.useProgram(this.animatedProgram)
    gl.activeTexture(gl.TEXTURE0)
    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.CULL_FACE)
    
    // 2. 启用混合（支持透明度）
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    
    // 3. 获取源尺寸（用于计算正确的顶点位置）
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
    
    // 如果源尺寸无效，使用全屏
    if (sourceWidth === 0 || sourceHeight === 0) {
      sourceWidth = this.canvas.width
      sourceHeight = this.canvas.height
    }
    
    const canvasWidth = this.canvas.width
    const canvasHeight = this.canvas.height
    const sourceAspect = sourceWidth / sourceHeight
    const canvasAspect = canvasWidth / canvasHeight
    
    // 4. 计算顶点位置（考虑 cropMode）- 使用预分配的静态数组
    if (cropMode === 'contain') {
      // Contain 模式：保持源比例，可能有黑边
      let scaleX = 1, scaleY = 1
      
      if (sourceAspect > canvasAspect) {
        scaleY = canvasAspect / sourceAspect
      } else {
        scaleX = sourceAspect / canvasAspect
      }
      
      // 直接修改预分配数组的值
      this.staticPositions[0] = -scaleX; this.staticPositions[1] = -scaleY
      this.staticPositions[2] = scaleX;  this.staticPositions[3] = -scaleY
      this.staticPositions[4] = -scaleX; this.staticPositions[5] = scaleY
      this.staticPositions[6] = -scaleX; this.staticPositions[7] = scaleY
      this.staticPositions[8] = scaleX;  this.staticPositions[9] = -scaleY
      this.staticPositions[10] = scaleX; this.staticPositions[11] = scaleY
    } else {
      // Cover/Fill 模式：使用全屏 Quad
      this.staticPositions.set(this.fullscreenQuad)
    }
    
    // 5. 绑定顶点缓冲（使用静态数组）
    if (this.positionBuffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer)
      gl.bufferData(gl.ARRAY_BUFFER, this.staticPositions, gl.DYNAMIC_DRAW)
      const posLoc = gl.getAttribLocation(this.animatedProgram, 'a_position')
      gl.enableVertexAttribArray(posLoc)
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)
    }
    
    if (this.texCoordBuffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer)
      // 使用预分配的标准纹理坐标（Y 翻转）
      gl.bufferData(gl.ARRAY_BUFFER, this.standardTexCoords, gl.DYNAMIC_DRAW)
      const texLoc = gl.getAttribLocation(this.animatedProgram, 'a_texCoord')
      gl.enableVertexAttribArray(texLoc)
      gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0)
    }
    
    // 6. 上传纹理
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    
    // 7. 设置 Uniforms
    gl.uniform1i(this.animatedUniforms.texture, 0)
    gl.uniformMatrix4fv(this.animatedUniforms.transform, false, transformMatrix)
    gl.uniform2f(this.animatedUniforms.resolution, canvasWidth, canvasHeight)
    gl.uniform1f(this.animatedUniforms.opacity, opacity)
    
    // 滤镜参数
    gl.uniform1f(this.animatedUniforms.brightness, this.filterParams.brightness)
    gl.uniform1f(this.animatedUniforms.contrast, 1 + this.filterParams.contrast)
    gl.uniform1f(this.animatedUniforms.saturation, 1 + this.filterParams.saturation)
    gl.uniform1f(this.animatedUniforms.hue, this.filterParams.hue)
    
    // 8. 渲染
    gl.viewport(0, 0, canvasWidth, canvasHeight)
    gl.clearColor(0, 0, 0, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
    
    // 9. 恢复状态
    gl.disable(gl.BLEND)
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

      // 渲染源画面到 FBO
      // [关键] skipClear=true 跳过清屏，保留上面设置的透明背景
      // 这样视频内容区域 Alpha=1，黑边区域 Alpha=0，特效只影响内容区域
      this.renderFrame(source, cropMode, true)

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
    
    // 绑定顶点缓冲区（使用预分配的全屏 Quad）
    if (this.positionBuffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer)
      gl.bufferData(gl.ARRAY_BUFFER, this.fullscreenQuad, gl.DYNAMIC_DRAW)
      const posLoc = gl.getAttribLocation(this.program, 'a_position')
      gl.enableVertexAttribArray(posLoc)
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)
    }
    
    if (this.texCoordBuffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer)
      // FBO 纹理的 UV 使用预分配的静态数组（不翻转）
      gl.bufferData(gl.ARRAY_BUFFER, this.staticFboTexCoords, gl.DYNAMIC_DRAW)
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
   * 
   * [架构说明] 参考剪映/Premiere 等专业 NLE 软件的渲染管线设计：
   * - 当渲染到屏幕时，使用不透明黑色背景（确保导出正确）
   * - 当渲染到 FBO 供特效处理时，跳过清屏以保留透明 Alpha 通道
   * 
   * @param source 视频/图片源
   * @param cropMode 显示模式：'contain' 保持比例有黑边，'cover' 居中裁剪，'fill' 拉伸
   * @param skipClear 是否跳过清屏操作（FBO 模式下应为 true，由调用者预先清空）
   */
  renderFrame(
    source: TexImageSource, 
    cropMode: 'cover' | 'contain' | 'fill' = 'contain',
    skipClear: boolean = false
  ): void {
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
    
    // 计算顶点位置和纹理坐标 - 使用预分配的静态数组
    
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
      
      // 调整顶点位置 - 使用预分配数组
      this.staticPositions[0] = -scaleX; this.staticPositions[1] = -scaleY
      this.staticPositions[2] = scaleX;  this.staticPositions[3] = -scaleY
      this.staticPositions[4] = -scaleX; this.staticPositions[5] = scaleY
      this.staticPositions[6] = -scaleX; this.staticPositions[7] = scaleY
      this.staticPositions[8] = scaleX;  this.staticPositions[9] = -scaleY
      this.staticPositions[10] = scaleX; this.staticPositions[11] = scaleY
      
      // 使用预分配的标准纹理坐标
      this.staticTexCoords.set(this.standardTexCoords)
    } else if (cropMode === 'cover') {
      // Cover 模式：居中裁剪，填满画布 - 使用预分配数组
      this.staticPositions.set(this.fullscreenQuad)
      
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
      
      // 直接修改预分配的纹理坐标数组
      this.staticTexCoords[0] = texLeft;  this.staticTexCoords[1] = texBottom
      this.staticTexCoords[2] = texRight; this.staticTexCoords[3] = texBottom
      this.staticTexCoords[4] = texLeft;  this.staticTexCoords[5] = texTop
      this.staticTexCoords[6] = texLeft;  this.staticTexCoords[7] = texTop
      this.staticTexCoords[8] = texRight; this.staticTexCoords[9] = texBottom
      this.staticTexCoords[10] = texRight; this.staticTexCoords[11] = texTop
    } else {
      // Fill 模式：拉伸填满 - 使用预分配数组
      this.staticPositions.set(this.fullscreenQuad)
      this.staticTexCoords.set(this.standardTexCoords)
    }
    
    // [关键修复] 确保使用正确的 WebGL 程序
    this.gl.useProgram(this.program)
    
    // 更新顶点位置缓冲 - 使用静态数组
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer)
    this.gl.bufferData(this.gl.ARRAY_BUFFER, this.staticPositions, this.gl.DYNAMIC_DRAW)
    
    const positionLoc = this.gl.getAttribLocation(this.program, 'a_position')
    this.gl.enableVertexAttribArray(positionLoc)
    this.gl.vertexAttribPointer(positionLoc, 2, this.gl.FLOAT, false, 0, 0)
    
    // 更新纹理坐标缓冲 - 使用静态数组
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.texCoordBuffer)
    this.gl.bufferData(this.gl.ARRAY_BUFFER, this.staticTexCoords, this.gl.DYNAMIC_DRAW)
    
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
    
    // [关键修复] 条件性清屏
    // - 渲染到屏幕时：使用不透明黑色背景（确保导出视频背景正确）
    // - 渲染到 FBO 时：跳过清屏，保留调用者设置的透明背景（特效 Alpha 遮罩需要）
    if (!skipClear) {
      this.gl.clearColor(0, 0, 0, 1) // 不透明黑色背景
      this.gl.clear(this.gl.COLOR_BUFFER_BIT)
    }
    
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
   * 
   * [架构说明] 转场涉及两个视频源，需要同时考虑两者的宽高比。
   * 使用 contain 模式确保两个视频都完整显示，以较窄的那个为准计算黑边。
   * 
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
    
    // [关键修复] 获取两个视频源的尺寸，计算正确的显示区域
    const getSrcSize = (src: TexImageSource): { w: number, h: number } => {
      if (src instanceof HTMLVideoElement) {
        return { w: src.videoWidth, h: src.videoHeight }
      } else if (src instanceof HTMLImageElement) {
        return { w: src.naturalWidth, h: src.naturalHeight }
      } else if (src instanceof HTMLCanvasElement) {
        return { w: src.width, h: src.height }
      }
      return { w: 0, h: 0 }
    }
    
    const sizeA = getSrcSize(sourceA)
    const sizeB = getSrcSize(sourceB)
    
    // 取两个源中较大的宽高比（确保两个视频都能完整显示）
    const canvasWidth = this.canvas.width
    const canvasHeight = this.canvas.height
    const canvasAspect = canvasWidth / canvasHeight
    
    // 计算两个视频各自的宽高比，默认为 1（方形）
    const aspectA = sizeA.w > 0 && sizeA.h > 0 ? sizeA.w / sizeA.h : canvasAspect
    const aspectB = sizeB.w > 0 && sizeB.h > 0 ? sizeB.w / sizeB.h : canvasAspect
    
    // 使用较竖的那个视频的宽高比（这样两个都能完整显示）
    const sourceAspect = Math.min(aspectA, aspectB)
    
    // 计算 contain 模式的缩放比例
    let scaleX = 1, scaleY = 1
    if (sourceAspect > canvasAspect) {
      // 源更宽，上下留黑边
      scaleY = canvasAspect / sourceAspect
    } else {
      // 源更高，左右留黑边
      scaleX = sourceAspect / canvasAspect
    }
    
    // [关键修复] 更新顶点位置缓冲区，应用正确的缩放
    const positions = new Float32Array([
      -scaleX, -scaleY,
       scaleX, -scaleY,
      -scaleX,  scaleY,
      -scaleX,  scaleY,
       scaleX, -scaleY,
       scaleX,  scaleY
    ])
    
    // 标准纹理坐标（Y 轴翻转）
    const texCoords = new Float32Array([
      0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0
    ])
    
    // 使用转场着色器程序
    gl.useProgram(this.transitionProgram)
    
    // 绑定顶点属性（使用正确缩放的几何数据）
    const posLoc = gl.getAttribLocation(this.transitionProgram, 'a_position')
    const texLoc = gl.getAttribLocation(this.transitionProgram, 'a_texCoord')
    
    if (this.positionBuffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer)
      gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW)
      gl.enableVertexAttribArray(posLoc)
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)
    }
    
    if (this.texCoordBuffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer)
      gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.DYNAMIC_DRAW)
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
