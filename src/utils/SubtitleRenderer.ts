/**
 * SubtitleRenderer - 字幕渲染工具类
 * 负责在 Canvas 上渲染字幕，支持样式、位置和动画
 */

import type { Subtitle, SubtitleStyle, SubtitleAnimation } from '@/types'

export interface RenderContext {
  ctx: CanvasRenderingContext2D
  canvasWidth: number
  canvasHeight: number
  currentTime: number      // 当前播放时间
  clipStartTime: number    // 片段开始时间
  clipDuration: number     // 片段时长
}

class SubtitleRenderer {
  
  /**
   * 渲染字幕
   */
  render(subtitle: Subtitle, context: RenderContext): void {
    const { ctx, canvasWidth, canvasHeight, currentTime, clipStartTime, clipDuration } = context
    const { text, style, position, enterAnimation, exitAnimation } = subtitle
    
    if (!text) return
    
    // 计算动画进度
    const clipProgress = (currentTime - clipStartTime) / clipDuration
    const animationState = this.calculateAnimationState(
      clipProgress,
      clipDuration,
      enterAnimation,
      exitAnimation
    )
    
    // 如果完全透明则跳过渲染
    if (animationState.opacity <= 0) return
    
    ctx.save()
    
    // 应用全局透明度（动画）
    ctx.globalAlpha = animationState.opacity
    
    // 计算位置
    const x = (position.x / 100) * canvasWidth
    const y = (position.y / 100) * canvasHeight
    
    // 应用位置偏移（动画）
    const offsetX = animationState.offsetX * canvasWidth
    const offsetY = animationState.offsetY * canvasHeight
    const scale = animationState.scale
    
    ctx.translate(x + offsetX, y + offsetY)
    ctx.scale(scale, scale)
    
    // 设置文字样式
    this.applyTextStyle(ctx, style)
    
    // 处理多行文本
    const lines = text.split('\n')
    const lineHeight = style.fontSize * style.lineHeight
    const totalHeight = lines.length * lineHeight
    
    // 计算起始 Y 位置（垂直居中）
    let startY = -totalHeight / 2 + lineHeight / 2
    
    // 测量最大行宽（用于背景）
    const maxWidth = Math.max(...lines.map(line => ctx.measureText(line).width))
    
    // 绘制背景
    if (style.backgroundEnabled && style.backgroundColor) {
      this.drawBackground(ctx, style, maxWidth, totalHeight)
    }
    
    // 绘制每一行
    for (const line of lines) {
      // 打字机效果处理
      const displayText = this.applyTypewriterEffect(
        line, 
        animationState.typewriterProgress
      )
      
      // 绘制描边
      if (style.strokeEnabled && style.strokeColor && style.strokeWidth) {
        ctx.strokeStyle = style.strokeColor
        ctx.lineWidth = style.strokeWidth * 2
        ctx.lineJoin = 'round'
        ctx.strokeText(displayText, 0, startY)
      }
      
      // 绘制文字
      ctx.fillStyle = style.color
      ctx.fillText(displayText, 0, startY)
      
      startY += lineHeight
    }
    
    ctx.restore()
  }
  
  /**
   * 应用文字样式
   */
  private applyTextStyle(ctx: CanvasRenderingContext2D, style: SubtitleStyle): void {
    // 字体
    const fontStyle = style.fontStyle === 'italic' ? 'italic ' : ''
    const fontWeight = style.fontWeight === 'bold' ? 'bold ' : ''
    ctx.font = `${fontStyle}${fontWeight}${style.fontSize}px ${style.fontFamily}`
    
    // 对齐
    ctx.textAlign = style.textAlign
    ctx.textBaseline = 'middle'
    
    // 阴影
    if (style.shadowEnabled && style.shadowColor) {
      ctx.shadowColor = style.shadowColor
      ctx.shadowOffsetX = style.shadowOffsetX ?? 2
      ctx.shadowOffsetY = style.shadowOffsetY ?? 2
      ctx.shadowBlur = style.shadowBlur ?? 4
    }
  }
  
