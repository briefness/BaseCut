<script setup lang="ts">
/**
 * 导出设置组件
 * 从 ExportDialog.vue 拆分
 */

interface Props {
  disabled: boolean
}

defineProps<Props>()

// 导出设置
const outputFormat = defineModel<'mp4' | 'webm'>('outputFormat', { required: true })
const resolution = defineModel<string>('resolution', { required: true })
const videoBitrate = defineModel<string>('videoBitrate', { required: true })
const audioBitrate = defineModel<string>('audioBitrate', { required: true })
const useCustomBitrate = defineModel<boolean>('useCustomBitrate', { required: true })

// 计算导出分辨率
const emit = defineEmits<{
  (e: 'resolutionChange', value: { width: number; height: number }): void
}>()

// 分辨率预设
const resolutionPresets = [
  { name: '项目设置', value: 'project' },
  { name: '1080p (1920×1080)', value: '1080p' },
  { name: '720p (1280×720)', value: '720p' },
  { name: '4K (3840×2160)', value: '4k' },
]

// 码率预设
const bitratePresets = [
  { name: '低 (2M)', value: '2M' },
  { name: '中 (5M)', value: '5M' },
  { name: '高 (10M)', value: '10M' },
  { name: '极高 (20M)', value: '20M' },
]
</script>

<template>
  <div class="export-settings">
    <!-- 输出格式 -->
    <div class="setting-group">
      <label>输出格式</label>
      <div class="radio-group">
        <label class="radio-item" :class="{ active: outputFormat === 'mp4' }">
          <input type="radio" v-model="outputFormat" value="mp4" :disabled="disabled">
          <span>MP4</span>
        </label>
        <label class="radio-item" :class="{ active: outputFormat === 'webm' }">
          <input type="radio" v-model="outputFormat" value="webm" :disabled="disabled">
          <span>WebM</span>
        </label>
      </div>
    </div>

    <!-- 分辨率 -->
    <div class="setting-group">
      <label>分辨率</label>
      <select v-model="resolution" class="select" :disabled="disabled">
        <option 
          v-for="preset in resolutionPresets" 
          :key="preset.value" 
          :value="preset.value"
        >
          {{ preset.name }}
        </option>
      </select>
    </div>

    <!-- 自定义码率 -->
    <div class="setting-group">
      <label class="checkbox-label">
        <input type="checkbox" v-model="useCustomBitrate" :disabled="disabled">
        <span>自定义码率</span>
      </label>
    </div>

    <template v-if="useCustomBitrate">
      <div class="setting-group indent">
        <label>视频码率</label>
        <select v-model="videoBitrate" class="select" :disabled="disabled">
          <option 
            v-for="preset in bitratePresets" 
            :key="preset.value" 
            :value="preset.value"
          >
            {{ preset.name }}
          </option>
        </select>
      </div>

      <div class="setting-group indent">
        <label>音频码率</label>
        <select v-model="audioBitrate" class="select" :disabled="disabled">
          <option value="128k">128 kbps</option>
          <option value="192k">192 kbps</option>
          <option value="256k">256 kbps</option>
          <option value="320k">320 kbps</option>
        </select>
      </div>
    </template>
  </div>
</template>

<style scoped>
.export-settings {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.setting-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.setting-group.indent {
  margin-left: 24px;
}

.setting-group > label {
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 500;
}

.radio-group {
  display: flex;
  gap: 8px;
}

.radio-item {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px 16px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-secondary);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.radio-item:hover {
  border-color: var(--border-primary);
}

.radio-item.active {
  background: var(--primary-alpha);
  border-color: var(--primary);
}

.radio-item input {
  display: none;
}

.radio-item span {
  font-size: 14px;
  color: var(--text-primary);
}

.select {
  padding: 10px 12px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-secondary);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 14px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.select:hover:not(:disabled) {
  border-color: var(--border-primary);
}

.select:focus {
  outline: none;
  border-color: var(--primary);
}

.select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.checkbox-label input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: var(--primary);
}

.checkbox-label span {
  font-size: 14px;
  color: var(--text-primary);
}
</style>
