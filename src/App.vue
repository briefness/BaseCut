<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import MainLayout from './components/layout/MainLayout.vue'
import { useResourceStore } from './stores/resource'
import { useProjectStore } from './stores/project'
import { useHistoryStore } from './stores/history'

const resourceStore = useResourceStore()
const projectStore = useProjectStore()
const historyStore = useHistoryStore()

const isInitialized = ref(false)
const initError = ref<string | null>(null)

onMounted(async () => {
  try {
    // 初始化资源管理
    await resourceStore.init()
    // 创建新项目
    projectStore.createNew()
    // 初始化撤销/重做快捷键
    historyStore.initKeyboardShortcuts()
    isInitialized.value = true
  } catch (error) {
    console.error('初始化失败:', error)
    initError.value = String(error)
  }
})

// 组件卸载时清理快捷键监听
onUnmounted(() => {
  historyStore.destroyKeyboardShortcuts()
})

/**
 * 重新加载页面
 * 独立为方法以解决模板中 window 对象不可访问的类型问题
 */
function reloadPage(): void {
  window.location.reload()
}
</script>

<template>
  <div class="app">
    <!-- 初始化中 -->
    <div v-if="!isInitialized && !initError" class="loading-screen">
      <div class="loading-content">
        <div class="loading-spinner large"></div>
        <h2>BaseCut</h2>
        <p>正在初始化...</p>
      </div>
    </div>

    <!-- 初始化错误 -->
    <div v-else-if="initError" class="error-screen">
      <div class="error-content">
        <h2>初始化失败</h2>
        <p>{{ initError }}</p>
        <button class="btn btn-primary" @click="reloadPage">
          重新加载
        </button>
      </div>
    </div>

    <!-- 主界面 -->
    <MainLayout v-else />
  </div>
</template>

<style scoped>
.app {
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background: var(--bg-primary);
}

.loading-screen,
.error-screen {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.loading-content,
.error-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.loading-content h2 {
  font-size: 32px;
  font-weight: 700;
  background: linear-gradient(135deg, var(--primary), #a855f7);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.loading-spinner.large {
  width: 48px;
  height: 48px;
  border-width: 3px;
}

.error-content h2 {
  color: var(--error);
}

.error-content p {
  color: var(--text-secondary);
  max-width: 400px;
}
</style>
