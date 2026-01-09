/**
 * 历史状态管理（Pinia Store）
 * 
 * 封装 HistoryManager，提供响应式状态绑定
 * 集成全局快捷键（Ctrl+Z / Ctrl+Y）
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { HistoryManager } from '@/engine/HistoryManager'
import type { HistoryCommand, HistoryState } from '@/engine/HistoryTypes'

export const useHistoryStore = defineStore('history', () => {
  // ==================== 核心实例 ====================
  
  const manager = new HistoryManager({
    maxStackSize: 100,
    mergeWindowMs: 300,
    enableGrouping: true,
    debug: true  // 开发阶段启用日志
  })
  
  // ==================== 响应式状态 ====================
  
  /** 是否可以撤销 */
  const canUndo = ref(false)
  
  /** 是否可以重做 */
  const canRedo = ref(false)
  
  /** 撤销描述 */
  const undoDescription = ref<string | null>(null)
  
  /** 重做描述 */
  const redoDescription = ref<string | null>(null)
  
  /** 撤销栈深度 */
  const undoStackSize = ref(0)
  
  /** 重做栈深度 */
  const redoStackSize = ref(0)
  
  /** 是否处于分组模式 */
  const isGrouping = ref(false)
  
  // ==================== 状态同步 ====================
  
  /**
   * 同步 Manager 状态到响应式变量
   */
  function syncState(state: HistoryState): void {
    canUndo.value = state.canUndo
    canRedo.value = state.canRedo
    undoDescription.value = state.undoDescription
    redoDescription.value = state.redoDescription
    undoStackSize.value = state.undoStackSize
    redoStackSize.value = state.redoStackSize
    isGrouping.value = state.isGrouping
  }
  
  // 注册状态变更回调
  manager.onStateChange(syncState)
  
  // ==================== 公共方法 ====================
  
  /**
   * 执行命令并记录到历史
   * @param command 待执行的命令
   * @param skipExecution 是否跳过执行（命令已在外部执行）
   */
  function execute(command: HistoryCommand, skipExecution = false): void {
    manager.execute(command, skipExecution)
  }
  
  /**
   * 撤销最后一个操作
   */
  function undo(): boolean {
    return manager.undo()
  }
  
  /**
   * 重做最后一个被撤销的操作
   */
  function redo(): boolean {
    return manager.redo()
  }
  
  /**
   * 开始命令分组
   */
  function beginGroup(description: string): void {
    manager.beginGroup(description)
  }
  
  /**
   * 结束命令分组
   */
  function endGroup(): void {
    manager.endGroup()
  }
  
  /**
   * 取消当前分组
   */
  function cancelGroup(): void {
    manager.cancelGroup()
  }
  
  /**
   * 清空历史
   */
  function clear(): void {
    manager.clear()
  }
  
  // ==================== 快捷键处理 ====================
  
  /**
   * 全局快捷键处理器
   */
  function handleKeydown(event: KeyboardEvent): void {
    // 忽略输入框内的快捷键
    const target = event.target as HTMLElement
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    ) {
      return
    }
    
    const isMac = navigator.platform.toLowerCase().includes('mac')
    const ctrlOrCmd = isMac ? event.metaKey : event.ctrlKey
    
    if (!ctrlOrCmd) return
    
    // Ctrl+Z / Cmd+Z → 撤销
    if (event.key === 'z' && !event.shiftKey) {
      event.preventDefault()
      undo()
      return
    }
    
    // Ctrl+Shift+Z / Cmd+Shift+Z → 重做
    if (event.key === 'z' && event.shiftKey) {
      event.preventDefault()
      redo()
      return
    }
    
    // Ctrl+Y（Windows 风格）→ 重做
    if (event.key === 'y' && !isMac) {
      event.preventDefault()
      redo()
      return
    }
  }
  
  /**
   * 初始化快捷键监听
   * 应在 App.vue 的 onMounted 中调用
   */
  function initKeyboardShortcuts(): void {
    window.addEventListener('keydown', handleKeydown)
    console.log('[HistoryStore] 快捷键已注册: Ctrl+Z (撤销), Ctrl+Shift+Z/Ctrl+Y (重做)')
  }
  
  /**
   * 移除快捷键监听
   * 应在 App.vue 的 onUnmounted 中调用
   */
  function destroyKeyboardShortcuts(): void {
    window.removeEventListener('keydown', handleKeydown)
  }
  
  // ==================== 导出 ====================
  
  return {
    // 响应式状态
    canUndo,
    canRedo,
    undoDescription,
    redoDescription,
    undoStackSize,
    redoStackSize,
    isGrouping,
    
    // 方法
    execute,
    undo,
    redo,
    beginGroup,
    endGroup,
    cancelGroup,
    clear,
    
    // 快捷键
    initKeyboardShortcuts,
    destroyKeyboardShortcuts
  }
})
