/**
 * Web Worker 管理器
 * 管理后台工作线程池，分发任务
 */
import type { WorkerMessage } from '@/types'

export interface WorkerTask {
  id: string
  type: string
  payload: unknown
  resolve: (result: unknown) => void
  reject: (error: Error) => void
}

export class WorkerManager {
  private workers: Worker[] = []
  private taskQueue: WorkerTask[] = []
  private busyWorkers: Set<Worker> = new Set()
  private taskMap: Map<string, WorkerTask> = new Map()
  private maxWorkers: number
  private workerUrl: string

  constructor(workerUrl: string, maxWorkers?: number) {
    this.workerUrl = workerUrl
    // 默认使用 CPU 核心数的一半
    this.maxWorkers = maxWorkers ?? Math.max(1, Math.floor(navigator.hardwareConcurrency / 2))
  }

  /**
   * 初始化 Worker 池
   */
  async init(): Promise<void> {
    for (let i = 0; i < this.maxWorkers; i++) {
      const worker = new Worker(this.workerUrl, { type: 'module' })
      worker.onmessage = (event) => this.handleMessage(worker, event.data)
      worker.onerror = (error) => this.handleError(worker, error)
      this.workers.push(worker)
    }
    console.log(`[WorkerManager] 初始化 ${this.maxWorkers} 个 Worker`)
  }

  /**
   * 发送任务
   */
  async execute<T = unknown>(type: string, payload: unknown): Promise<T> {
    const id = crypto.randomUUID()
    
    return new Promise((resolve, reject) => {
      const task: WorkerTask = {
        id,
        type,
        payload,
        resolve: resolve as (result: unknown) => void,
        reject
      }
      
      this.taskMap.set(id, task)
      this.taskQueue.push(task)
      this.processQueue()
    })
  }

  /**
   * 处理任务队列
   */
  private processQueue(): void {
    while (this.taskQueue.length > 0) {
      const worker = this.getAvailableWorker()
      if (!worker) break
      
      const task = this.taskQueue.shift()
      if (!task) break
      
      this.busyWorkers.add(worker)
      
      const message: WorkerMessage = {
        type: task.type,
        payload: task.payload,
        id: task.id
      }
      
      worker.postMessage(message)
    }
  }

  /**
   * 获取空闲 Worker
   */
  private getAvailableWorker(): Worker | null {
    for (const worker of this.workers) {
      if (!this.busyWorkers.has(worker)) {
        return worker
      }
    }
    return null
  }

  /**
   * 处理 Worker 消息
   */
  private handleMessage(worker: Worker, data: WorkerMessage): void {
    this.busyWorkers.delete(worker)
    
    if (data.id) {
      const task = this.taskMap.get(data.id)
      if (task) {
        this.taskMap.delete(data.id)
        
        if (data.type === 'error') {
          task.reject(new Error(data.payload as string))
        } else {
          task.resolve(data.payload)
        }
      }
    }
    
    // 继续处理队列
    this.processQueue()
  }

  /**
   * 处理 Worker 错误
   */
  private handleError(worker: Worker, error: ErrorEvent): void {
    console.error('[WorkerManager] Worker 错误:', error)
    this.busyWorkers.delete(worker)
    
    // 尝试重新创建 Worker
    const index = this.workers.indexOf(worker)
    if (index !== -1) {
      worker.terminate()
      const newWorker = new Worker(this.workerUrl, { type: 'module' })
      newWorker.onmessage = (event) => this.handleMessage(newWorker, event.data)
      newWorker.onerror = (err) => this.handleError(newWorker, err)
      this.workers[index] = newWorker
    }
    
    this.processQueue()
  }

  /**
   * 获取当前任务数
   */
  getPendingTaskCount(): number {
    return this.taskQueue.length + this.busyWorkers.size
  }

  /**
   * 获取 Worker 数量
   */
  getWorkerCount(): number {
    return this.workers.length
  }

  /**
   * 销毁所有 Worker
   */
  destroy(): void {
    // 拒绝所有待处理任务
    for (const task of this.taskQueue) {
      task.reject(new Error('Worker Manager 已销毁'))
    }
    for (const task of this.taskMap.values()) {
      task.reject(new Error('Worker Manager 已销毁'))
    }
    
    // 终止所有 Worker
    for (const worker of this.workers) {
      worker.terminate()
    }
    
    this.workers = []
    this.taskQueue = []
    this.busyWorkers.clear()
    this.taskMap.clear()
    
    console.log('[WorkerManager] 已销毁')
  }
}
