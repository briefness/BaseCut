/**
 * 项目设置命令
 * 
 * 实现项目设置相关的可撤销命令：
 * - 设置画布尺寸
 * - 设置帧率
 * - 重命名项目
 */

import type { HistoryCommand } from '../HistoryTypes'
import { generateCommandId, CommandTypes } from '../HistoryTypes'

// ==================== 命令基类 ====================

abstract class ProjectCommand implements HistoryCommand {
  readonly id: string
  readonly timestamp: number
  
  constructor(
    readonly type: string,
    readonly description: string
  ) {
    this.id = generateCommandId()
    this.timestamp = Date.now()
  }
  
  abstract execute(): void
  abstract undo(): void
}

// ==================== 项目命令 ====================

/**
 * 设置画布尺寸命令
 */
export class SetCanvasSizeCommand extends ProjectCommand {
  private getStore: () => ReturnType<typeof import('@/stores/project').useProjectStore>
  
  /** 旧尺寸 */
  private oldWidth: number | null = null
  private oldHeight: number | null = null
  
  constructor(
    getStore: () => ReturnType<typeof import('@/stores/project').useProjectStore>,
    private newWidth: number,
    private newHeight: number
  ) {
    super(CommandTypes.SET_CANVAS_SIZE, '修改画布尺寸')
    this.getStore = getStore
  }
  
  execute(): void {
    const store = this.getStore()
    
    // 保存旧值
    if (this.oldWidth === null) {
      this.oldWidth = store.canvasWidth
      this.oldHeight = store.canvasHeight
    }
    
    store._setCanvasSizeDirect(this.newWidth, this.newHeight)
  }
  
  undo(): void {
    if (this.oldWidth !== null && this.oldHeight !== null) {
      const store = this.getStore()
      store._setCanvasSizeDirect(this.oldWidth, this.oldHeight)
    }
  }
}

/**
 * 设置帧率命令
 */
export class SetFrameRateCommand extends ProjectCommand {
  private getStore: () => ReturnType<typeof import('@/stores/project').useProjectStore>
  
  /** 旧帧率 */
  private oldFrameRate: number | null = null
  
  constructor(
    getStore: () => ReturnType<typeof import('@/stores/project').useProjectStore>,
    private newFrameRate: number
  ) {
    super(CommandTypes.SET_FRAME_RATE, '修改帧率')
    this.getStore = getStore
  }
  
  execute(): void {
    const store = this.getStore()
    
    if (this.oldFrameRate === null) {
      this.oldFrameRate = store.frameRate
    }
    
    store._setFrameRateDirect(this.newFrameRate)
  }
  
  undo(): void {
    if (this.oldFrameRate !== null) {
      const store = this.getStore()
      store._setFrameRateDirect(this.oldFrameRate)
    }
  }
}

/**
 * 重命名项目命令
 */
export class RenameProjectCommand extends ProjectCommand {
  private getStore: () => ReturnType<typeof import('@/stores/project').useProjectStore>
  
  /** 旧名称 */
  private oldName: string | null = null
  
  constructor(
    getStore: () => ReturnType<typeof import('@/stores/project').useProjectStore>,
    private newName: string
  ) {
    super(CommandTypes.RENAME_PROJECT, '重命名项目')
    this.getStore = getStore
  }
  
  execute(): void {
    const store = this.getStore()
    
    if (this.oldName === null) {
      this.oldName = store.projectName
    }
    
    store._renameDirect(this.newName)
  }
  
  undo(): void {
    if (this.oldName !== null) {
      const store = this.getStore()
      store._renameDirect(this.oldName)
    }
  }
}
