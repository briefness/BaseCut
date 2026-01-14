<script setup lang="ts">
/**
 * 轨道头部组件
 * 从 Timeline.vue 拆分，负责轨道信息和控制按钮
 */
import type { Track } from '@/types'
import { useTimelineStore } from '@/stores/timeline'

interface Props {
  track: Track
}

defineProps<Props>()
const emit = defineEmits<{
  (e: 'remove', trackId: string): void
}>()

const timelineStore = useTimelineStore()

// 获取轨道颜色
function getTrackColor(type: string): string {
  switch (type) {
    case 'video': return 'var(--track-video)'
    case 'audio': return 'var(--track-audio)'
    case 'text': return 'var(--track-text)'
    default: return 'var(--primary)'
  }
}
</script>

<template>
  <div 
    class="track-header"
    :class="{ locked: track.locked, muted: track.muted }"
  >
    <div class="track-info">
      <span 
        class="track-type-indicator"
        :style="{ background: getTrackColor(track.type) }"
      ></span>
      <span class="track-name">{{ track.name }}</span>
    </div>
    <div class="track-controls">
      <button 
        class="track-btn"
        :class="{ active: track.muted }"
        @click="timelineStore.toggleTrackMute(track.id)"
        title="静音"
      >
        {{ track.muted ? '🔇' : '🔊' }}
      </button>
      <button 
        class="track-btn"
        :class="{ active: track.locked }"
        @click="timelineStore.toggleTrackLock(track.id)"
        title="锁定"
      >
        {{ track.locked ? '🔒' : '🔓' }}
      </button>
      <button 
        class="track-btn delete"
        @click="emit('remove', track.id)"
        title="删除轨道"
      >
        ×
      </button>
    </div>
  </div>
</template>

<style scoped>
.track-header {
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px;
  border-bottom: 1px solid var(--border-secondary);
}

.track-header.locked {
  opacity: 0.6;
}

.track-header.muted {
  opacity: 0.5;
}

.track-info {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.track-type-indicator {
  width: 4px;
  height: 24px;
  border-radius: 2px;
  flex-shrink: 0;
}

.track-name {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.track-controls {
  display: flex;
  gap: 2px;
}

.track-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: var(--text-muted);
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
}

.track-btn:hover {
  background: var(--bg-elevated);
  color: var(--text-primary);
}

.track-btn.active {
  color: var(--primary);
}

.track-btn.delete:hover {
  color: var(--error);
}
</style>