  /**
   * 绘制背景
   */
  private drawBackground(
    ctx: CanvasRenderingContext2D, 
    style: SubtitleStyle, 
    textWidth: number,
    textHeight: number
  ): void {
    const padding = style.backgroundPadding ?? 8
    const radius = style.backgroundRadius ?? 4
    
    const bgWidth = textWidth + padding * 2
    const bgHeight = textHeight + padding * 2
    
    // 根据对齐计算背景位置
    let bgX: number
    switch (style.textAlign) {
      case 'left':
        bgX = -padding
        break
      case 'right':
        bgX = -textWidth - padding
        break
      default:
        bgX = -bgWidth / 2
    }
    const bgY = -bgHeight / 2
    
    // 临时禁用阴影（背景不需要阴影）
    ctx.save()
    ctx.shadowColor = 'transparent'
    
    // 绘制圆角矩形
    ctx.fillStyle = style.backgroundColor!
    ctx.beginPath()
    ctx.roundRect(bgX, bgY, bgWidth, bgHeight, radius)
    ctx.fill()
    
    ctx.restore()
  }
  
  /**
   * 计算动画状态
   */
  private calculateAnimationState(
    progress: number,
    duration: number,
    enterAnim?: SubtitleAnimation,
    exitAnim?: SubtitleAnimation
  ): {
    opacity: number
    offsetX: number
    offsetY: number
    scale: number
    typewriterProgress: number
  } {
    let opacity = 1
    let offsetX = 0
    let offsetY = 0
    let scale = 1
    let typewriterProgress = 1
    
    // 入场动画
    if (enterAnim && enterAnim.type !== 'none' && enterAnim.duration > 0) {
      const enterProgress = Math.min(1, (progress * duration) / enterAnim.duration)
      
      switch (enterAnim.type) {
        case 'fadeIn':
          opacity = this.easeOutCubic(enterProgress)
          break
        case 'slideUp':
          opacity = this.easeOutCubic(enterProgress)
          offsetY = (1 - this.easeOutCubic(enterProgress)) * 0.1
          break
        case 'slideDown':
          opacity = this.easeOutCubic(enterProgress)
          offsetY = (this.easeOutCubic(enterProgress) - 1) * 0.1
          break
        case 'scale':
          opacity = this.easeOutCubic(enterProgress)
          scale = 0.5 + 0.5 * this.easeOutBack(enterProgress)
          break
        case 'bounce':
          opacity = this.easeOutCubic(enterProgress)
          scale = this.easeOutBounce(enterProgress)
          break
        case 'typewriter':
          typewriterProgress = enterProgress
          break
      }
    }
    
    // 出场动画
    if (exitAnim && exitAnim.type !== 'none' && exitAnim.duration > 0) {
      const exitStart = 1 - (exitAnim.duration / duration)
      if (progress > exitStart) {
        const exitProgress = (progress - exitStart) / (1 - exitStart)
        
        switch (exitAnim.type) {
          case 'fadeOut':
            opacity *= 1 - this.easeInCubic(exitProgress)
            break
          case 'slideUp':
            opacity *= 1 - this.easeInCubic(exitProgress)
            offsetY = -this.easeInCubic(exitProgress) * 0.1
            break
          case 'slideDown':
            opacity *= 1 - this.easeInCubic(exitProgress)
            offsetY = this.easeInCubic(exitProgress) * 0.1
            break
          case 'scale':
            opacity *= 1 - this.easeInCubic(exitProgress)
            scale = 1 - 0.5 * this.easeInCubic(exitProgress)
            break
        }
      }
    }
    
    return { opacity, offsetX, offsetY, scale, typewriterProgress }
  }
  
  /**
   * 打字机效果
   */
  private applyTypewriterEffect(text: string, progress: number): string {
    if (progress >= 1) return text
    const charCount = Math.floor(text.length * progress)
    return text.substring(0, charCount)
  }
  
  // 缓动函数
  private easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3)
  }
  
  private easeInCubic(t: number): number {
    return t * t * t
  }
  
  private easeOutBack(t: number): number {
    const c1 = 1.70158
    const c3 = c1 + 1
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
  }
  
  private easeOutBounce(t: number): number {
    const n1 = 7.5625
    const d1 = 2.75
    if (t < 1 / d1) {
      return n1 * t * t
    } else if (t < 2 / d1) {
      return n1 * (t -= 1.5 / d1) * t + 0.75
    } else if (t < 2.5 / d1) {
      return n1 * (t -= 2.25 / d1) * t + 0.9375
    } else {
      return n1 * (t -= 2.625 / d1) * t + 0.984375
    }
  }
}

// 导出单例
export const subtitleRenderer = new SubtitleRenderer()
export { SubtitleRenderer }
