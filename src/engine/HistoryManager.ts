/**
 * 历史管理器（HistoryManager）
 * 
 * 核心撤销/重做引擎，使用命令模式管理操作历史
 * 支持命令合并、批量分组、深度限制等高级功能
 * 
 * 性能优化：
 * - 命令合并：连续相同操作只保留最终状态
 * - 惰性执行：统一由 Manager 调度命令执行
 * - 栈深度限制：防止内存无限增长
 */

import type { 
  HistoryCommand, 
  HistoryConfig, 
  HistoryState,
  CommandGroup 
} from './HistoryTypes'
import { 
  DEFAULT_HISTORY_CONFIG, 
  generateCommandId,
  CommandTypes 
} from './HistoryTypes'

/**
 * 命令组实现类
 * 将多个命令作为一个整体
 */
class CommandGroupImpl implements CommandGroup {
  readonly id: string
  readonly type = CommandTypes.GROUP
  readonly timestamp: number
  readonly commands: HistoryCommand[] = []
  
  constructor(public readonly description: string) {
    this.id = generateCommandId()
    this.timestamp = Date.now()
  }
  
  /**
   * 执行分组内所有命令（正序）
   */
  execute(): void {
    for (const cmd of this.commands) {
      cmd.execute()
    }
  }
  
  /**
   * 撤销分组内所有命令（逆序）
   */
  undo(): void {
    for (let i = this.commands.length - 1; i >= 0; i--) {
      this.commands[i].undo()
    }
  }
  
  /**
   * 添加命令到分组
   */
  addCommand(command: HistoryCommand): void {
    this.commands.push(command)
  }
}

/**
 * 历史管理器
 * 
 * 使用双栈结构管理撤销/重做操作
 */
export class HistoryManager {
  // ==================== 私有属性 ====================
  
  /** 撤销栈 */
  private undoStack: HistoryCommand[] = []
  
  /** 重做栈 */
  private redoStack: HistoryCommand[] = []
  
  /** 配置 */
  private config: HistoryConfig
  
  /** 当前命令分组（分组模式时使用） */
  private currentGroup: CommandGroupImpl | null = null
  
  /** 状态变更回调 */
  private stateChangeCallback: ((state: HistoryState) => void) | null = null
  
  // ==================== 构造函数 ====================
  
  constructor(config: Partial<HistoryConfig> = {}) {
    this.config = { ...DEFAULT_HISTORY_CONFIG, ...config }
  }
  
  // ==================== 公共方法 ====================
  
  /**
   * 执行命令并记录到历史
   * @param command 待执行的命令
   * @param skipExecution 是否跳过执行（命令已在外部执行）
   */
  execute(command: HistoryCommand, skipExecution = false): void {
    // 分组模式：收集命令到当前分组
    if (this.currentGroup) {
      if (!skipExecution) {
        command.execute()
      }
      this.currentGroup.addCommand(command)
      this.log(`[分组中] 添加命令: ${command.description}`)
      return
    }
    
    // 尝试与上一个命令合并
    if (this.tryMergeWithLast(command)) {
      this.log(`合并命令: ${command.description}`)
      this.notifyStateChange()
      return
    }
    
    // 执行命令
    if (!skipExecution) {
      command.execute()
    }
    
    // 添加到撤销栈
    this.undoStack.push(command)
    
    // 清空重做栈（新操作后之前的重做历史失效）
    this.redoStack = []
    
    // 检查栈深度限制
    this.trimStack()
    
    this.log(`执行命令: ${command.description}`)
    this.notifyStateChange()
  }
  
  /**
   * 撤销最后一个操作
   * @returns 是否成功撤销
   */
  undo(): boolean {
    if (!this.canUndo) {
      this.log('无法撤销：撤销栈为空')
      return false
    }
    
    const command = this.undoStack.pop()!
    command.undo()
    this.redoStack.push(command)
    
    this.log(`撤销: ${command.description}`)
    this.notifyStateChange()
    return true
  }
  
  /**
   * 重做最后一个被撤销的操作
   * @returns 是否成功重做
   */
  redo(): boolean {
    if (!this.canRedo) {
      this.log('无法重做：重做栈为空')
      return false
    }
    
    const command = this.redoStack.pop()!
    command.execute()
    this.undoStack.push(command)
    
    this.log(`重做: ${command.description}`)
    this.notifyStateChange()
    return true
  }
  
  /**
   * 开始命令分组
   * 分组内的所有命令将作为一个整体进行撤销/重做
   * @param description 分组描述
   */
  beginGroup(description: string): void {
    if (!this.config.enableGrouping) {
      this.log('命令分组功能未启用')
      return
    }
    
    if (this.currentGroup) {
      this.log('警告：已在分组模式中，嵌套分组将被忽略')
      return
    }
    
    this.currentGroup = new CommandGroupImpl(description)
    this.log(`开始分组: ${description}`)
  }
  
