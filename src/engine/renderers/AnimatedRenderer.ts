/**
 * AnimatedRenderer - 动画变换渲染器
 * 
 * 用于支持关键帧动画变换：
 * - 4x4 变换矩阵应用（位置、缩放、旋转）
 * - 透明度动画
 * - 滤镜参数动态更新
 * 
 * @module renderers/AnimatedRenderer
 */

import type { FilterParams } from '@/types'
import { WebGLContext } from './WebGLContext'
import { SHADER_PROGRAM_IDS } from '../shaders/CoreShaders'

/**
 * 动画渲染器
 */
export class AnimatedRenderer {
  private context: WebGLContext
  private texture: WebGLTexture | null = null

  /** 默认滤镜参数 */
  private filterParams: FilterParams = {
    brightness: 0,
    contrast: 0,
    saturation: 0,
    hue: 0,
    blur: 0
  }

  constructor(context: WebGLContext) {
    this.context = context
    this.init()
  }

  /**
   * 初始化纹理
   */
  private init(): void {
    this.texture = this.context.createTexture()
    if (this.texture) {
      this.context.setupTextureParams(this.texture)
    }
  }

  /**
   * 设置滤镜参数
   */
  setFilter(params: Partial<FilterParams>): void {
    this.filterParams = { ...this.filterParams, ...params }
  }

  /**
   * 获取滤镜参数
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
  }

  /**
   * 渲染带动画变换的视频帧
   * 
   * @param source 视频源
   * @param transformMatrix 4x4 变换矩阵（由 AnimationEngine.createTransformMatrix 生成）
   * @param opacity 透明度（0-1）
   * @param cropMode 裁剪模式
   */
  render(
    source: TexImageSource,
    transformMatrix: Float32Array,
    opacity: number = 1,
    cropMode: 'cover' | 'contain' | 'fill' = 'contain'
  ): void {
    const gl = this.context.getGL()
    const programInfo = this.context.getProgram(SHADER_PROGRAM_IDS.ANIMATED)

    if (!gl || !programInfo || !this.texture) return

    // 状态重置
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.useProgram(programInfo.program)
    gl.activeTexture(gl.TEXTURE0)
    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.CULL_FACE)

    // 启用混合（支持透明度）
    this.context.enableBlend()

    // 获取源尺寸
    const { width: sourceWidth, height: sourceHeight } = this.getSourceSize(source)
    const { width: canvasWidth, height: canvasHeight } = this.context.getSize()

    // 计算顶点位置（考虑 cropMode）
    const positions = this.calculatePositions(
      sourceWidth || canvasWidth,
      sourceHeight || canvasHeight,
      canvasWidth,
      canvasHeight,
      cropMode
    )

    // 绑定顶点缓冲
    const positionBuffer = this.context.getPositionBuffer()
    const texCoordBuffer = this.context.getTexCoordBuffer()

    if (positionBuffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
      gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW)
      gl.enableVertexAttribArray(programInfo.attributes.a_position)
      gl.vertexAttribPointer(programInfo.attributes.a_position, 2, gl.FLOAT, false, 0, 0)
    }

    if (texCoordBuffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer)
      gl.bufferData(gl.ARRAY_BUFFER, this.context.standardTexCoords, gl.DYNAMIC_DRAW)
      gl.enableVertexAttribArray(programInfo.attributes.a_texCoord)
      gl.vertexAttribPointer(programInfo.attributes.a_texCoord, 2, gl.FLOAT, false, 0, 0)
    }

    // 上传纹理
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
    this.setTextureParams(gl)

    // 设置 Uniforms
    gl.uniform1i(programInfo.uniforms.u_texture, 0)
    gl.uniformMatrix4fv(programInfo.uniforms.u_transform, false, transformMatrix)
    gl.uniform2f(programInfo.uniforms.u_resolution, canvasWidth, canvasHeight)
    gl.uniform1f(programInfo.uniforms.u_opacity, opacity)

    // 滤镜参数
    gl.uniform1f(programInfo.uniforms.u_brightness, this.filterParams.brightness)
    gl.uniform1f(programInfo.uniforms.u_contrast, 1 + this.filterParams.contrast)
    gl.uniform1f(programInfo.uniforms.u_saturation, 1 + this.filterParams.saturation)
    gl.uniform1f(programInfo.uniforms.u_hue, this.filterParams.hue)

    // 渲染
    gl.viewport(0, 0, canvasWidth, canvasHeight)
    gl.clearColor(0, 0, 0, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.drawArrays(gl.TRIANGLES, 0, 6)

    // 恢复状态
    this.context.disableBlend()
  }

  /**
   * 根据 cropMode 计算顶点位置
   */
  private calculatePositions(
    sourceWidth: number,
    sourceHeight: number,
    canvasWidth: number,
    canvasHeight: number,
    cropMode: 'cover' | 'contain' | 'fill'
  ): Float32Array {
    const positions = new Float32Array(12)
    const sourceAspect = sourceWidth / sourceHeight
    const canvasAspect = canvasWidth / canvasHeight

    if (cropMode === 'contain') {
      // Contain 模式：保持源比例，可能有黑边
      let scaleX = 1, scaleY = 1

      if (sourceAspect > canvasAspect) {
        scaleY = canvasAspect / sourceAspect
      } else {
        scaleX = sourceAspect / canvasAspect
      }

      positions[0] = -scaleX; positions[1] = -scaleY
      positions[2] = scaleX;  positions[3] = -scaleY
      positions[4] = -scaleX; positions[5] = scaleY
      positions[6] = -scaleX; positions[7] = scaleY
      positions[8] = scaleX;  positions[9] = -scaleY
      positions[10] = scaleX; positions[11] = scaleY
    } else {
      // Cover/Fill 模式：使用全屏 Quad
      positions.set(this.context.fullscreenQuad)
    }

    return positions
  }

  /**
   * 获取图像源尺寸
   */
  private getSourceSize(source: TexImageSource): { width: number; height: number } {
    if (source instanceof HTMLVideoElement) {
      return { width: source.videoWidth, height: source.videoHeight }
    } else if (source instanceof HTMLImageElement) {
      return { width: source.naturalWidth, height: source.naturalHeight }
    } else if (source instanceof HTMLCanvasElement) {
      return { width: source.width, height: source.height }
    }
    return { width: 0, height: 0 }
  }

  /**
   * 设置纹理参数
   */
  private setTextureParams(gl: WebGLRenderingContext): void {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  }

  /**
   * 销毁资源
   */
  destroy(): void {
    const gl = this.context.getGL()
    if (gl && this.texture) {
      gl.deleteTexture(this.texture)
    }
    this.texture = null
  }
}
