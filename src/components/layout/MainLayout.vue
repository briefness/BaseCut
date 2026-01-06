<script setup lang="ts">
import { ref } from 'vue'
import MaterialUpload from '../upload/MaterialUpload.vue'
import Player from '../player/Player.vue'
import Timeline from '../timeline/Timeline.vue'
import PropertyPanel from '../property/PropertyPanel.vue'
import ExportDialog from '../export/ExportDialog.vue'
import { useProjectStore } from '@/stores/project'

const projectStore = useProjectStore()

// 导出对话框状态
const showExportDialog = ref(false)

function openExportDialog() {
  showExportDialog.value = true
}
</script>

<template>
  <div class="main-layout">
    <!-- 顶部工具栏 -->
    <header class="header">
      <div class="header-left">
        <div class="logo">
          <span class="logo-icon">◈</span>
          <span class="logo-text">BaseCut</span>
        </div>
      </div>
      
      <div class="header-center">
        <input 
          type="text" 
          class="project-name-input"
          :value="projectStore.projectName"
          @change="(e) => projectStore.rename((e.target as HTMLInputElement).value)"
        />
      </div>
      
      <div class="header-right">
        <button class="btn btn-ghost" @click="projectStore.save">
          <span>💾</span> 保存
        </button>
        <button class="btn btn-primary" @click="openExportDialog">
          <span>📤</span> 导出
        </button>
      </div>
    </header>

    <!-- 上方内容区（三列布局） -->
    <div class="upper-content">
      <!-- 左侧面板 - 素材上传 -->
      <aside class="sidebar left-sidebar">
        <MaterialUpload />
      </aside>

      <!-- 中间区域 - 预览 -->
      <div class="center-area">
        <section class="preview-section">
          <Player />
        </section>
      </div>

      <!-- 右侧面板 - 属性编辑 -->
      <aside class="sidebar right-sidebar">
        <PropertyPanel />
      </aside>
    </div>

    <!-- 下方时间轴区（撑满整个宽度） -->
    <section class="timeline-section">
      <Timeline />
    </section>
    
    <!-- 导出对话框 -->
    <ExportDialog v-model:visible="showExportDialog" />
  </div>
</template>

<style scoped>
.main-layout {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
}

/* 顶部工具栏 */
.header {
  height: var(--header-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-secondary);
  flex-shrink: 0;
}

.header-left,
.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.logo {
  display: flex;
  align-items: center;
  gap: 8px;
}

.logo-icon {
  font-size: 24px;
  background: linear-gradient(135deg, var(--primary), #a855f7);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.logo-text {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
}

.project-name-input {
  width: 200px;
  padding: 6px 12px;
  background: var(--bg-tertiary);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  text-align: center;
  color: var(--text-primary);
  font-weight: 500;
  transition: all var(--transition-fast);
}

.project-name-input:hover {
  border-color: var(--border-primary);
}

.project-name-input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px var(--primary-light);
}

/* 上方内容区（三列布局） */
.upper-content {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 0; /* 防止 flex 溢出 */
}

/* 侧边栏 */
.sidebar {
  width: var(--sidebar-width);
  background: var(--bg-secondary);
  border: 1px solid var(--border-secondary);
  flex-shrink: 0;
  overflow: hidden;
}

.left-sidebar {
  border-right: 1px solid var(--border-secondary);
}

.right-sidebar {
  width: var(--property-width);
  border-left: 1px solid var(--border-secondary);
}

/* 中间区域 */
.center-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

.preview-section {
  flex: 1;
  min-height: 200px;
  background: var(--bg-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

/* 时间轴区域（撑满底部宽度） */
.timeline-section {
  height: var(--timeline-height);
  flex-shrink: 0;
  border-top: 1px solid var(--border-secondary);
  background: var(--bg-secondary);
  width: 100%; /* 确保撑满 */
}
</style>
