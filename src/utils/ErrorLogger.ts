/**
 * 统一错误日志服务
 * 
 * 提供错误收集、分类和上报功能
 * 替代静默的 catch(() => {})
 * 
 * @module utils/ErrorLogger
 */

export enum ErrorLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

export enum ErrorCategory {
  MEDIA = 'media',       // 媒体播放相关
  RENDER = 'render',     // 渲染相关
  STORAGE = 'storage',   // 存储相关
  NETWORK = 'network',   // 网络相关
  EXPORT = 'export',     // 导出相关
  GENERAL = 'general'    // 通用
}

interface LogEntry {
  timestamp: number
  level: ErrorLevel
  category: ErrorCategory
  message: string
  context?: Record<string, unknown>
  stack?: string
}

class ErrorLoggerService {
  private logs: LogEntry[] = []
  private readonly maxLogs = 100
  private onErrorCallbacks: ((entry: LogEntry) => void)[] = []

  /**
   * 记录日志
   */
  private log(
    level: ErrorLevel,
    category: ErrorCategory,
    message: string,
    context?: Record<string, unknown>,
    error?: Error
  ): void {
    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      category,
      message,
      context,
      stack: error?.stack
    }

    // 添加到内存日志（FIFO）
    this.logs.push(entry)
    if (this.logs.length > this.maxLogs) {
      this.logs.shift()
    }

    // 控制台输出
    const prefix = `[${category.toUpperCase()}]`
    switch (level) {
      case ErrorLevel.DEBUG:
        console.debug(prefix, message, context)
        break
      case ErrorLevel.INFO:
        console.info(prefix, message, context)
        break
      case ErrorLevel.WARN:
        console.warn(prefix, message, context)
        break
      case ErrorLevel.ERROR:
        console.error(prefix, message, context, error)
        break
    }

    // 触发回调
    this.onErrorCallbacks.forEach(cb => cb(entry))
  }

  /**
   * 媒体播放错误（静默模式，不阻断流程）
   */
  mediaPlayError(message: string, context?: Record<string, unknown>): void {
    this.log(ErrorLevel.DEBUG, ErrorCategory.MEDIA, message, context)
  }

  /**
   * 渲染警告
   */
  renderWarn(message: string, context?: Record<string, unknown>): void {
    this.log(ErrorLevel.WARN, ErrorCategory.RENDER, message, context)
  }

  /**
   * 存储错误
   */
  storageError(message: string, error?: Error, context?: Record<string, unknown>): void {
    this.log(ErrorLevel.ERROR, ErrorCategory.STORAGE, message, context, error)
  }

  /**
   * 导出错误
   */
  exportError(message: string, error?: Error, context?: Record<string, unknown>): void {
    this.log(ErrorLevel.ERROR, ErrorCategory.EXPORT, message, context, error)
  }

  /**
   * 通用错误
   */
  error(message: string, error?: Error, context?: Record<string, unknown>): void {
    this.log(ErrorLevel.ERROR, ErrorCategory.GENERAL, message, context, error)
  }

  /**
   * 通用警告
   */
  warn(message: string, context?: Record<string, unknown>): void {
    this.log(ErrorLevel.WARN, ErrorCategory.GENERAL, message, context)
  }

  /**
   * 通用信息
   */
  info(message: string, context?: Record<string, unknown>): void {
    this.log(ErrorLevel.INFO, ErrorCategory.GENERAL, message, context)
  }

  /**
   * 获取所有日志
   */
  getLogs(): LogEntry[] {
    return [...this.logs]
  }

  /**
   * 获取指定级别的日志
   */
  getLogsByLevel(level: ErrorLevel): LogEntry[] {
    return this.logs.filter(log => log.level === level)
  }

  /**
   * 清空日志
   */
  clear(): void {
    this.logs = []
  }

  /**
   * 注册错误回调
   */
  onError(callback: (entry: LogEntry) => void): () => void {
    this.onErrorCallbacks.push(callback)
    return () => {
      const index = this.onErrorCallbacks.indexOf(callback)
      if (index > -1) {
        this.onErrorCallbacks.splice(index, 1)
      }
    }
  }

  /**
   * 创建静默错误处理器（用于 .catch()）
   */
  silentCatch(category: ErrorCategory, context?: string): (error: unknown) => void {
    return (error: unknown) => {
      this.log(
        ErrorLevel.DEBUG,
        category,
        context || 'Silent error',
        { error: String(error) }
      )
    }
  }
}

// 单例导出
export const errorLogger = new ErrorLoggerService()

// 便捷函数导出
export const silentMediaCatch = errorLogger.silentCatch(ErrorCategory.MEDIA, 'Media playback')
export const silentRenderCatch = errorLogger.silentCatch(ErrorCategory.RENDER, 'Render operation')
