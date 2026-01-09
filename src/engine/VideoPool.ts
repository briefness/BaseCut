/**
 * VideoPool - 视频元素预加载池
 * 使用 Map + 双向链表实现 O(1) LRU 淘汰
 * 
 * 新增预热功能：
 * - 基于时间轴上下文智能预加载
 * - 优先级队列
 * - 预热取消机制
 */

// LRU 双向链表节点
interface LRUNode {
  key: string              // 素材 ID
  video: PooledVideo       // 视频数据
  prev: LRUNode | null     // 前驱指针
  next: LRUNode | null     // 后继指针
}

export interface PooledVideo {
  element: HTMLVideoElement   // Video DOM 元素
  materialId: string          // 素材 ID
  url: string                 // 视频 URL
  lastUsed: number            // 最后使用时间戳
  ready: boolean              // 是否加载完成
}

/**
 * 预热上下文：描述当前播放状态和时间轴信息
 */
export interface WarmupContext {
  /** 当前播放时间（秒）*/
  currentTime: number
  /** 是否正在播放 */
  isPlaying: boolean
  /** 当前活跃片段列表 */
  activeClips: Array<{
    id: string
    materialId: string
    startTime: number
    duration: number
  }>
  /** 所有视频片段（用于预测）*/
  allVideoClips: Array<{
    id: string
    materialId: string
    startTime: number
    duration: number
    url?: string
  }>
  /** 转场相邻片段（高优先级）*/
  transitionClips?: Array<{
    materialId: string
    url: string
  }>
}

/**
 * 预热项：描述需要预加载的视频
 */
interface WarmupItem {
  materialId: string
  url: string
  priority: number  // 优先级：数字越小优先级越高
}

export class VideoPool {
  private pool: Map<string, LRUNode> = new Map()  // materialId -> 节点
  private maxSize: number
  private pendingLoads: Map<string, Promise<HTMLVideoElement>> = new Map()  // 加载中的请求
  
  // 双向链表哨兵节点，简化边界处理
  private head: LRUNode  // 头部 = 最近使用
  private tail: LRUNode  // 尾部 = 最久未使用
  
  // ==================== 预热相关 ====================
  
  /** 预热任务队列 */
  private warmupQueue: WarmupItem[] = []
  
  /** 正在执行的预热任务 */
  private warmupInProgress = false
  
  /** 预热取消令牌 */
  private warmupCancelToken = 0
  
  /** 向前预看时间（秒）*/
  private lookAheadSeconds = 3
  
  /** 向后预看时间（秒）- 支持回退 */
  private lookBehindSeconds = 1
  
