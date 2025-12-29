<script setup lang="ts">
import { computed } from 'vue'
import { useTimelineStore } from '@/stores/timeline'
import { useResourceStore } from '@/stores/resource'
import { useProjectStore } from '@/stores/project'

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

        <!-- 文字属性（如果是文字轨道） -->
        <section v-if="selectedClip.text !== undefined" class="property-section">
          <h4>文字</h4>
          
          <div class="property-row vertical">
            <label>内容</label>
            <textarea 
              class="input"
              :value="selectedClip.text"
              @change="(e) => updateClipProperty('text', (e.target as HTMLTextAreaElement).value)"
              rows="3"
            ></textarea>
          </div>

          <div class="property-row">
            <label>字号</label>
            <div class="input-group">
              <input 
                type="number"
                class="input small"
                :value="selectedClip.fontSize ?? 24"
                min="12"
                max="200"
                @change="(e) => updateClipProperty('fontSize', Number((e.target as HTMLInputElement).value))"
              />
              <span class="input-suffix">px</span>
            </div>
          </div>

          <div class="property-row">
            <label>颜色</label>
            <input 
              type="color"
              class="color-input"
              :value="selectedClip.fontColor ?? '#ffffff'"
              @change="(e) => updateClipProperty('fontColor', (e.target as HTMLInputElement).value)"
            />
          </div>
        </section>

        <!-- 操作按钮 -->
        <section class="property-section actions">
          <button 
            class="btn btn-secondary full-width"
            @click="timelineStore.splitClip(selectedClip.id, timelineStore.currentTime)"
          >
            ✂️ 分割片段
          </button>
          
          <button 
            class="btn btn-ghost full-width danger"
            @click="timelineStore.removeClip(selectedClip.id)"
          >
            🗑️ 删除片段
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
</style>