  /**
   * 结束命令分组
   * 将分组作为一个整体添加到历史
   */
  endGroup(): void {
    if (!this.currentGroup) {
      this.log('警告：不在分组模式中')
      return
    }
    
    const group = this.currentGroup
    this.currentGroup = null
    
    // 只有包含命令的分组才添加到历史
    if (group.commands.length > 0) {
      this.undoStack.push(group)
      this.redoStack = []
      this.trimStack()
      this.log(`结束分组: ${group.description}（包含 ${group.commands.length} 个命令）`)
    } else {
      this.log(`分组为空，已丢弃: ${group.description}`)
    }
    
    this.notifyStateChange()
  }
  
  /**
   * 取消当前分组（丢弃分组内的所有命令）
   */
  cancelGroup(): void {
    if (!this.currentGroup) {
      return
    }
    
    // 撤销分组内已执行的命令
    for (let i = this.currentGroup.commands.length - 1; i >= 0; i--) {
      this.currentGroup.commands[i].undo()
    }
    
    this.log(`取消分组: ${this.currentGroup.description}`)
    this.currentGroup = null
    this.notifyStateChange()
  }
  
  /**
   * 清空所有历史
   */
  clear(): void {
    this.undoStack = []
    this.redoStack = []
    this.currentGroup = null
    this.log('清空历史')
    this.notifyStateChange()
  }
  
  /**
   * 设置状态变更回调
   */
  onStateChange(callback: (state: HistoryState) => void): void {
    this.stateChangeCallback = callback
  }
  
  // ==================== 状态查询 ====================
  
  /** 是否可以撤销 */
  get canUndo(): boolean {
    return this.undoStack.length > 0
  }
  
  /** 是否可以重做 */
  get canRedo(): boolean {
    return this.redoStack.length > 0
  }
  
  /** 撤销操作的描述 */
  get undoDescription(): string | null {
    return this.undoStack.length > 0 
      ? this.undoStack[this.undoStack.length - 1].description 
      : null
  }
  
  /** 重做操作的描述 */
  get redoDescription(): string | null {
    return this.redoStack.length > 0 
      ? this.redoStack[this.redoStack.length - 1].description 
      : null
  }
  
  /** 撤销栈深度 */
  get undoStackSize(): number {
    return this.undoStack.length
  }
  
  /** 重做栈深度 */
  get redoStackSize(): number {
    return this.redoStack.length
  }
  
  /** 是否处于分组模式 */
  get isGrouping(): boolean {
    return this.currentGroup !== null
  }
  
  /** 获取当前状态 */
  getState(): HistoryState {
    return {
      canUndo: this.canUndo,
      canRedo: this.canRedo,
      undoDescription: this.undoDescription,
      redoDescription: this.redoDescription,
      undoStackSize: this.undoStackSize,
      redoStackSize: this.redoStackSize,
      isGrouping: this.isGrouping
    }
  }
  
  // ==================== 私有方法 ====================
  
  /**
   * 尝试将新命令与最后一个命令合并
   */
  private tryMergeWithLast(command: HistoryCommand): boolean {
    if (this.undoStack.length === 0) {
      return false
    }
    
    const lastCommand = this.undoStack[this.undoStack.length - 1]
    
    // 检查时间窗口
    const timeDiff = command.timestamp - lastCommand.timestamp
    if (timeDiff > this.config.mergeWindowMs) {
      return false
    }
    
    // 检查是否支持合并
    if (!lastCommand.canMergeWith || !lastCommand.mergeWith) {
      return false
    }
    
    if (!lastCommand.canMergeWith(command)) {
      return false
    }
    
    // 执行合并
    const mergedCommand = lastCommand.mergeWith(command)
    this.undoStack[this.undoStack.length - 1] = mergedCommand
    
    // 执行新命令的效果（合并命令已包含最终状态）
    command.execute()
    
    return true
  }
  
  /**
   * 修剪栈以满足深度限制
   */
  private trimStack(): void {
    while (this.undoStack.length > this.config.maxStackSize) {
      this.undoStack.shift()
    }
  }
  
  /**
   * 通知状态变更
   */
  private notifyStateChange(): void {
    if (this.stateChangeCallback) {
      this.stateChangeCallback(this.getState())
    }
  }
  
  /**
   * 调试日志
   */
  private log(message: string): void {
    if (this.config.debug) {
      console.log(`[HistoryManager] ${message}`)
    }
  }
}
