/**
 * 特效管理器
 * 
 * 核心职责：
 * 1. 管理特效的 WebGL 程序（懒加载、缓存）
 * 2. 计算特效在当前时间的强度
 * 3. 应用特效到渲染管线
 * 
 * 设计原则：
 * - 高性能：WebGL 程序复用，避免重复编译
 * - 可扩展：新特效只需添加着色器和参数映射
 * - 健壮性：完整的错误处理和资源清理
 */

import type { VideoEffect, VideoEffectType } from '@/types/effects'
import { getEffectIntensity } from '@/types/effects'
import { getEffectShaders } from './EffectShaders'

/**
 * 特效渲染器接口
 * 用于与 WebGLRenderer 解耦
 */
export interface EffectRenderContext {
  gl: WebGLRenderingContext
  canvas: HTMLCanvasElement | OffscreenCanvas
  createProgram: (vertexSource: string, fragmentSource: string) => WebGLProgram | null
  positionBuffer: WebGLBuffer | null
  texCoordBuffer: WebGLBuffer | null
}

/**
 * 编译后的特效程序
 */
interface CompiledEffectProgram {
  program: WebGLProgram
  uniforms: Map<string, WebGLUniformLocation | null>
  attributes: {
    position: number
    texCoord: number
  }
}

/**
 * 特效管理器类
 */
export class EffectManager {
  // WebGL 上下文
  private gl: WebGLRenderingContext | null = null
  
  // 程序缓存（按特效类型）
  private programCache: Map<VideoEffectType, CompiledEffectProgram> = new Map()
  
  // 渲染上下文
  private renderContext: EffectRenderContext | null = null
  
  // 帧缓冲（用于特效链式渲染）
  private framebuffers: WebGLFramebuffer[] = []
  private frameTextures: WebGLTexture[] = []
  private currentFBIndex: number = 0
  
  // 画布尺寸
  private width: number = 1920
  private height: number = 1080

  // [新增] 独立几何缓冲区 (避免复用 Renderer 的动态 Buffer)
  private geometryBuffer: WebGLBuffer | null = null
  private uvBuffer: WebGLBuffer | null = null

  /**
   * 初始化特效管理器
   * @param context 渲染上下文
   */
  init(context: EffectRenderContext): void {
    this.gl = context.gl
    this.renderContext = context
    this.width = context.canvas.width
    this.height = context.canvas.height
    
    // 初始化双缓冲帧缓冲（用于特效链）
    // 初始化双缓冲帧缓冲（用于特效链）
    this.initFramebuffers()
    // 初始化几何数据
    this.initBuffers()
  }

