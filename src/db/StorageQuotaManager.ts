/**
 * 存储配额管理器
 * 
 * 职责：
 * 1. 检测浏览器存储配额
 * 2. 监控使用量
 * 3. 超限时自动清理（LRU 策略）
 */
import { dbManager } from './IndexedDBManager'

// ==================== 类型定义 ====================

export interface StorageInfo {
  usage: number      // 已用（字节）
  quota: number      // 总配额（字节）
  percent: number    // 使用百分比 0-1
  usageFormatted: string   // 格式化的已用空间
  quotaFormatted: string   // 格式化的总配额
}

export interface CleanupResult {
  success: boolean
  freedBytes: number
  deletedCount: number
  deletedIds: string[]
  error?: string
}

export interface QuotaConfig {
  warningThreshold: number   // 警告阈值（默认 0.8）
  criticalThreshold: number  // 临界阈值（默认 0.9）
  targetFreePercent: number  // 清理目标（默认 0.3）
}

// ==================== 工具函数 ====================

/**
 * 格式化字节大小
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// ==================== 存储配额管理器 ====================

export class StorageQuotaManager {
  private config: QuotaConfig = {
    warningThreshold: 0.8,
    criticalThreshold: 0.9,
    targetFreePercent: 0.3
  }

  // 受保护的素材 ID（当前项目正在使用的）
  private protectedIds: Set<string> = new Set()

  constructor(config?: Partial<QuotaConfig>) {
    if (config) {
      this.config = { ...this.config, ...config }
    }
  }

  /**
   * 设置受保护的素材 ID（不会被清理）
   */
  setProtectedIds(ids: string[]): void {
    this.protectedIds = new Set(ids)
  }

  /**
   * 获取当前存储使用情况
   */
  async getStorageInfo(): Promise<StorageInfo> {
    // 使用 Storage API 获取配额信息
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      try {
        const estimate = await navigator.storage.estimate()
        const usage = estimate.usage || 0
        const quota = estimate.quota || 0
        
        return {
          usage,
          quota,
          percent: quota > 0 ? usage / quota : 0,
          usageFormatted: formatBytes(usage),
          quotaFormatted: formatBytes(quota)
        }
      } catch (error) {
        console.warn('[StorageQuota] 无法获取存储信息:', error)
      }
    }

    // 降级方案：返回估算值
    return {
      usage: 0,
      quota: 5 * 1024 * 1024 * 1024, // 假设 5GB
      percent: 0,
      usageFormatted: '未知',
      quotaFormatted: '~5 GB'
    }
  }

  /**
   * 检查是否需要清理
   */
  async needsCleanup(): Promise<boolean> {
    const info = await this.getStorageInfo()
    return info.percent >= this.config.criticalThreshold
  }

  /**
   * 检查是否接近警告阈值
   */
  async isNearWarningThreshold(): Promise<boolean> {
    const info = await this.getStorageInfo()
    return info.percent >= this.config.warningThreshold
  }

  /**
   * 估算添加文件后是否会超限
   */
  async canStore(sizeInBytes: number): Promise<boolean> {
    const info = await this.getStorageInfo()
    const projectedUsage = info.usage + sizeInBytes
    const projectedPercent = projectedUsage / info.quota
    
    return projectedPercent < this.config.criticalThreshold
  }

  /**
   * 执行 LRU 清理
   * 
   * 清理策略：
   * 1. 获取所有素材，按创建时间升序排序（最旧在前）
   * 2. 跳过受保护的素材
   * 3. 删除直到达到目标空闲空间
   */
  async cleanup(): Promise<CleanupResult> {
    const result: CleanupResult = {
      success: false,
      freedBytes: 0,
      deletedCount: 0,
      deletedIds: []
    }

    try {
      const info = await this.getStorageInfo()
      
      // 计算需要释放的字节数
      const targetUsage = info.quota * (1 - this.config.targetFreePercent)
      const bytesToFree = info.usage - targetUsage
      
      if (bytesToFree <= 0) {
        result.success = true
        return result
      }

      console.log(`[StorageQuota] 需要释放 ${formatBytes(bytesToFree)}`)

      // 获取素材列表（按创建时间升序）
      const materials = await dbManager.getMaterialsSortedByDate()
      
      // 过滤掉受保护的素材
      const cleanableMateri = materials.filter(m => !this.protectedIds.has(m.id))
      
      // 计算要删除的素材
      const toDelete: string[] = []
      let freedSoFar = 0
      
      for (const material of cleanableMateri) {
        if (freedSoFar >= bytesToFree) break
        
        toDelete.push(material.id)
        freedSoFar += material.size
      }

      if (toDelete.length === 0) {
        result.error = '没有可清理的素材（所有素材都在使用中）'
        return result
      }

      // 执行批量删除
      await dbManager.deleteMaterialsBatch(toDelete)
      
      result.success = true
      result.freedBytes = freedSoFar
      result.deletedCount = toDelete.length
      result.deletedIds = toDelete

      console.log(`[StorageQuota] 已清理 ${toDelete.length} 个素材，释放 ${formatBytes(freedSoFar)}`)
      
      return result
    } catch (error) {
      result.error = error instanceof Error ? error.message : '清理失败'
      console.error('[StorageQuota] 清理失败:', error)
      return result
    }
  }

  /**
   * 清理特定大小的空间
   */
  async freeSpace(bytesNeeded: number): Promise<CleanupResult> {
    const info = await this.getStorageInfo()
    
    // 临时调整目标，确保释放足够空间
    const requiredFreePercent = (bytesNeeded + info.usage * 0.1) / info.quota
    const originalTarget = this.config.targetFreePercent
    this.config.targetFreePercent = Math.max(requiredFreePercent, originalTarget)
    
    const result = await this.cleanup()
    
    // 恢复配置
    this.config.targetFreePercent = originalTarget
    
    return result
  }

  /**
   * 获取存储状态描述
   */
  async getStatusMessage(): Promise<string> {
    const info = await this.getStorageInfo()
    
    if (info.percent >= this.config.criticalThreshold) {
      return `⚠️ 存储空间严重不足 (${info.usageFormatted} / ${info.quotaFormatted})`
    }
    if (info.percent >= this.config.warningThreshold) {
      return `⚡ 存储空间即将用尽 (${info.usageFormatted} / ${info.quotaFormatted})`
    }
    return `✅ 存储空间充足 (${info.usageFormatted} / ${info.quotaFormatted})`
  }

  /**
   * 设置阈值配置
   */
  setConfig(config: Partial<QuotaConfig>): void {
    this.config = { ...this.config, ...config }
  }
}

// 单例导出
export const storageQuotaManager = new StorageQuotaManager()
