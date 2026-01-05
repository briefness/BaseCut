<script setup lang="ts">
/**
 * 转场选择面板
 * 在两个片段交接处显示，用于选择和配置转场效果
 */
import { ref, computed } from 'vue'
import { useTimelineStore } from '@/stores/timeline'
import { useProjectStore } from '@/stores/project'
import { TRANSITION_PRESETS, type TransitionType } from '@/types'

const props = defineProps<{
  clipAId: string
  clipBId: string
  position: { x: number; y: number }
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const timelineStore = useTimelineStore()
const projectStore = useProjectStore()

// 当前选中的转场
const currentTransition = computed(() => 
  timelineStore.getTransitionBetween(props.clipAId, props.clipBId)
)

// 转场时长
const transitionDuration = ref(currentTransition.value?.duration ?? 0.5)

// 选择转场效果
function selectTransition(type: TransitionType): void {
  timelineStore.addTransition(props.clipAId, props.clipBId, type, transitionDuration.value)
  projectStore.markDirty()
}

// 移除转场
function removeTransition(): void {
  if (currentTransition.value) {
    timelineStore.removeTransition(currentTransition.value.id)
    projectStore.markDirty()
  }
  emit('close')
}

// 更新转场时长
function updateDuration(duration: number): void {
  if (currentTransition.value) {
    timelineStore.addTransition(
      props.clipAId, 
      props.clipBId, 
      currentTransition.value.type, 
      duration
    )
    projectStore.markDirty()
  }
  transitionDuration.value = duration
}
</script>

<template>
  <div 
    class="transition-panel"
    :style="{ left: position.x + 'px', top: position.y + 'px' }"
    @click.stop
  >
    <div class="panel-header">
      <h4>转场效果</h4>
      <button class="close-btn" @click="emit('close')">×</button>
    </div>
    
    <div class="panel-content">
      <!-- 转场时长 -->
      <div class="duration-control">
        <label>时长</label>
        <input 
          type="range"
          :value="transitionDuration"
          min="0.1"
          max="2"
          step="0.1"
          @input="(e) => updateDuration(Number((e.target as HTMLInputElement).value))"
        />
        <span class="duration-value">{{ transitionDuration.toFixed(1) }}s</span>
      </div>
      
      <!-- 转场效果列表 -->
      <div class="transition-grid">
        <div 
          v-for="preset in TRANSITION_PRESETS"
          :key="preset.type"
          class="transition-item"
          :class="{ active: currentTransition?.type === preset.type }"
          @click="selectTransition(preset.type)"
        >
          <span class="transition-icon">{{ preset.icon }}</span>
          <span class="transition-name">{{ preset.name }}</span>
        </div>
      </div>
      
      <!-- 无转场选项 -->
      <button 
        v-if="currentTransition"
        class="remove-btn"
        @click="removeTransition"
      >
        移除转场
      </button>
    </div>
  </div>
</template>

<style scoped>
.transition-panel {
  position: fixed;
  left: 50% !important;
  top: 50% !important;
  transform: translate(-50%, -50%);
  width: 320px;
  max-height: 80vh;
  background: var(--bg-elevated);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-lg);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  z-index: 1000;
  display: flex;
  flex-direction: column;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-secondary);
}

.panel-header h4 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.close-btn {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 18px;
  cursor: pointer;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.close-btn:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.panel-content {
  padding: 12px;
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.duration-control {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-secondary);
}

.duration-control label {
  font-size: 12px;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.duration-control input[type="range"] {
  flex: 1;
  height: 2px;
  appearance: none;
  background: var(--border-secondary);
  border-radius: 1px;
  cursor: pointer;
}

.duration-control input[type="range"]::-webkit-slider-thumb {
  appearance: none;
  width: 12px;
  height: 12px;
  background: var(--primary);
  border-radius: 50%;
  cursor: pointer;
}

.duration-value {
  font-size: 12px;
  color: var(--text-primary);
  font-family: 'JetBrains Mono', monospace;
  min-width: 36px;
  text-align: right;
}

.transition-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.transition-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 8px;
  background: var(--bg-secondary);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.15s;
}

.transition-item:hover {
  background: var(--bg-tertiary);
  border-color: var(--border-primary);
}

.transition-item.active {
  background: var(--primary-bg);
  border-color: var(--primary);
}

.transition-icon {
  font-size: 20px;
  line-height: 1;
}

.transition-name {
  font-size: 11px;
  color: var(--text-secondary);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.transition-item.active .transition-name {
  color: var(--primary);
}

.remove-btn {
  width: 100%;
  margin-top: 12px;
  padding: 8px;
  border: 1px solid var(--border-secondary);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.remove-btn:hover {
  border-color: var(--danger);
  color: var(--danger);
  background: rgba(239, 68, 68, 0.1);
}
</style>
