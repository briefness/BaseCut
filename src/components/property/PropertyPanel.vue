<script setup lang="ts">
import { computed, ref } from 'vue'
import { useTimelineStore } from '@/stores/timeline'
import { useResourceStore } from '@/stores/resource'
import { useProjectStore } from '@/stores/project'
import SubtitleEditor from './SubtitleEditor.vue'
import { TRANSITION_PRESETS, type TransitionType } from '@/types'

const timelineStore = useTimelineStore()
const resourceStore = useResourceStore()
const projectStore = useProjectStore()

// 选中的片段
const selectedClip = computed(() => timelineStore.selectedClip)

// 选中片段对应的素材
const selectedMaterial = computed(() => {
  if (!selectedClip.value?.materialId) return null
  return resourceStore.getMaterial(selectedClip.value.materialId)
})

// 选中片段所属的轨道类型
const selectedTrackType = computed(() => {
  if (!selectedClip.value) return null
  const track = timelineStore.tracks.find(t => t.id === selectedClip.value?.trackId)
  return track?.type ?? null
})

// 是否是字幕片段
const isTextClip = computed(() => selectedTrackType.value === 'text')

// 是否是音频片段
const isAudioClip = computed(() => selectedTrackType.value === 'audio')

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
  if (!selectedClip.value) return
  timelineStore.updateClip(selectedClip.value.id, { [key]: value })
  projectStore.markDirty()
}

// 是否是视频片段
const isVideoClip = computed(() => selectedTrackType.value === 'video')

// 获取下一个相邻片段（用于转场设置）
const nextClip = computed(() => {
  if (!selectedClip.value || !isVideoClip.value) return null
  
  const track = timelineStore.tracks.find(t => t.id === selectedClip.value?.trackId)
  if (!track) return null
  
  const sortedClips = [...track.clips].sort((a, b) => a.startTime - b.startTime)
  const currentIndex = sortedClips.findIndex(c => c.id === selectedClip.value?.id)
  if (currentIndex === -1 || currentIndex === sortedClips.length - 1) return null
  
  const next = sortedClips[currentIndex + 1]
  // 检查是否相邻（允许 1 秒间隙）
  const gap = next.startTime - (selectedClip.value!.startTime + selectedClip.value!.duration)
  if (gap <= 1) return next
  return null
})

// 当前转场效果
const currentTransition = computed(() => {
  if (!selectedClip.value || !nextClip.value) return null
  return timelineStore.getTransitionBetween(selectedClip.value.id, nextClip.value.id)
})

// 转场时长
const transitionDuration = ref(0.5)

// 选择转场效果
function selectTransition(type: TransitionType): void {
  if (!selectedClip.value || !nextClip.value) return
  timelineStore.addTransition(selectedClip.value.id, nextClip.value.id, type, transitionDuration.value)
  projectStore.markDirty()
}

// 移除转场
function removeTransition(): void {
  if (currentTransition.value) {
    timelineStore.removeTransition(currentTransition.value.id)
    projectStore.markDirty()
  }
}

// 删除片段
function deleteClip() {
  if (!selectedClip.value) return
  timelineStore.removeClip(selectedClip.value.id)
}
</script>

