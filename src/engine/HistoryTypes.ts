/**
 * 历史记录核心类型定义
 * 
 * 实现命令模式（Command Pattern）的撤销/重做系统
 * 参考剪映等专业工具的实现逻辑
 */

// ==================== 命令接口 ====================

/**
 * 历史命令接口
 * 所有可撤销操作必须实现此接口
 */
export interface HistoryCommand {
  /** 命令唯一标识 */
  readonly id: string
  
  /** 命令类型（用于合并判断和日志） */
  readonly type: string
  
  /** 操作描述（用于 UI 显示，如"添加片段"、"移动轨道"） */
  readonly description: string
  
  /** 命令创建时间戳 */
  readonly timestamp: number
  
  /**
   * 执行命令（也用于重做）
   * 执行后状态应用到应用
   */
  execute(): void
  
  /**
   * 撤销命令
   * 恢复到执行前的状态
   */
  undo(): void
  
  /**
   * 判断是否可以与另一个命令合并
   * 用于优化连续相同操作（如拖拽时的连续位置更新）
   * @param other 待合并的命令
   * @returns 是否可以合并
   */
  canMergeWith?(other: HistoryCommand): boolean
  
  /**
   * 与另一个命令合并，返回合并后的命令
   * @param other 待合并的命令
   * @returns 合并后的新命令
   */
  mergeWith?(other: HistoryCommand): HistoryCommand
}

// ==================== 命令分组 ====================

/**
 * 命令组
 * 将多个命令作为一个整体进行撤销/重做
 * 例如：分割片段时同时创建两个新片段
 */
export interface CommandGroup extends HistoryCommand {
  /** 分组内的所有命令 */
  readonly commands: HistoryCommand[]
}

// ==================== 配置 ====================

/**
 * 历史管理器配置
 */
export interface HistoryConfig {
  /** 最大历史深度（默认 100） */
  maxStackSize: number
  
  /** 命令合并时间窗口（毫秒，默认 300ms） */
  mergeWindowMs: number
  
  /** 是否启用操作分组 */
  enableGrouping: boolean
  
  /** 是否启用调试日志 */
  debug: boolean
}

/**
 * 默认配置
 */
export const DEFAULT_HISTORY_CONFIG: HistoryConfig = {
  maxStackSize: 100,
  mergeWindowMs: 300,
  enableGrouping: true,
  debug: false
}

// ==================== 状态 ====================

/**
 * 历史管理器状态（用于响应式绑定）
 */
export interface HistoryState {
  /** 是否可以撤销 */
  canUndo: boolean
  
  /** 是否可以重做 */
  canRedo: boolean
  
  /** 撤销操作的描述 */
  undoDescription: string | null
  
  /** 重做操作的描述 */
  redoDescription: string | null
  
  /** 撤销栈深度 */
  undoStackSize: number
  
  /** 重做栈深度 */
  redoStackSize: number
  
  /** 是否处于分组模式 */
  isGrouping: boolean
}

// ==================== 命令类型常量 ====================

/**
 * 命令类型枚举
 * 用于标识不同类型的操作
 */
export const CommandTypes = {
  // 时间线操作
  ADD_CLIP: 'timeline:addClip',
  REMOVE_CLIP: 'timeline:removeClip',
  UPDATE_CLIP: 'timeline:updateClip',
  MOVE_CLIP: 'timeline:moveClip',
  SPLIT_CLIP: 'timeline:splitClip',
  
  // 轨道操作
  ADD_TRACK: 'timeline:addTrack',
  REMOVE_TRACK: 'timeline:removeTrack',
  TOGGLE_TRACK_MUTE: 'timeline:toggleTrackMute',
  TOGGLE_TRACK_LOCK: 'timeline:toggleTrackLock',
  
  // 特效操作
  ADD_EFFECT: 'effects:addEffect',
  REMOVE_EFFECT: 'effects:removeEffect',
  UPDATE_EFFECT: 'effects:updateEffect',
  TOGGLE_EFFECT: 'effects:toggleEffect',
  REORDER_EFFECTS: 'effects:reorderEffects',
  
  // 动画操作
  ADD_KEYFRAME: 'animation:addKeyframe',
  REMOVE_KEYFRAME: 'animation:removeKeyframe',
  UPDATE_KEYFRAME: 'animation:updateKeyframe',
  
  // 项目设置
  SET_CANVAS_SIZE: 'project:setCanvasSize',
  SET_FRAME_RATE: 'project:setFrameRate',
  RENAME_PROJECT: 'project:rename',
  
  // 分组
  GROUP: 'group'
} as const

export type CommandType = typeof CommandTypes[keyof typeof CommandTypes]

// ==================== 工具类型 ====================

/**
 * 生成唯一命令 ID
 */
export function generateCommandId(): string {
  return `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}
