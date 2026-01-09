/**
 * TransitionRenderer - 转场效果渲染器
 * 
 * 使用 GPU 加速实现多种转场效果：
 * - fade: 淡入淡出
 * - dissolve: 溶解
 * - slide: 滑动（左/右/上/下）
 * - wipe: 擦除
 * - zoom: 缩放
 * 
 * @module renderers/TransitionRenderer
 */

import { WebGLContext } from './WebGLContext'
import { SHADER_PROGRAM_IDS, TRANSITION_TYPE_MAP } from '../shaders/CoreShaders'

/**
 * 转场渲染器
 * 负责双纹理混合的 GPU 加速转场渲染
 */
export class TransitionRenderer {
  private context: WebGLContext
  private texture: WebGLTexture | null = null
  private textureB: WebGLTexture | null = null

  constructor(context: WebGLContext) {
    this.context = context
    this.init()
  }

  /**
   * 初始化纹理
   */
  private init(): void {
    this.texture = this.context.createTexture()
    this.textureB = this.context.createTexture()

    if (this.texture) {
      this.context.setupTextureParams(this.texture)
    }
    if (this.textureB) {
      this.context.setupTextureParams(this.textureB)
    }
  }

  /**
   * 渲染转场效果
   * 
   * @param sourceA 第一个视频帧（转出）
   * @param sourceB 第二个视频帧（转入）
   * @param progress 转场进度 (0-1)
   * @param transitionType 转场类型
   */
  render(
    sourceA: TexImageSource,
    sourceB: TexImageSource,
    progress: number,
    transitionType: string
  ): void {
    const gl = this.context.getGL()
    const programInfo = this.context.getProgram(SHADER_PROGRAM_IDS.TRANSITION)
    
    if (!gl || !programInfo || !this.texture || !this.textureB) return

    // 使用转场程序
    gl.useProgram(programInfo.program)

    // 绑定顶点属性
    const positionBuffer = this.context.getPositionBuffer()
    const texCoordBuffer = this.context.getTexCoordBuffer()

    if (positionBuffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
      // 使用全屏 Quad
      gl.bufferData(gl.ARRAY_BUFFER, this.context.fullscreenQuad, gl.DYNAMIC_DRAW)
      gl.enableVertexAttribArray(programInfo.attributes.a_position)
      gl.vertexAttribPointer(programInfo.attributes.a_position, 2, gl.FLOAT, false, 0, 0)
    }

    if (texCoordBuffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer)
      gl.bufferData(gl.ARRAY_BUFFER, this.context.standardTexCoords, gl.DYNAMIC_DRAW)
      gl.enableVertexAttribArray(programInfo.attributes.a_texCoord)
      gl.vertexAttribPointer(programInfo.attributes.a_texCoord, 2, gl.FLOAT, false, 0, 0)
    }

    // 绑定纹理 A（第一个视频帧）
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceA)
    this.setTextureParams(gl)

    // 绑定纹理 B（第二个视频帧）
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.textureB)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceB)
    this.setTextureParams(gl)

    // 设置 uniforms
    gl.uniform1i(programInfo.uniforms.u_textureA, 0)
    gl.uniform1i(programInfo.uniforms.u_textureB, 1)
    gl.uniform1f(programInfo.uniforms.u_progress, progress)

    // 获取转场类型索引
    const typeIndex = TRANSITION_TYPE_MAP[transitionType] ?? 0
    gl.uniform1i(programInfo.uniforms.u_transitionType, typeIndex)

    // 渲染
    const { width, height } = this.context.getSize()
    gl.viewport(0, 0, width, height)
    gl.clearColor(0, 0, 0, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
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
    if (!gl) return

    if (this.texture) gl.deleteTexture(this.texture)
    if (this.textureB) gl.deleteTexture(this.textureB)

    this.texture = null
    this.textureB = null
  }
}
