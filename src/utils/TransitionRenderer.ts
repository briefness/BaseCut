/**
 * 转场渲染器
 * 使用 Canvas 2D 实现各种视频转场效果
 */
import type { TransitionType } from '@/types'

export interface TransitionRenderContext {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  progress: number  // 0-1，转场进度
}

/**
 * 转场渲染器类
 * 支持多种转场效果的渲染
 */
export class TransitionRenderer {
  /**
   * 渲染转场效果
   * @param ctx Canvas 2D 上下文
   * @param frameA 前一帧（HTMLVideoElement 或 HTMLImageElement）
   * @param frameB 后一帧
   * @param progress 转场进度 0-1
   * @param type 转场类型
   * @param width 画布宽度
   * @param height 画布高度
   */
  render(
    ctx: CanvasRenderingContext2D,
    frameA: CanvasImageSource,
    frameB: CanvasImageSource,
    progress: number,
    type: TransitionType,
    width: number,
    height: number
  ): void {
    // 确保 progress 在 0-1 范围内
    progress = Math.max(0, Math.min(1, progress))

    switch (type) {
      case 'fade':
        this.renderFade(ctx, frameA, frameB, progress, width, height)
        break
      case 'dissolve':
        this.renderDissolve(ctx, frameA, frameB, progress, width, height)
        break
      case 'slideLeft':
        this.renderSlide(ctx, frameA, frameB, progress, width, height, 'left')
        break
      case 'slideRight':
        this.renderSlide(ctx, frameA, frameB, progress, width, height, 'right')
        break
      case 'slideUp':
        this.renderSlide(ctx, frameA, frameB, progress, width, height, 'up')
        break
      case 'slideDown':
        this.renderSlide(ctx, frameA, frameB, progress, width, height, 'down')
        break
      case 'zoom':
        this.renderZoom(ctx, frameA, frameB, progress, width, height)
        break
      case 'blur':
        this.renderBlur(ctx, frameA, frameB, progress, width, height)
        break
      case 'wipe':
        this.renderWipe(ctx, frameA, frameB, progress, width, height)
        break
      default:
        // 默认使用淡入淡出
        this.renderFade(ctx, frameA, frameB, progress, width, height)
    }
  }

  /**
   * 淡入淡出效果
   */
  private renderFade(
    ctx: CanvasRenderingContext2D,
    frameA: CanvasImageSource,
    frameB: CanvasImageSource,
    progress: number,
    width: number,
    height: number
  ): void {
    // 先绘制 frameA
    ctx.globalAlpha = 1 - progress
    ctx.drawImage(frameA, 0, 0, width, height)
    
    // 再绘制 frameB
    ctx.globalAlpha = progress
    ctx.drawImage(frameB, 0, 0, width, height)
    
    // 恢复透明度
    ctx.globalAlpha = 1
  }

  /**
   * 溶解效果（使用噪点混合）
   */
  private renderDissolve(
    ctx: CanvasRenderingContext2D,
    frameA: CanvasImageSource,
    frameB: CanvasImageSource,
    progress: number,
    width: number,
    height: number
  ): void {
    // 简化版溶解，使用淡入淡出模拟
    // 可以后续使用 WebGL 实现真正的噪点溶解
    const easeProgress = this.easeInOutCubic(progress)
    this.renderFade(ctx, frameA, frameB, easeProgress, width, height)
  }

  /**
   * 滑动效果
   */
  private renderSlide(
    ctx: CanvasRenderingContext2D,
    frameA: CanvasImageSource,
    frameB: CanvasImageSource,
    progress: number,
    width: number,
    height: number,
    direction: 'left' | 'right' | 'up' | 'down'
  ): void {
    const easeProgress = this.easeOutCubic(progress)
    
    let offsetAX = 0, offsetAY = 0
    let offsetBX = 0, offsetBY = 0
    
    switch (direction) {
      case 'left':
        offsetAX = -width * easeProgress
        offsetBX = width * (1 - easeProgress)
        break
      case 'right':
        offsetAX = width * easeProgress
        offsetBX = -width * (1 - easeProgress)
        break
      case 'up':
        offsetAY = -height * easeProgress
        offsetBY = height * (1 - easeProgress)
        break
      case 'down':
        offsetAY = height * easeProgress
        offsetBY = -height * (1 - easeProgress)
        break
    }
    
    // 绘制 frameA（正在离开）
    ctx.drawImage(frameA, offsetAX, offsetAY, width, height)
    
    // 绘制 frameB（正在进入）
    ctx.drawImage(frameB, offsetBX, offsetBY, width, height)
  }

  /**
   * 缩放效果
   */
  private renderZoom(
    ctx: CanvasRenderingContext2D,
    frameA: CanvasImageSource,
    frameB: CanvasImageSource,
    progress: number,
    width: number,
    height: number
  ): void {
    const easeProgress = this.easeInOutCubic(progress)
    
    // frameA 缩小并淡出
    const scaleA = 1 + easeProgress * 0.2  // 放大到 1.2x
    const alphaA = 1 - easeProgress
    
    ctx.save()
    ctx.globalAlpha = alphaA
    ctx.translate(width / 2, height / 2)
    ctx.scale(scaleA, scaleA)
    ctx.translate(-width / 2, -height / 2)
    ctx.drawImage(frameA, 0, 0, width, height)
    ctx.restore()
    
    // frameB 从放大状态缩小到正常
    const scaleB = 1.2 - easeProgress * 0.2
    const alphaB = easeProgress
    
    ctx.save()
    ctx.globalAlpha = alphaB
    ctx.translate(width / 2, height / 2)
    ctx.scale(scaleB, scaleB)
    ctx.translate(-width / 2, -height / 2)
    ctx.drawImage(frameB, 0, 0, width, height)
    ctx.restore()
    
    ctx.globalAlpha = 1
  }

  /**
   * 模糊过渡效果
   */
  private renderBlur(
    ctx: CanvasRenderingContext2D,
    frameA: CanvasImageSource,
    frameB: CanvasImageSource,
    progress: number,
    width: number,
    height: number
  ): void {
    const easeProgress = this.easeInOutCubic(progress)
    
    // 计算模糊程度（中间最模糊）
    const blurAmount = Math.sin(easeProgress * Math.PI) * 10
    
    ctx.save()
    ctx.filter = `blur(${blurAmount}px)`
    
    // 混合两帧
    ctx.globalAlpha = 1 - easeProgress
    ctx.drawImage(frameA, 0, 0, width, height)
    
    ctx.globalAlpha = easeProgress
    ctx.drawImage(frameB, 0, 0, width, height)
    
    ctx.restore()
    ctx.globalAlpha = 1
  }

  /**
   * 擦除效果
   */
  private renderWipe(
    ctx: CanvasRenderingContext2D,
    frameA: CanvasImageSource,
    frameB: CanvasImageSource,
    progress: number,
    width: number,
    height: number
  ): void {
    const easeProgress = this.easeOutCubic(progress)
    const wipeX = width * easeProgress
    
    // 先绘制完整的 frameA
    ctx.drawImage(frameA, 0, 0, width, height)
    
    // 使用裁剪区域绘制 frameB
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, wipeX, height)
    ctx.clip()
    ctx.drawImage(frameB, 0, 0, width, height)
    ctx.restore()
  }

  // ==================== 缓动函数 ====================
  
  private easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3)
  }
  
  private easeInOutCubic(t: number): number {
    return t < 0.5 
      ? 4 * t * t * t 
      : 1 - Math.pow(-2 * t + 2, 3) / 2
  }
}

// 单例导出
export const transitionRenderer = new TransitionRenderer()
