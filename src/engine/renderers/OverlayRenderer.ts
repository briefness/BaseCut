/**
 * OverlayRenderer - 叠加层渲染器
 * 
 * 负责渲染贴纸、画中画等叠加元素：
 * - 独立顶点缓冲区（避免污染主渲染管线）
 * - 支持位置、缩放（含非等比）、旋转变换
 * - Alpha 混合
 * 
 * @module renderers/OverlayRenderer
 */

import type { Transform } from '@/types'
import { WebGLContext } from './WebGLContext'
import { SHADER_PROGRAM_IDS } from '../shaders/CoreShaders'

/**
 * 叠加层渲染器
 */
export class OverlayRenderer {
  private context: WebGLContext
  private texture: WebGLTexture | null = null

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
   * 渲染叠加层
   * 
   * @param source 图像源（图片、视频帧等）
   * @param transform 变换参数
   */
  render(source: CanvasImageSource, transform: Transform): void {
    const gl = this.context.getGL()
    const programInfo = this.context.getProgram(SHADER_PROGRAM_IDS.OVERLAY)

    if (!gl || !programInfo || !this.texture) return

    // 使用叠加层程序
    gl.useProgram(programInfo.program)

    // 绑定并上传纹理
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    this.setTextureParams(gl)

    // 上传纹理数据
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source as TexImageSource)
    } catch (e) {
      console.warn('[OverlayRenderer] 纹理上传失败:', e)
      return
    }

    // 开启混合
    this.context.enableBlend()

    // 获取源尺寸
    const { width: sourceWidth, height: sourceHeight } = this.getSourceSize(source)
    if (sourceWidth === 0 || sourceHeight === 0) return

    // 设置 Uniforms
    const { width: canvasWidth, height: canvasHeight } = this.context.getSize()

    gl.uniform1i(programInfo.uniforms.u_texture, 0)
    gl.uniform2f(programInfo.uniforms.u_resolution, canvasWidth, canvasHeight)
    gl.uniform2f(programInfo.uniforms.u_imgSize, sourceWidth, sourceHeight)
    gl.uniform2f(programInfo.uniforms.u_translation, transform.x / 100, transform.y / 100)

    // 支持非等比缩放：优先使用 scaleX/scaleY，否则回退到 scale
    const scaleX = transform.scaleX ?? transform.scale
    const scaleY = transform.scaleY ?? transform.scale
    gl.uniform2f(programInfo.uniforms.u_scale, scaleX, scaleY)
    gl.uniform1f(programInfo.uniforms.u_rotation, transform.rotation * Math.PI / 180)
    gl.uniform1f(programInfo.uniforms.u_opacity, transform.opacity)

    // 绑定叠加层专用缓冲区
    const overlayPosBuffer = this.context.getOverlayPositionBuffer()
    const overlayTexBuffer = this.context.getOverlayTexCoordBuffer()

    if (overlayPosBuffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, overlayPosBuffer)
      gl.enableVertexAttribArray(programInfo.attributes.a_position)
      gl.vertexAttribPointer(programInfo.attributes.a_position, 2, gl.FLOAT, false, 0, 0)
    }

    if (overlayTexBuffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, overlayTexBuffer)
      gl.enableVertexAttribArray(programInfo.attributes.a_texCoord)
      gl.vertexAttribPointer(programInfo.attributes.a_texCoord, 2, gl.FLOAT, false, 0, 0)
    }

    // 绘制（4 顶点 TRIANGLE_STRIP）
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

    // 恢复状态
    this.context.disableBlend()
  }

  /**
   * 获取图像源尺寸
   */
  private getSourceSize(source: CanvasImageSource): { width: number; height: number } {
    if (source instanceof HTMLVideoElement) {
      return { width: source.videoWidth, height: source.videoHeight }
    } else if (source instanceof HTMLImageElement) {
      return { width: source.naturalWidth, height: source.naturalHeight }
    } else if (typeof VideoFrame !== 'undefined' && source instanceof VideoFrame) {
      return { width: source.displayWidth, height: source.displayHeight }
    } else {
      // HTMLCanvasElement, OffscreenCanvas, ImageBitmap 等
      const anySource = source as { width?: number; height?: number }
      return {
        width: anySource.width ?? 0,
        height: anySource.height ?? 0
      }
    }
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