  /**
   * 初始化独立几何缓冲区
   * 标准全屏 Quad (-1~1) 和 UV (0~1)
   */
  private initBuffers(): void {
    const gl = this.gl
    if (!gl) return

    // 顶点位置
    const positions = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1
    ])
    this.geometryBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, this.geometryBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW)

    // 纹理坐标
    const texCoords = new Float32Array([
      0, 0,
      1, 0,
      0, 1,
      0, 1,
      1, 0,
      1, 1
    ])
    this.uvBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW)
  }

  /**
   * 初始化帧缓冲
   * 用于多特效叠加时的 ping-pong 渲染
   */
  private initFramebuffers(): void {
    const gl = this.gl
    if (!gl) return
    
    for (let i = 0; i < 2; i++) {
      // 创建纹理
      const texture = gl.createTexture()
      if (!texture) continue
      
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.texImage2D(
        gl.TEXTURE_2D, 0, gl.RGBA,
        this.width, this.height, 0,
        gl.RGBA, gl.UNSIGNED_BYTE, null
      )
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      
      // 创建帧缓冲
      const fb = gl.createFramebuffer()
      if (!fb) continue
      
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
      
      this.frameTextures.push(texture)
      this.framebuffers.push(fb)
    }
    
    // 恢复默认帧缓冲
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.bindTexture(gl.TEXTURE_2D, null)
  }

  /**
   * 获取或编译特效程序
   * @param type 特效类型
   */
  private getOrCreateProgram(type: VideoEffectType): CompiledEffectProgram | null {
    // 检查缓存
    const cached = this.programCache.get(type)
    if (cached) return cached
    
    const gl = this.gl
    const context = this.renderContext
    if (!gl || !context) return null
    
    // 获取着色器源码
    const shaders = getEffectShaders(type)
    
    // 编译程序
    const program = context.createProgram(shaders.vertexShader, shaders.fragmentShader)
    if (!program) {
      console.error(`[EffectManager] 无法编译特效程序: ${type}`)
      return null
    }
    
    // 获取 uniform 位置
    const uniforms = new Map<string, WebGLUniformLocation | null>()
    const uniformNames = this.getUniformNames(type)
    for (const name of uniformNames) {
      uniforms.set(name, gl.getUniformLocation(program, name))
    }
    
    // 获取 attribute 位置
    const attributes = {
      position: gl.getAttribLocation(program, 'a_position'),
      texCoord: gl.getAttribLocation(program, 'a_texCoord')
    }
    
    const compiled: CompiledEffectProgram = { program, uniforms, attributes }
    this.programCache.set(type, compiled)
    
    return compiled
  }

  /**
   * 获取特效所需的 uniform 名称列表
   */
  private getUniformNames(type: VideoEffectType): string[] {
    // 通用 uniform
    const common = ['u_texture', 'u_time', 'u_resolution', 'u_intensity']
    
    // 特效专用 uniform
    const specific: Record<VideoEffectType, string[]> = {
      flash: ['u_color'],
      shake: ['u_frequency', 'u_direction'],
      glitch: ['u_rgbSplit', 'u_scanlineIntensity', 'u_blockGlitch'],
      radialBlur: ['u_center', 'u_samples'],
      chromatic: ['u_angle'],
      pixelate: ['u_pixelSize'],
      invert: [],
      filmGrain: ['u_grainIntensity', 'u_scratchIntensity', 'u_flickerIntensity', 'u_sepiaAmount'],
      vignette: ['u_radius', 'u_softness'],
      splitScreen: ['u_splitCount', 'u_direction', 'u_gap']
    }
    
    return [...common, ...(specific[type] || [])]
  }

  /**
   * 设置特效的 uniform 值
   */
  private setEffectUniforms(
    compiled: CompiledEffectProgram,
    effect: VideoEffect,
    intensity: number,
    time: number
  ): void {
    const gl = this.gl
    if (!gl) return
    
    const { uniforms } = compiled
    const params = effect.params
    
    // 通用 uniform
    const texLoc = uniforms.get('u_texture')
    if (texLoc) gl.uniform1i(texLoc, 0)
    
    const timeLoc = uniforms.get('u_time')
    if (timeLoc) gl.uniform1f(timeLoc, time)
    
    const resLoc = uniforms.get('u_resolution')
    if (resLoc) gl.uniform2f(resLoc, this.width, this.height)
    
    const intensityLoc = uniforms.get('u_intensity')
    if (intensityLoc) gl.uniform1f(intensityLoc, intensity)
    
    // 特效专用 uniform
    switch (effect.type) {
      case 'flash':
        this.setFlashUniforms(gl, uniforms, params)
        break
      case 'shake':
        this.setShakeUniforms(gl, uniforms, params)
        break
      case 'glitch':
        this.setGlitchUniforms(gl, uniforms, params)
        break
      case 'radialBlur':
        this.setRadialBlurUniforms(gl, uniforms, params)
        break
      case 'chromatic':
        this.setChromaticUniforms(gl, uniforms, params)
        break
      case 'pixelate':
        this.setPixelateUniforms(gl, uniforms, params)
        break
      case 'filmGrain':
        this.setFilmGrainUniforms(gl, uniforms, params)
        break
      case 'vignette':
        this.setVignetteUniforms(gl, uniforms, params)
        break
      case 'splitScreen':
        this.setSplitScreenUniforms(gl, uniforms, params)
        break
    }
  }

  // ==================== 各特效 uniform 设置 ====================
  
  private setFlashUniforms(
    gl: WebGLRenderingContext,
    uniforms: Map<string, WebGLUniformLocation | null>,
    params: Record<string, unknown>
  ): void {
    const colorLoc = uniforms.get('u_color')
    if (colorLoc) {
      const colorStr = (params.color as string) || '#ffffff'
      const r = parseInt(colorStr.slice(1, 3), 16) / 255
      const g = parseInt(colorStr.slice(3, 5), 16) / 255
      const b = parseInt(colorStr.slice(5, 7), 16) / 255
      gl.uniform3f(colorLoc, r, g, b)
    }
  }

  private setShakeUniforms(
    gl: WebGLRenderingContext,
    uniforms: Map<string, WebGLUniformLocation | null>,
    params: Record<string, unknown>
  ): void {
    const freqLoc = uniforms.get('u_frequency')
    if (freqLoc) gl.uniform1f(freqLoc, (params.frequency as number) || 30)
    
    const dirLoc = uniforms.get('u_direction')
    if (dirLoc) {
      const dir = params.direction as string
      const dirValue = dir === 'horizontal' ? 0 : dir === 'vertical' ? 1 : 2
      gl.uniform1i(dirLoc, dirValue)
    }
  }

  private setGlitchUniforms(
    gl: WebGLRenderingContext,
    uniforms: Map<string, WebGLUniformLocation | null>,
    params: Record<string, unknown>
  ): void {
    const rgbLoc = uniforms.get('u_rgbSplit')
    if (rgbLoc) gl.uniform1f(rgbLoc, (params.rgbSplit as number) || 0.5)
    
    const scanLoc = uniforms.get('u_scanlineIntensity')
    if (scanLoc) gl.uniform1f(scanLoc, (params.scanlineIntensity as number) || 0.3)
    
    const blockLoc = uniforms.get('u_blockGlitch')
    if (blockLoc) gl.uniform1i(blockLoc, params.blockGlitch ? 1 : 0)
  }

  private setRadialBlurUniforms(
    gl: WebGLRenderingContext,
    uniforms: Map<string, WebGLUniformLocation | null>,
    params: Record<string, unknown>
  ): void {
    const centerLoc = uniforms.get('u_center')
    if (centerLoc) {
      gl.uniform2f(
        centerLoc,
        (params.centerX as number) || 0.5,
        (params.centerY as number) || 0.5
      )
    }
    
    const samplesLoc = uniforms.get('u_samples')
    if (samplesLoc) gl.uniform1i(samplesLoc, (params.samples as number) || 16)
  }

  private setChromaticUniforms(
    gl: WebGLRenderingContext,
    uniforms: Map<string, WebGLUniformLocation | null>,
    params: Record<string, unknown>
  ): void {
    const angleLoc = uniforms.get('u_angle')
    if (angleLoc) gl.uniform1f(angleLoc, (params.angle as number) || 0)
  }

  private setPixelateUniforms(
    gl: WebGLRenderingContext,
    uniforms: Map<string, WebGLUniformLocation | null>,
    params: Record<string, unknown>
  ): void {
    const sizeLoc = uniforms.get('u_pixelSize')
    if (sizeLoc) gl.uniform1f(sizeLoc, (params.pixelSize as number) || 10)
  }

  private setFilmGrainUniforms(
    gl: WebGLRenderingContext,
    uniforms: Map<string, WebGLUniformLocation | null>,
    params: Record<string, unknown>
  ): void {
    const grainLoc = uniforms.get('u_grainIntensity')
    if (grainLoc) gl.uniform1f(grainLoc, (params.grainIntensity as number) || 0.3)
    
    const scratchLoc = uniforms.get('u_scratchIntensity')
    if (scratchLoc) gl.uniform1f(scratchLoc, (params.scratchIntensity as number) || 0.2)
    
    const flickerLoc = uniforms.get('u_flickerIntensity')
    if (flickerLoc) gl.uniform1f(flickerLoc, (params.flickerIntensity as number) || 0.1)
    
    const sepiaLoc = uniforms.get('u_sepiaAmount')
    if (sepiaLoc) gl.uniform1f(sepiaLoc, (params.sepiaAmount as number) || 0.5)
  }

  private setVignetteUniforms(
    gl: WebGLRenderingContext,
    uniforms: Map<string, WebGLUniformLocation | null>,
    params: Record<string, unknown>
  ): void {
    const radiusLoc = uniforms.get('u_radius')
    if (radiusLoc) gl.uniform1f(radiusLoc, (params.radius as number) || 0.8)
    
    const softnessLoc = uniforms.get('u_softness')
    if (softnessLoc) gl.uniform1f(softnessLoc, (params.softness as number) || 0.5)
  }

  private setSplitScreenUniforms(
    gl: WebGLRenderingContext,
    uniforms: Map<string, WebGLUniformLocation | null>,
    params: Record<string, unknown>
  ): void {
    const countLoc = uniforms.get('u_splitCount')
    if (countLoc) gl.uniform1i(countLoc, (params.splitCount as number) || 2)
    
    const dirLoc = uniforms.get('u_direction')
    if (dirLoc) {
      const dir = params.direction as string
      const dirValue = dir === 'horizontal' ? 0 : dir === 'vertical' ? 1 : 2
      gl.uniform1i(dirLoc, dirValue)
    }
    
    const gapLoc = uniforms.get('u_gap')
    if (gapLoc) gl.uniform1f(gapLoc, (params.gap as number) || 0)
  }

  // ==================== 公共方法 ====================

  /**
   * 应用特效链到输入纹理
   * @param inputTexture 输入纹理
   * @param effects 特效列表（按 order 排序）
   * @param timeInClip 片段内时间
   * @param globalTime 全局时间
   * @returns 是否需要渲染到默认帧缓冲
   */
  applyEffects(
    inputTexture: WebGLTexture,
    effects: VideoEffect[],
    timeInClip: number,
    globalTime: number
  ): boolean {
    const gl = this.gl
    const context = this.renderContext
    if (!gl || !context || effects.length === 0) return false
    
    // 过滤启用且在时间范围内的特效
    const activeEffects = effects
      .filter(e => e.enabled && this.isEffectActive(e, timeInClip))
      .sort((a, b) => a.order - b.order)
    
    if (activeEffects.length === 0) return false
    
    let currentTexture = inputTexture
    this.currentFBIndex = 0
    
    // [修复] 如果输入纹理就是当前帧缓冲的纹理，需要切换到另一个帧缓冲，避免读写冲突
    if (this.frameTextures.length > 0 && currentTexture === this.frameTextures[this.currentFBIndex]) {
      this.currentFBIndex = 1 - this.currentFBIndex
    }
    
    for (let i = 0; i < activeEffects.length; i++) {
      const effect = activeEffects[i]
      const isLast = i === activeEffects.length - 1
      
      // 获取程序
      const compiled = this.getOrCreateProgram(effect.type)
      if (!compiled) continue
      
      // 计算特效强度（考虑入场/出场动画）
      const intensity = getEffectIntensity(effect, timeInClip) * 
        ((effect.params.intensity as number) ?? 1)
      
      // 设置渲染目标
      if (!isLast) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[this.currentFBIndex])
        gl.viewport(0, 0, this.width, this.height)
      } else {
        // 最后一个特效直接渲染到屏幕
        gl.bindFramebuffer(gl.FRAMEBUFFER, null)
        // [关键] 设置视口为实际画布尺寸
        const canvas = context.canvas
        gl.viewport(0, 0, canvas.width, canvas.height)
      }
      
      // 使用程序
      gl.useProgram(compiled.program)
      
      // 绑定输入纹理
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, currentTexture)
      
      // 设置 uniform
      this.setEffectUniforms(compiled, effect, intensity, globalTime)
      
      // 绑定缓冲区 (使用内部静态 Buffer)
      if (this.geometryBuffer) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.geometryBuffer)
        gl.enableVertexAttribArray(compiled.attributes.position)
        gl.vertexAttribPointer(compiled.attributes.position, 2, gl.FLOAT, false, 0, 0)
      }
      
      if (this.uvBuffer) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer)
        gl.enableVertexAttribArray(compiled.attributes.texCoord)
        gl.vertexAttribPointer(compiled.attributes.texCoord, 2, gl.FLOAT, false, 0, 0)
      }
      
      // [修复] 使用 TRIANGLES 模式绘制 6 个顶点（与 WebGLRenderer 保持一致）
      gl.drawArrays(gl.TRIANGLES, 0, 6)
      
      // 交换帧缓冲
      if (!isLast) {
        currentTexture = this.frameTextures[this.currentFBIndex]
        this.currentFBIndex = 1 - this.currentFBIndex
      }
    }
    
    // [关键修复] 恢复 GL 状态，防止污染后续渲染
    // 这是专业级 NLE 软件必须的"状态沙箱"逻辑
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, null)
    gl.disable(gl.BLEND)
    gl.useProgram(null) // 强制后续渲染重新设置 Program
    
    return true
  }

  /**
   * 检查特效是否在当前时间激活
   */
  private isEffectActive(effect: VideoEffect, timeInClip: number): boolean {
    return timeInClip >= effect.startTime && 
           timeInClip <= effect.startTime + effect.duration
  }

  /**
   * 更新画布尺寸
   */
  updateSize(width: number, height: number): void {
    if (width === this.width && height === this.height) return
    
    this.width = width
    this.height = height
    
    // 重新创建帧缓冲
    this.destroyFramebuffers()
    this.initFramebuffers()
  }

  /**
   * 销毁帧缓冲
   */
  private destroyFramebuffers(): void {
    const gl = this.gl
    if (!gl) return
    
    for (const fb of this.framebuffers) {
      gl.deleteFramebuffer(fb)
    }
    for (const tex of this.frameTextures) {
      gl.deleteTexture(tex)
    }
    
    this.framebuffers = []
    this.frameTextures = []
  }

  /**
   * 获取内部帧缓冲 (用于预渲染)
   */
  getFramebuffer(index: number): WebGLFramebuffer | null {
    return this.framebuffers[index] || null
  }

  /**
   * 获取内部纹理 (用于预渲染)
   */
  getTexture(index: number): WebGLTexture | null {
    return this.frameTextures[index] || null
  }

  /**
   * 销毁所有资源
   */
  destroy(): void {
    const gl = this.gl
    if (!gl) return
    
    // 销毁帧缓冲
    this.destroyFramebuffers()
    
    // 销毁几何缓冲
    if (this.geometryBuffer) gl.deleteBuffer(this.geometryBuffer)
    if (this.uvBuffer) gl.deleteBuffer(this.uvBuffer)
    this.geometryBuffer = null
    this.uvBuffer = null
    
    // 销毁程序
    for (const compiled of this.programCache.values()) {
      gl.deleteProgram(compiled.program)
    }
    this.programCache.clear()
    
    this.gl = null
    this.renderContext = null
  }
}

// 单例导出
export const effectManager = new EffectManager()
