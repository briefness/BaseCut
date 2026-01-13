<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useProjectStore } from '@/stores/project'
import type { DBProject } from '@/types'

// Props
interface Props {
  visible: boolean
}

const props = defineProps<Props>()

// Emits
const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'close'): void
  (e: 'load', projectId: string): void
}>()

const projectStore = useProjectStore()
const projects = ref<DBProject[]>([])
const isLoading = ref(false)

// 格式化时间
function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// 加载项目列表
async function fetchProjects() {
  isLoading.value = true
  try {
    projects.value = await projectStore.getProjectList()
  } catch (error) {
    console.error('获取项目列表失败:', error)
  } finally {
    isLoading.value = false
  }
}

// 加载项目
async function loadProject(project: DBProject) {
  try {
    isLoading.value = true
    await projectStore.load(project.id)
    emit('load', project.id)
    closeDialog()
  } catch (error) {
    console.error('加载项目失败:', error)
    alert('加载项目失败: ' + error)
  } finally {
    isLoading.value = false
  }
}

// 删除项目
async function deleteProject(project: DBProject) {
  if (!confirm(`确定要删除项目 "${project.name}" 吗？此操作无法撤销。`)) {
    return
  }
  
  try {
    await projectStore.deleteProject(project.id)
    await fetchProjects() // 刷新列表
  } catch (error) {
    console.error('删除项目失败:', error)
    alert('删除项目失败')
  }
}

// 关闭
function closeDialog() {
  emit('update:visible', false)
  emit('close')
}

// 监听可见性变化，打开时刷新列表
watch(() => props.visible, (visible) => {
  if (visible) {
    fetchProjects()
  }
})

onMounted(() => {
  if (props.visible) {
    fetchProjects()
  }
})
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="visible" class="dialog-overlay" @click.self="closeDialog">
        <div class="dialog">
          <!-- 头部 -->
          <div class="dialog-header">
            <h2>我的项目</h2>
            <button class="close-btn" @click="closeDialog">✕</button>
          </div>
          
          <!-- 内容区 -->
          <div class="dialog-body">
            <div v-if="isLoading && projects.length === 0" class="loading-state">
              <div class="spinner"></div>
              <span>加载中...</span>
            </div>
            
            <div v-else-if="projects.length === 0" class="empty-state">
              <span class="empty-icon">📭</span>
              <p>暂无保存的项目</p>
            </div>
            
            <div v-else class="project-list">
              <div 
                v-for="project in projects" 
                :key="project.id" 
                class="project-item"
                @click="loadProject(project)"
                :class="{ active: project.id === projectStore.projectId }"
              >
                <div class="project-info">
                  <h3 class="project-name">{{ project.name }}</h3>
                  <span class="project-time">{{ formatDate(project.updatedAt) }}</span>
                </div>
                
                <div class="project-actions">
                  <button 
                    class="btn-icon delete-btn" 
                    @click.stop="deleteProject(project)"
                    title="删除项目"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog {
  background: var(--bg-secondary);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-secondary);
  width: 500px;
  max-width: 90vw;
  height: 600px;
  max-height: 85vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-secondary);
  flex-shrink: 0;
}

.dialog-header h2 {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.close-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: var(--radius-md);
  font-size: 16px;
  transition: all var(--transition-fast);
}

.close-btn:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.dialog-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

/* Loading & Empty States */
.loading-state,
.empty-state {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  gap: 12px;
}

.empty-icon {
  font-size: 48px;
  opacity: 0.5;
}

.spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--text-secondary);
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Project List */
.project-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.project-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  background: var(--bg-tertiary);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.project-item:hover {
  background: var(--bg-elevated);
  border-color: var(--border-primary);
  transform: translateY(-1px);
}

.project-item.active {
  border-color: var(--primary);
  background: rgba(var(--primary-rgb), 0.1);
}

.project-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.project-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.project-time {
  font-size: 12px;
  color: var(--text-tertiary);
}

.project-actions {
  opacity: 0;
  transition: opacity var(--transition-fast);
}

.project-item:hover .project-actions {
  opacity: 1;
}

.delete-btn {
  padding: 8px;
  border-radius: var(--radius-md);
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 16px;
  color: var(--text-secondary);
  transition: all var(--transition-fast);
}

.delete-btn:hover {
  background: rgba(239, 68, 68, 0.1); /* Red-500 with opacity */
  color: #ef4444; /* Red-500 */
}
</style>
