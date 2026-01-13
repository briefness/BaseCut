<script setup lang="ts">
/**
 * 转场设置面板
 * 
 * 显示和编辑转场效果配置
 * 从 PropertyPanel.vue 拆分，遵循单一职责原则
 */
import { ref, computed } from 'vue'
import { useTimelineStore } from '@/stores/timeline'
import { useProjectStore } from '@/stores/project'
import { TRANSITION_PRESETS, type TransitionType } from '@/types'
import type { Clip } from '@/types'

const props = defineProps<{
  currentClip: Clip
  nextClip: Clip
}>()

const timelineStore = useTimelineStore()
const projectStore = useProjectStore()

// 转场时长
const transitionDuration = ref(0.5)

// 当前转场效果
const currentTransition = computed(() => {
  return timelineStore.getTransitionBetween(props.currentClip.id, props.nextClip.id)
})

// 选择转场效果
function selectTransition(type: TransitionType): void {
  timelineStore.addTransition(props.currentClip.id, props.nextClip.id, type, transitionDuration.value)
  projectStore.markDirty()
}

// 移除转场
function removeTransition(): void {
  if (currentTransition.value) {
    timelineStore.removeTransition(currentTransition.value.id)
    projectStore.markDirty()
  }
}
</script>

<template>
  <div class="transition-settings">
    <div class="panel-group">
      <div class="group-title">
        <span>转场效果</span>
        <span v-if="currentTransition" class="badge-active">已应用</span>
      </div>
      
      <div class="transition-selector">
        <div 
          v-for="preset in TRANSITION_PRESETS"
          :key="preset.type"
          class="transition-option"
          :class="{ active: currentTransition?.type === preset.type }"
          @click="selectTransition(preset.type)"
          :title="preset.name"
        >
          <span class="icon">{{ preset.icon }}</span>
          <span class="name">{{ preset.name }}</span>
        </div>
      </div>
      
      <div v-if="currentTransition" class="control-row mt-2">
        <button class="btn-text danger" @click="removeTransition">
          🗑️ 移除转场
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.transition-settings {
  animation: fadeIn 0.3s ease;
}

.panel-group {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-secondary);
}

.group-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.badge-active {
  font-size: 9px;
  padding: 2px 6px;
  background: var(--primary-light);
  color: var(--primary);
  border-radius: 3px;
  text-transform: none;
  font-weight: 500;
}

.transition-selector {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  margin-top: 6px;
}

.transition-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 6px;
  background: var(--bg-tertiary);
  border-radius: 4px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.2s;
}

.transition-option:hover {
  background: var(--bg-hover);
}

.transition-option.active {
  border-color: var(--primary);
  background: var(--primary-light);
}

.transition-option .icon {
  font-size: 16px;
  margin-bottom: 2px;
}

.transition-option .name {
  font-size: 10px;
  color: var(--text-secondary);
}

.control-row {
  display: flex;
  gap: 8px;
}

.control-row.mt-2 {
  margin-top: 8px;
}

.btn-text {
  padding: 4px 8px;
  font-size: 11px;
  background: transparent;
  border: none;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s;
}

.btn-text.danger {
  color: var(--error);
}

.btn-text.danger:hover {
  background: rgba(239, 68, 68, 0.1);
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>
