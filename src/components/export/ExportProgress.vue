<script setup lang="ts">
/**
 * 导出进度组件
 * 从 ExportDialog.vue 拆分
 */

interface Props {
  progress: number
  isExporting: boolean
  success: boolean
  error: string | null
}

defineProps<Props>()
</script>

<template>
  <!-- 导出进度 -->
  <div v-if="isExporting" class="export-progress">
    <div class="progress-label">
      <span>正在导出...</span>
      <span>{{ progress }}%</span>
    </div>
    <div class="progress-bar">
      <div class="progress-fill" :style="{ width: progress + '%' }"></div>
    </div>
    <p class="progress-hint">请勿关闭窗口，导出过程可能需要几分钟</p>
  </div>

  <!-- 导出成功 -->
  <div v-if="success" class="export-result success">
    <span class="result-icon">✓</span>
    <span>导出成功！文件已开始下载</span>
  </div>

  <!-- 导出失败 -->
  <div v-if="error" class="export-result error">
    <span class="result-icon">✕</span>
    <span>{{ error }}</span>
  </div>
</template>

<style scoped>
.export-progress {
  background: var(--bg-tertiary);
  border-radius: var(--radius-md);
  padding: 16px;
  margin-bottom: 16px;
}

.progress-label {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 14px;
  color: var(--text-secondary);
}

.progress-bar {
  height: 8px;
  background: var(--bg-elevated);
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--primary), #22d3ee);
  border-radius: 4px;
  transition: width 0.3s ease;
}

.progress-hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--text-muted);
  text-align: center;
}

.export-result {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-radius: var(--radius-md);
  font-size: 14px;
}

.export-result.success {
  background: rgba(34, 197, 94, 0.1);
  color: #22c55e;
  border: 1px solid rgba(34, 197, 94, 0.2);
}

.export-result.error {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.2);
}

.result-icon {
  font-size: 18px;
  font-weight: 600;
}
</style>
