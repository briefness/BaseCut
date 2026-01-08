/**
 * VideoPool - 视频元素预加载池
 * 性能优化版本：使用 Map + 双向链表实现 O(1) LRU 淘汰
 * 
 * 设计原理：
 * - Map 保证 O(1) 查找
 * - 双向链表保证 O(1) 移动到头部、O(1) 删除尾部
 * - 头部是最近使用的，尾部是最久未使用的
 */

// ==================== LRU 双向链表节点 ====================

interface LRUNode {
  key: string
  video: PooledVideo
  prev: LRUNode | null
  next: LRUNode | null
}

export interface PooledVideo {
  element: HTMLVideoElement
  materialId: string
  url: string
  lastUsed: number  // 保留用于调试
  ready: boolean
}

export class VideoPool {
  private pool: Map<string, LRUNode> = new Map()
  private maxSize: number
  private pendingLoads: Map<string, Promise<HTMLVideoElement>> = new Map()
  
  // ==================== 双向链表头尾哨兵节点 ====================
  // 使用哨兵节点简化边界处理，避免空指针判断
  private head: LRUNode  // 最近使用
  private tail: LRUNode  // 最久未使用
  
  constructor(maxSize: number = 6) {
    this.maxSize = maxSize
    
    // 初始化哨兵节点
    this.head = { key: '__HEAD__', video: null as any, prev: null, next: null }
    this.tail = { key: '__TAIL__', video: null as any, prev: null, next: null }
    this.head.next = this.tail
    this.tail.prev = this.head
  }
  
  // ==================== 链表操作：O(1) 时间复杂度 ====================
  
  /**
   * 将节点移动到链表头部（最近使用）
   * 时间复杂度: O(1)
   */
  private moveToHead(node: LRUNode): void {
    // 先从当前位置移除
    this.removeNode(node)
    // 添加到头部
    this.addToHead(node)
  }
  
  /**
   * 添加节点到链表头部
   * 时间复杂度: O(1)
   */
  private addToHead(node: LRUNode): void {
    node.prev = this.head
    node.next = this.head.next
    this.head.next!.prev = node
    this.head.next = node
  }
  
  /**
   * 从链表中移除节点
   * 时间复杂度: O(1)
   */
  private removeNode(node: LRUNode): void {
    if (node.prev) node.prev.next = node.next
    if (node.next) node.next.prev = node.prev
  }
  
  /**
   * 获取并移除链表尾部节点（最久未使用）
   * 时间复杂度: O(1)
   */
  private removeTail(): LRUNode | null {
    const node = this.tail.prev
    if (node === this.head) return null  // 链表为空
    this.removeNode(node!)
    return node
  }
  
  // ==================== 公共 API ====================
  
  /**
   * 预加载视频
   */
  async preload(materialId: string, url: string): Promise<HTMLVideoElement> {
    // 已在池中 - O(1) 查找，O(1) 移动到头部
    const node = this.pool.get(materialId)
    if (node) {
      this.moveToHead(node)
      node.video.lastUsed = Date.now()
      if (node.video.ready) {
        return node.video.element
      }
    }
    
    // 正在加载中
    const pending = this.pendingLoads.get(materialId)
    if (pending) {
      return pending
    }
    
    // 开始新的加载
    const loadPromise = this.loadVideo(materialId, url)
    this.pendingLoads.set(materialId, loadPromise)
    
    try {
      const video = await loadPromise
      return video
    } finally {
      this.pendingLoads.delete(materialId)
    }
  }
  
  /**
   * 加载视频
   */
  private async loadVideo(materialId: string, url: string): Promise<HTMLVideoElement> {
    // 检查池容量，必要时淘汰 - O(1) 淘汰
    if (this.pool.size >= this.maxSize) {
      this.evictLRU()
    }
    
    const video = document.createElement('video')
    video.playsInline = true
    video.crossOrigin = 'anonymous'
    video.preload = 'auto'
    video.muted = true  // 初始静音，避免自动播放限制
    
    const pooledVideo: PooledVideo = {
      element: video,
      materialId,
      url,
      lastUsed: Date.now(),
      ready: false
    }
    
    // 创建链表节点并添加到头部 - O(1)
    const node: LRUNode = {
      key: materialId,
      video: pooledVideo,
      prev: null,
      next: null
    }
    this.pool.set(materialId, node)
    this.addToHead(node)
    
    return new Promise((resolve, reject) => {
      const onCanPlay = () => {
        pooledVideo.ready = true
        video.removeEventListener('canplay', onCanPlay)
        video.removeEventListener('error', onError)
        resolve(video)
      }
      
      const onError = () => {
        video.removeEventListener('canplay', onCanPlay)
        video.removeEventListener('error', onError)
        // 从链表和 Map 中移除
        this.removeNode(node)
        this.pool.delete(materialId)
        reject(new Error(`视频加载失败: ${materialId}`))
      }
      
      video.addEventListener('canplay', onCanPlay)
      video.addEventListener('error', onError)
      
      video.src = url
      video.load()
    })
  }
  
  /**
   * 获取已加载的视频（同步）- O(1)
   */
  get(materialId: string): HTMLVideoElement | null {
    const node = this.pool.get(materialId)
    if (node && node.video.ready) {
      // 移动到头部表示最近使用
      this.moveToHead(node)
      node.video.lastUsed = Date.now()
      return node.video.element
    }
    return null
  }
  
  /**
   * 检查视频是否已加载 - O(1)
   */
  has(materialId: string): boolean {
    const node = this.pool.get(materialId)
    return node?.video.ready ?? false
  }
  
  /**
   * 淘汰最久未使用的视频 - O(1)
   * 性能优化：从 O(n) 遍历降低到 O(1) 直接取尾部
   */
  private evictLRU(): void {
    const node = this.removeTail()
    if (node) {
      const video = node.video
      video.element.pause()
      video.element.src = ''
      video.element.load()
      this.pool.delete(node.key)
      console.log(`[VideoPool] 淘汰视频: ${node.key}`)
    }
  }
  
  /**
   * 释放指定视频之外的所有视频
   */
  evict(keepIds: string[]): void {
    const keepSet = new Set(keepIds)
    
    // 需要收集要删除的节点，避免遍历时修改
    const toRemove: LRUNode[] = []
    for (const [id, node] of this.pool) {
      if (!keepSet.has(id)) {
        toRemove.push(node)
      }
    }
    
    for (const node of toRemove) {
      node.video.element.pause()
      node.video.element.src = ''
      node.video.element.load()
      this.removeNode(node)
      this.pool.delete(node.key)
    }
  }
  
  /**
   * 获取池中所有视频 ID
   */
  getLoadedIds(): string[] {
    return Array.from(this.pool.keys()).filter(id => this.pool.get(id)?.video.ready)
  }
  
  /**
   * 销毁池
   */
  destroy(): void {
    for (const [, node] of this.pool) {
      node.video.element.pause()
      node.video.element.src = ''
      node.video.element.load()
    }
    this.pool.clear()
    this.pendingLoads.clear()
    
    // 重置链表
    this.head.next = this.tail
    this.tail.prev = this.head
  }
}

// 导出单例（6 个视频预加载池）
export const videoPool = new VideoPool(6)
