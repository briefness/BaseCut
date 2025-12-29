/**
 * IndexedDB 管理器
 * 封装 IndexedDB 操作，用于素材和项目数据持久化
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { DBMaterial, DBProject } from '@/types'

interface BaseCutDB extends DBSchema {
  materials: {
    key: string
    value: DBMaterial
    indexes: {
      'by-type': string
      'by-date': number
    }
  }
  projects: {
    key: string
    value: DBProject
    indexes: {
      'by-date': number
    }
  }
}

const DB_NAME = 'BaseCut'
const DB_VERSION = 1

class IndexedDBManager {
  private db: IDBPDatabase<BaseCutDB> | null = null
  private initPromise: Promise<void> | null = null

  /**
   * 初始化数据库
   */
  async init(): Promise<void> {
    if (this.db) return
    
    if (this.initPromise) {
      await this.initPromise
      return
    }

    this.initPromise = this.doInit()
    await this.initPromise
  }

  private async doInit(): Promise<void> {
    this.db = await openDB<BaseCutDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // 素材存储
        if (!db.objectStoreNames.contains('materials')) {
          const materialStore = db.createObjectStore('materials', { keyPath: 'id' })
          materialStore.createIndex('by-type', 'type')
          materialStore.createIndex('by-date', 'createdAt')
        }

        // 项目存储
        if (!db.objectStoreNames.contains('projects')) {
          const projectStore = db.createObjectStore('projects', { keyPath: 'id' })
          projectStore.createIndex('by-date', 'updatedAt')
        }
      }
    })

    console.log('[IndexedDB] 初始化完成')
  }

  // ==================== 素材操作 ====================

  /**
   * 添加素材
   */
  async addMaterial(material: DBMaterial): Promise<void> {
    await this.init()
    await this.db!.put('materials', material)
  }

  /**
   * 获取素材
   */
  async getMaterial(id: string): Promise<DBMaterial | undefined> {
    await this.init()
    return this.db!.get('materials', id)
  }

  /**
   * 获取所有素材
   */
  async getAllMaterials(): Promise<DBMaterial[]> {
    await this.init()
    return this.db!.getAll('materials')
  }

  /**
   * 按类型获取素材
   */
  async getMaterialsByType(type: string): Promise<DBMaterial[]> {
    await this.init()
    return this.db!.getAllFromIndex('materials', 'by-type', type)
  }

  /**
   * 删除素材
   */
  async deleteMaterial(id: string): Promise<void> {
    await this.init()
    await this.db!.delete('materials', id)
  }

  /**
   * 清空所有素材
   */
  async clearMaterials(): Promise<void> {
    await this.init()
    await this.db!.clear('materials')
  }

  // ==================== 项目操作 ====================

  /**
   * 保存项目
   */
  async saveProject(project: DBProject): Promise<void> {
    await this.init()
    await this.db!.put('projects', project)
  }

  /**
   * 获取项目
   */
  async getProject(id: string): Promise<DBProject | undefined> {
    await this.init()
    return this.db!.get('projects', id)
  }

  /**
   * 获取所有项目
   */
  async getAllProjects(): Promise<DBProject[]> {
    await this.init()
    return this.db!.getAll('projects')
  }

  /**
   * 删除项目
   */
  async deleteProject(id: string): Promise<void> {
    await this.init()
    await this.db!.delete('projects', id)
  }

  /**
   * 获取最近项目
   */
  async getRecentProjects(limit = 10): Promise<DBProject[]> {
    await this.init()
    const all = await this.db!.getAllFromIndex('projects', 'by-date')
    return all.reverse().slice(0, limit)
  }

  // ==================== 工具方法 ====================

  /**
   * 获取存储使用量
   */
  async getStorageUsage(): Promise<{ materials: number; projects: number }> {
    await this.init()
    
    const materials = await this.db!.count('materials')
    const projects = await this.db!.count('projects')

    return { materials, projects }
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
      this.initPromise = null
    }
  }
}

// 单例导出
export const dbManager = new IndexedDBManager()