<template>
  <div class="property-panel">
    <div class="panel-header">
      <h3>属性</h3>
    </div>

    <div class="panel-content">
      <!-- 无选中状态 -->
      <div v-if="!selectedClip" class="empty-state">
        <div class="empty-icon">📋</div>
        <p>选择片段查看属性</p>
      </div>

      <!-- 片段属性 -->
      <div v-else class="properties">
        <!-- 基本信息 -->
        <section class="property-section">
          <h4>基本信息</h4>
          
          <div class="property-row">
            <label>素材</label>
            <span class="property-value">{{ selectedMaterial?.name ?? '无' }}</span>
          </div>

          <div class="property-row">
            <label>类型</label>
            <span class="property-value type-badge">
              {{ selectedMaterial?.type === 'video' ? '🎬 视频' : 
                 selectedMaterial?.type === 'audio' ? '🎵 音频' : 
                 selectedMaterial?.type === 'image' ? '🖼️ 图片' : '📝 文字' }}
            </span>
          </div>

          <div v-if="selectedMaterial?.width" class="property-row">
            <label>分辨率</label>
            <span class="property-value">{{ selectedMaterial.width }} × {{ selectedMaterial.height }}</span>
          </div>
        </section>

        <!-- 时间属性 -->
        <section class="property-section">
          <h4>时间</h4>
          
          <div class="property-row">
            <label>开始时间</label>
            <div class="input-group">
              <input 
                type="number"
                class="input small"
                :value="selectedClip.startTime.toFixed(2)"
                step="0.1"
                min="0"
                @change="(e) => updateClipProperty('startTime', Number((e.target as HTMLInputElement).value))"
              />
              <span class="input-suffix">s</span>
            </div>
          </div>

          <div class="property-row">
            <label>时长</label>
            <div class="input-group">
              <input 
                type="number"
                class="input small"
                :value="selectedClip.duration.toFixed(2)"
                step="0.1"
                min="0.1"
                @change="(e) => updateClipProperty('duration', Number((e.target as HTMLInputElement).value))"
              />
              <span class="input-suffix">s</span>
            </div>
          </div>

          <div class="property-row">
            <label>入点</label>
            <span class="property-value">{{ formatDuration(selectedClip.inPoint) }}</span>
          </div>

          <div class="property-row">
            <label>出点</label>
            <span class="property-value">{{ formatDuration(selectedClip.outPoint) }}</span>
          </div>
        </section>

        <!-- 音频属性（音频轨道片段） -->
        <section v-if="isAudioClip" class="property-section">
          <h4>音频</h4>
          
          <div class="property-row audio-volume-row">
            <label>音量</label>
            <div class="audio-slider-container">
              <input 
                type="range"
                class="audio-slider"
                :value="selectedClip.volume ?? 40"
                min="0"
                max="100"
                step="1"
                @input="(e) => updateClipProperty('volume', Number((e.target as HTMLInputElement).value))"
              />
            </div>
            <input 
              type="number"
              class="audio-value-input"
              :value="selectedClip.volume ?? 40"
              min="0"
              max="100"
              @change="(e) => updateClipProperty('volume', Math.min(100, Math.max(0, Number((e.target as HTMLInputElement).value))))"
            />
          </div>
        </section>

        <!-- 转场效果（视频片段且有下一个相邻片段时显示） -->
        <section v-if="isVideoClip && nextClip" class="property-section">
          <h4>转场效果</h4>
          <p class="transition-hint">与下一个片段之间的转场</p>
          
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
          
          <button 
            v-if="currentTransition"
            class="btn btn-danger full-width mt-8"
            @click="removeTransition"
          >
            移除转场
          </button>
        </section>

        <!-- 字幕编辑器（文字轨道片段） -->
        <SubtitleEditor />

        <!-- 操作按钮 -->
        <section class="property-section actions">
          <!-- 非字幕片段才显示分割按钮 -->
          <button 
            v-if="!isTextClip"
            class="btn btn-secondary full-width"
            @click="timelineStore.splitClip(selectedClip.id, timelineStore.currentTime)"
          >
            ✂️ 分割片段
          </button>
          
          <button 
            class="btn btn-ghost full-width danger"
            @click="deleteClip"
          >
            🗑️ 删除{{ isTextClip ? '字幕' : '片段' }}
          </button>
        </section>
      </div>
    </div>

    <!-- 项目设置 -->
    <div class="project-settings">
      <h4>项目设置</h4>
      
      <div class="property-row">
        <label>分辨率</label>
        <select 
          class="input"
          :value="`${projectStore.canvasWidth}x${projectStore.canvasHeight}`"
          @change="(e) => {
            const [w, h] = (e.target as HTMLSelectElement).value.split('x').map(Number)
            projectStore.setCanvasSize(w, h)
          }"
        >
          <option v-for="preset in projectStore.presets" :key="preset.name" :value="`${preset.width}x${preset.height}`">
            {{ preset.name }} ({{ preset.width }}×{{ preset.height }})
          </option>
        </select>
      </div>

      <div class="property-row">
        <label>帧率</label>
        <div class="input-group">
          <input 
            type="number"
            class="input small"
            :value="projectStore.frameRate"
            min="24"
            max="60"
            @change="(e) => projectStore.setFrameRate(Number((e.target as HTMLInputElement).value))"
          />
          <span class="input-suffix">fps</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.property-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.panel-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-secondary);
}

