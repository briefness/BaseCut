<script setup lang="ts">
/**
 * 时间标尺组件
 * 从 Timeline.vue 拆分，负责时间刻度显示和点击定位
 */
import { computed } from 'vue'
import { useTimelineStore } from '@/stores/timeline'

interface Props {
  pixelsPerSecond: number
  scrollOffset: number
  timelineWidth: number
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'seek', time: number): void
}>()

const timelineStore = useTimelineStore()

// 时间刻度标记
const timeMarkers = computed(() => {
  const markers: { time: number; label: string; major: boolean }[] = []
  const duration = Math.max(timelineStore.duration, 60)
  
  // 根据缩放级别选择刻度间隔
  let interval = 1 // 秒
  if (timelineStore.zoom < 0.5) interval = 10
  else if (timelineStore.zoom < 1) interval = 5
  else if (timelineStore.zoom > 2) interval = 0.5
  
  for (let t = 0; t <= duration; t += interval) {
    const isMajor = t % (interval * 5) === 0
    markers.push({
      time: t,
      label: formatTime(t),
      major: isMajor
    })
  }
  
  return markers
})

// 格式化时间
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// 点击时间标尺定位
function handleClick(e: MouseEvent) {
  const target = e.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const x = e.clientX - rect.left + props.scrollOffset
  const time = Math.max(0, x / props.pixelsPerSecond)
  emit('seek', time)
}
</script>

<template>
  <div 
    class="time-ruler"
    @click="handleClick"
  >
    <div 
      class="ruler-content" 
      :style="{ 
        width: `${timelineWidth}px`, 
        transform: `translateX(-${scrollOffset}px)` 
      }"
    >
      <div 
        v-for="marker in timeMarkers"
        :key="marker.time"
        class="time-marker"
        :class="{ major: marker.major }"
        :style="{ left: `${marker.time * pixelsPerSecond}px` }"
      >
        <span v-if="marker.major" class="marker-label">{{ marker.label }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.time-ruler {
  height: 28px;
  background: var(--bg-tertiary);
  border-bottom: 1px solid var(--border-secondary);
  overflow: hidden;
  flex-shrink: 0;
  cursor: pointer;
  margin-left: 120px;
}

.ruler-content {
  position: relative;
  height: 100%;
}

.time-marker {
  position: absolute;
  top: 0;
  height: 100%;
}

.time-marker::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  width: 1px;
  height: 8px;
  background: var(--border-primary);
}

.time-marker.major::after {
  height: 14px;
  background: var(--text-muted);
}

.marker-label {
  position: absolute;
  top: 4px;
  left: 4px;
  font-size: 10px;
  color: var(--text-muted);
  white-space: nowrap;
}
</style>