  constructor(maxSize: number = 6) {
    this.maxSize = maxSize
    
    // 初始化哨兵节点：HEAD <-> TAIL
    this.head = { key: '__HEAD__', video: null as unknown as PooledVideo, prev: null, next: null }
    this.tail = { key: '__TAIL__', video: null as unknown as PooledVideo, prev: null, next: null }
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
  
  // ==================== 预热 API ====================
  
  /**
   * 执行预热
   * 基于时间轴上下文智能预加载视频
   * 
   * @param context 预热上下文（当前播放状态和时间轴信息）
   */
  async warmup(context: WarmupContext): Promise<void> {
    // 生成优先级列表
    const priorityList = this.generateWarmupPriorityList(context)
    
    if (priorityList.length === 0) {
      return
    }
    
    // 更新预热队列
    this.warmupQueue = priorityList
    
    // 如果已有预热任务在执行，仅更新队列即可
    if (this.warmupInProgress) {
      return
    }
    
    // 开始执行预热
    await this.processWarmupQueue()
  }
  
  /**
   * 取消进行中的预热任务
   */
  cancelWarmup(): void {
    this.warmupCancelToken++
    this.warmupQueue = []
    this.warmupInProgress = false
    console.log('[VideoPool] 预热已取消')
  }
  
  /**
   * 设置预热参数
   */
  setWarmupConfig(config: { lookAheadSeconds?: number; lookBehindSeconds?: number }): void {
    if (config.lookAheadSeconds !== undefined) {
      this.lookAheadSeconds = config.lookAheadSeconds
    }
    if (config.lookBehindSeconds !== undefined) {
      this.lookBehindSeconds = config.lookBehindSeconds
    }
  }
  
  /**
   * 生成预热优先级列表
   * 
   * 优先级策略（参考剪映）：
   * 1. 转场相邻片段 - 最高优先级
   * 2. 即将播放的片段 - 按距离当前时间排序
   * 3. 刚过去的片段 - 支持回退
   */
  private generateWarmupPriorityList(context: WarmupContext): WarmupItem[] {
    const items: WarmupItem[] = []
    const addedIds = new Set<string>()
    
    // 过滤出已在池中或正在加载的素材
    const shouldSkip = (materialId: string): boolean => {
      return this.has(materialId) || 
             this.pendingLoads.has(materialId) ||
             addedIds.has(materialId)
    }
    
    const { currentTime, allVideoClips, transitionClips } = context
    
    // 1. 转场相邻片段 - 最高优先级
    if (transitionClips) {
      for (const clip of transitionClips) {
        if (!shouldSkip(clip.materialId)) {
          items.push({
            materialId: clip.materialId,
            url: clip.url,
            priority: 0  // 最高优先级
          })
          addedIds.add(clip.materialId)
        }
      }
    }
    
    // 2. 计算即将播放和刚过去的片段
    const lookAheadEnd = currentTime + this.lookAheadSeconds
    const lookBehindStart = currentTime - this.lookBehindSeconds
    
    // 收集在预看范围内的片段
    const clipsInRange: Array<{
      clip: typeof allVideoClips[0]
      distance: number
      isFuture: boolean
    }> = []
    
    for (const clip of allVideoClips) {
      if (shouldSkip(clip.materialId)) continue
      if (!clip.url) continue
      
      const clipEnd = clip.startTime + clip.duration
      
      // 检查是否在预看范围内
      const isInFuture = clip.startTime >= currentTime && clip.startTime <= lookAheadEnd
      const isInPast = clipEnd >= lookBehindStart && clipEnd <= currentTime
      const isCurrentlyPlaying = clip.startTime <= currentTime && clipEnd >= currentTime
      
      if (isInFuture || isInPast || isCurrentlyPlaying) {
        // 计算距离（用于排序）
        let distance: number
        if (isCurrentlyPlaying) {
          distance = 0
        } else if (isInFuture) {
          distance = clip.startTime - currentTime
        } else {
          distance = currentTime - clipEnd
        }
        
        clipsInRange.push({
          clip,
          distance,
          isFuture: isInFuture || isCurrentlyPlaying
        })
      }
    }
    
    // 排序：优先未来的片段，按距离升序
    clipsInRange.sort((a, b) => {
      // 未来的片段优先于过去的
      if (a.isFuture !== b.isFuture) {
        return a.isFuture ? -1 : 1
      }
      // 同类按距离排序
      return a.distance - b.distance
    })
    
    // 添加到优先级列表
    for (let i = 0; i < clipsInRange.length; i++) {
      const { clip } = clipsInRange[i]
      if (!addedIds.has(clip.materialId)) {
        items.push({
          materialId: clip.materialId,
          url: clip.url!,
          priority: i + 1  // 优先级从 1 开始
        })
        addedIds.add(clip.materialId)
      }
    }
    
    return items
  }
  
  /**
   * 处理预热队列
   */
  private async processWarmupQueue(): Promise<void> {
    if (this.warmupQueue.length === 0) {
      this.warmupInProgress = false
      return
    }
    
    this.warmupInProgress = true
    const cancelToken = this.warmupCancelToken
    
    // 按优先级排序
    this.warmupQueue.sort((a, b) => a.priority - b.priority)
    
    while (this.warmupQueue.length > 0) {
      // 检查是否被取消
      if (cancelToken !== this.warmupCancelToken) {
        break
      }
      
      const item = this.warmupQueue.shift()!
      
      // 跳过已加载的
      if (this.has(item.materialId)) {
        continue
      }
      
      try {
        console.log(`[VideoPool] 预热加载: ${item.materialId} (优先级: ${item.priority})`)
        await this.preload(item.materialId, item.url)
      } catch (error) {
        console.warn(`[VideoPool] 预热失败: ${item.materialId}`, error)
      }
      
      // 让出主线程，避免阻塞渲染
      await new Promise(resolve => setTimeout(resolve, 0))
    }
    
    this.warmupInProgress = false
  }
  
  /**
   * 获取预热状态
   */
  getWarmupStatus(): {
    isWarmingUp: boolean
    queueSize: number
    loadedCount: number
    poolSize: number
  } {
    return {
      isWarmingUp: this.warmupInProgress,
      queueSize: this.warmupQueue.length,
      loadedCount: this.getLoadedIds().length,
      poolSize: this.pool.size
    }
  }
  
  /**
   * 销毁池
   */
  destroy(): void {
    this.cancelWarmup()
    
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

