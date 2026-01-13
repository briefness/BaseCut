<script setup lang="ts">
/**
 * 项目设置面板
 * 
 * 显示和编辑项目全局配置：分辨率、帧率等
 * 从 PropertyPanel.vue 拆分，遵循单一职责原则
 */
import { useProjectStore } from '@/stores/project'

const projectStore = useProjectStore()
</script>

<template>
  <div class="project-settings">
    <div class="panel-header-lg">
      <h3>项目设置</h3>
      <span class="header-subtitle">全局配置</span>
    </div>
    
    <div class="panel-group">
      <div class="group-title">视频规格</div>
      <div class="control-grid">
        <!-- 分辨率 -->
        <div class="control-item">
          <label>分辨率</label>
          <div class="select-wrapper">
            <select 
              class="custom-select"
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
            <span class="select-arrow">▼</span>
          </div>
        </div>

        <!-- 帧率 -->
        <div class="control-item">
          <label>帧率</label>
          <div class="input-wrapper suffix">
            <input 
              type="number"
              class="custom-input"
              :value="projectStore.frameRate"
              min="24"
              max="60"
              @change="(e) => projectStore.setFrameRate(Number((e.target as HTMLInputElement).value))"
            />
            <span class="suffix-text">fps</span>
          </div>
        </div>
      </div>
      
      <div class="group-info">
        💡 修改项目设置将影响最终导出的视频规格
      </div>
    </div>
  </div>
</template>

<style scoped>
.project-settings {
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

.panel-header-lg h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.header-subtitle {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: var(--text-secondary);
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

.control-item label {
  font-size: 11px;
  color: var(--text-secondary);
}

.select-wrapper,
.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  background: var(--bg-tertiary);
  border-radius: 4px;
  transition: box-shadow 0.2s;
  height: 26px;
}

.input-wrapper:hover,
.select-wrapper:hover {
  background: var(--bg-hover);
}

.input-wrapper:focus-within,
.select-wrapper:focus-within {
  box-shadow: 0 0 0 1.5px var(--primary-light);
  background: var(--bg-tertiary);
}

.custom-input,
.custom-select {
  width: 100%;
  height: 100%;
  background: transparent;
  border: none;
  padding: 0 6px;
  font-size: 12px;
  color: var(--text-primary);
  font-family: inherit;
  outline: none;
  -webkit-appearance: none;
  appearance: none;
}

.custom-select {
  padding-right: 20px;
  cursor: pointer;
}

.select-arrow {
  position: absolute;
  right: 6px;
  font-size: 9px;
  color: var(--text-muted);
  pointer-events: none;
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

.group-info {
  margin-top: 10px;
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.4;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>
