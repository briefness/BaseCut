/**
 * LRU 缓存实现
 * 
 * 使用 Map 的插入顺序特性实现 O(1) 的 LRU 缓存
 * 适用于图片、缩略图等资源缓存
 * 
 * @module utils/LRUCache
 */

export class LRUCache<K, V> {
  private cache: Map<K, V>
  private readonly maxSize: number

  /**
   * @param maxSize 缓存最大容量
   */
  constructor(maxSize: number) {
    this.cache = new Map()
    this.maxSize = maxSize
  }

  /**
   * 获取缓存值，同时更新访问顺序
   */
  get(key: K): V | undefined {
    if (!this.cache.has(key)) {
      return undefined
    }
    
    // 移动到末尾（最近访问）
    const value = this.cache.get(key)!
    this.cache.delete(key)
    this.cache.set(key, value)
    
    return value
  }

  /**
   * 设置缓存值
   */
  set(key: K, value: V): void {
    // 如果已存在，先删除（更新顺序）
    if (this.cache.has(key)) {
      this.cache.delete(key)
    }
    
    // 超出容量，删除最旧的（第一个）
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey)
      }
    }
    
    this.cache.set(key, value)
  }

  /**
   * 检查是否存在
   */
  has(key: K): boolean {
    return this.cache.has(key)
  }

  /**
   * 删除缓存项
   */
  delete(key: K): boolean {
    return this.cache.delete(key)
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * 获取当前大小
   */
  get size(): number {
    return this.cache.size
  }

  /**
   * 遍历所有值
   */
  values(): IterableIterator<V> {
    return this.cache.values()
  }

  /**
   * 遍历所有键值对
   */
  entries(): IterableIterator<[K, V]> {
    return this.cache.entries()
  }
}