.panel-header h3 {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
}

.empty-icon {
  font-size: 32px;
  opacity: 0.5;
  margin-bottom: 12px;
}

.empty-state p {
  color: var(--text-muted);
  font-size: 13px;
}

.properties {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.property-section {
  padding: 12px;
  background: var(--bg-tertiary);
  border-radius: var(--radius-md);
}

.property-section h4 {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 12px;
}

.property-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.property-row:last-child {
  margin-bottom: 0;
}

.property-row.vertical {
  flex-direction: column;
  align-items: stretch;
}

.property-row.vertical label {
  margin-bottom: 4px;
}

.property-row label {
  font-size: 12px;
  color: var(--text-secondary);
}

.property-value {
  font-size: 12px;
  color: var(--text-primary);
  font-family: 'JetBrains Mono', monospace;
}

.type-badge {
  background: var(--bg-elevated);
  padding: 2px 8px;
  border-radius: var(--radius-sm);
}

.input-group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.input.small {
  width: 80px;
  padding: 4px 8px;
  font-size: 12px;
  text-align: right;
}

.input-suffix {
  font-size: 11px;
  color: var(--text-muted);
}

.color-input {
  width: 60px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
}

textarea.input {
  resize: vertical;
  min-height: 60px;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.btn.full-width {
  width: 100%;
}

.btn.danger {
  color: var(--error);
}

.btn.danger:hover {
  background: rgba(239, 68, 68, 0.1);
}

.project-settings {
  padding: 12px;
  border-top: 1px solid var(--border-secondary);
  background: var(--bg-tertiary);
}

.project-settings h4 {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 12px;
}

.project-settings .property-row {
  margin-bottom: 12px;
}

.project-settings .input {
  flex: 1;
  padding: 6px 10px;
  font-size: 12px;
}

/* 音量控制 - 剪映风格 */
.audio-volume-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.audio-volume-row label {
  flex-shrink: 0;
  width: 40px;
}

.audio-slider-container {
  flex: 1;
  display: flex;
  align-items: center;
}

.audio-slider {
  width: 100%;
  height: 2px;
  appearance: none;
  background: var(--border-secondary);
  border-radius: 1px;
  cursor: pointer;
  outline: none;
}

.audio-slider::-webkit-slider-runnable-track {
  height: 2px;
  background: var(--border-secondary);
  border-radius: 1px;
}

.audio-slider::-webkit-slider-thumb {
  appearance: none;
  width: 12px;
  height: 12px;
  background: var(--text-primary);
  border-radius: 50%;
  cursor: pointer;
  margin-top: -5px;
  transition: transform 0.15s ease;
}

.audio-slider::-webkit-slider-thumb:hover {
  transform: scale(1.15);
}

.audio-slider::-webkit-slider-thumb:active {
  transform: scale(1.1);
}

.audio-value-input {
  width: 48px;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--border-secondary);
  border-radius: var(--radius-sm);
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 12px;
  font-family: 'JetBrains Mono', monospace;
  text-align: center;
  outline: none;
  transition: border-color 0.2s;
}

.audio-value-input:focus {
  border-color: var(--primary);
}

.audio-value-input::-webkit-inner-spin-button,
.audio-value-input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

/* 转场效果 */
.transition-hint {
  font-size: 11px;
  color: var(--text-secondary);
  margin: 0 0 8px 0;
}

.transition-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}

.transition-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 4px;
  background: var(--bg-secondary);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
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
  font-size: 16px;
  line-height: 1;
}

.transition-name {
  font-size: 10px;
  color: var(--text-secondary);
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.transition-item.active .transition-name {
  color: var(--primary);
}

.mt-8 {
  margin-top: 8px;
}
</style>
