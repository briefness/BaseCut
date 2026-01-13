<script setup lang="ts">
/**
 * 片段属性面板
 * 
 * 显示和编辑选中片段的属性：时间范围、音量等
 * 从 PropertyPanel.vue 拆分，遵循单一职责原则
 */
import { computed } from 'vue'
import { useTimelineStore } from '@/stores/timeline'
import { useResourceStore } from '@/stores/resource'
import { useProjectStore } from '@/stores/project'
import type { Clip } from '@/types'

const props = defineProps<{
  clip: Clip
}>()

const timelineStore = useTimelineStore()
const resourceStore = useResourceStore()
const projectStore = useProjectStore()

// 选中片段对应的素材
const selectedMaterial = computed(() => {
  if (!props.clip?.materialId) return null
  return resourceStore.getMaterial(props.clip.materialId)
})

// 选中片段所属的轨道类型
const selectedTrackType = computed(() => {
  const track = timelineStore.tracks.find(t => t.id === props.clip?.trackId)
  return track?.type ?? null
})

// 是否是音频片段
const isAudioClip = computed(() => selectedTrackType.value === 'audio')

// 是否是视频片段
const isVideoClip = computed(() => selectedTrackType.value === 'video')

// 格式化时长
function formatDuration(seconds?: number): string {
  if (!seconds) return '00:00.00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 100)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
}

// 更新片段属性
function updateClipProperty(key: string, value: number | string) {
  timelineStore.updateClip(props.clip.id, { [key]: value })
  projectStore.markDirty()
}
</script>

<template>
  <div class="clip-properties">
    <!-- 面板头部：片段信息概览 -->
    <div class="panel-header-lg">
      <div class="clip-meta">
        <span class="clip-type-tag" :class="selectedMaterial?.type">
          {{ selectedMaterial?.type === 'video' ? 'VIDEO' : 
             selectedMaterial?.type === 'audio' ? 'AUDIO' : 
             selectedMaterial?.type === 'image' ? 'IMAGE' : 'TEXT' }}
        </span>
        <h3 class="clip-name" :title="selectedMaterial?.name">{{ selectedMaterial?.name || '未命名片段' }}</h3>
      </div>
    </div>

    <!-- 基础属性组 -->
    <div class="panel-group">
      <div class="group-title">基础属性</div>
      <div class="control-grid">
        
        <!-- 时间范围 -->
        <div class="control-item full-width">
          <label>时间范围</label>
          <div class="time-range-display">
            <div class="time-block">
              <span class="label">入点</span>
              <span class="value">{{ formatDuration(clip.inPoint) }}</span>
            </div>
            <div class="divider">→</div>
            <div class="time-block">
              <span class="label">出点</span>
              <span class="value">{{ formatDuration(clip.outPoint) }}</span>
            </div>
          </div>
        </div>

        <!-- 时长 -->
        <div class="control-item">
          <label>时长</label>
          <div class="input-wrapper suffix">
            <input 
              type="number"
              class="custom-input"
              :value="clip.duration.toFixed(2)"
              step="0.1"
              min="0.1"
              @change="(e) => updateClipProperty('duration', Number((e.target as HTMLInputElement).value))"
            />
            <span class="suffix-text">s</span>
          </div>
        </div>
        
        <!-- 开始时间 -->
        <div class="control-item">
          <label>开始</label>
          <div class="input-wrapper suffix">
            <input 
              type="number"
              class="custom-input"
              :value="clip.startTime.toFixed(2)"
              step="0.1"
              min="0"
              @change="(e) => updateClipProperty('startTime', Number((e.target as HTMLInputElement).value))"
            />
            <span class="suffix-text">s</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 音频属性组 -->
    <div v-if="isAudioClip || isVideoClip" class="panel-group">
      <div class="group-title">音频设置</div>
      <div class="control-grid">
        <div class="control-item full-width">
          <div class="flex-label">
            <label>音量</label>
            <span class="value-display">{{ clip.volume ?? (isAudioClip ? 40 : 100) }}%</span>
          </div>
          <div class="slider-wrapper">
            <input 
              type="range"
              class="custom-slider"
              :value="clip.volume ?? (isAudioClip ? 40 : 100)"
              min="0"
              max="200"
              step="1"
              @input="(e) => updateClipProperty('volume', Number((e.target as HTMLInputElement).value))"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.clip-properties {
  animation: fadeIn 0.3s ease;
}

.panel-header-lg {
  padding: 16px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-secondary);
  position: sticky;
  top: 0;
  z-index: 10;
}

.clip-meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.clip-type-tag {
  align-self: flex-start;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 3px;
  text-transform: uppercase;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
}

.clip-type-tag.video { color: #60a5fa; background: rgba(96, 165, 250, 0.1); }
.clip-type-tag.audio { color: #34d399; background: rgba(52, 211, 153, 0.1); }
.clip-type-tag.text { color: #fbbf24; background: rgba(251, 191, 36, 0.1); }

.clip-name {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
}

.control-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.control-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.control-item.full-width {
  grid-column: span 2;
}

.control-item label {
  font-size: 11px;
  color: var(--text-secondary);
}

.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  background: var(--bg-tertiary);
  border-radius: 4px;
  transition: box-shadow 0.2s;
  height: 26px;
}

.input-wrapper:hover {
  background: var(--bg-hover);
}

.input-wrapper:focus-within {
  box-shadow: 0 0 0 1.5px var(--primary-light);
  background: var(--bg-tertiary);
}

.custom-input {
  width: 100%;
  height: 100%;
  background: transparent;
  border: none;
  padding: 0 6px;
  font-size: 12px;
  color: var(--text-primary);
  font-family: inherit;
  outline: none;
}

.input-wrapper.suffix .custom-input {
  padding-right: 26px;
}

.suffix-text {
  position: absolute;
  right: 6px;
  font-size: 10px;
  color: var(--text-muted);
  pointer-events: none;
}

.time-range-display {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--bg-tertiary);
  padding: 4px 10px;
  border-radius: 4px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
}

.time-block {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.time-block .label {
  font-size: 8px;
  color: var(--text-muted);
  margin-bottom: 1px;
}

.divider {
  color: var(--text-muted);
  font-size: 11px;
}

.flex-label {
  display: flex;
  justify-content: space-between;
  margin-bottom: 2px;
}

.value-display {
  font-size: 11px;
  color: var(--text-primary);
  font-family: monospace;
}

.slider-wrapper {
  height: 24px;
  display: flex;
  align-items: center;
}

.custom-slider {
  width: 100%;
  -webkit-appearance: none;
  height: 3px;
  background: var(--bg-tertiary);
  border-radius: 2px;
  outline: none;
  appearance: none;
}

.custom-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--primary);
  cursor: pointer;
  transition: transform 0.1s;
}

.custom-slider::-webkit-slider-thumb:hover {
  transform: scale(1.2);
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>
