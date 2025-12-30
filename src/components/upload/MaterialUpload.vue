<script setup lang="ts">
import { ref, computed } from 'vue'
import { useResourceStore } from '@/stores/resource'
import { useTimelineStore } from '@/stores/timeline'
import type { Material } from '@/types'

const resourceStore = useResourceStore()
const timelineStore = useTimelineStore()

const isDragging = ref(false)
const activeTab = ref<'video' | 'audio' | 'image'>('video')

const filteredMaterials = computed(() => {
  if (activeTab.value === 'video') return resourceStore.videoMaterials
  if (activeTab.value === 'audio') return resourceStore.audioMaterials
  return resourceStore.imageMaterials
})

// 文件拖放处理
function handleDragOver(e: DragEvent) {
  e.preventDefault()
  isDragging.value = true
}

function handleDragLeave() {
  isDragging.value = false
}

async function handleDrop(e: DragEvent) {
  e.preventDefault()
  isDragging.value = false

  const files = e.dataTransfer?.files
  if (!files?.length) return

  const validFiles = Array.from(files).filter(file => 
    file.type.startsWith('video/') ||
    file.type.startsWith('audio/') ||
    file.type.startsWith('image/')
  )

  if (validFiles.length) {
    await resourceStore.addMaterials(validFiles)
  }
}

// 点击上传
const fileInput = ref<HTMLInputElement | null>(null)

function triggerUpload() {
  fileInput.value?.click()
}

async function handleFileSelect(e: Event) {
  const target = e.target as HTMLInputElement
  const files = target.files
  if (!files?.length) return

  await resourceStore.addMaterials(Array.from(files))
  target.value = ''
}

// 添加到时间线
function addToTimeline(material: Material) {
  // 找到或创建对应类型的轨道
  let track = timelineStore.tracks.find(t => t.type === material.type)
  if (!track) {
    track = timelineStore.addTrack(material.type as 'video' | 'audio')
  }

  // 计算新片段的开始时间（放在轨道末尾）
  const lastClip = track.clips[track.clips.length - 1]
  const startTime = lastClip ? lastClip.startTime + lastClip.duration : 0

  // 添加片段
  timelineStore.addClip(track.id, {
    materialId: material.id,
    startTime,
    duration: material.duration ?? 5,
    inPoint: 0,
    outPoint: material.duration ?? 5,
    effects: []
  })
}

// 删除素材
function removeMaterial(id: string, e: Event) {
  e.stopPropagation()
  resourceStore.removeMaterial(id)
}

// 格式化时长
function formatDuration(seconds?: number): string {
  if (!seconds) return '00:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

// 素材拖拽到时间线
function handleMaterialDragStart(e: DragEvent, material: Material) {
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'copy'
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'material',
      materialId: material.id,
      materialType: material.type
    }))
  }
}
</script>

<template>
  <div class="material-upload">
    <!-- 标签页 -->
    <div class="tabs">
      <button 
        v-for="tab in [
          { key: 'video', label: '视频', icon: '🎬' },
          { key: 'audio', label: '音频', icon: '🎵' },
          { key: 'image', label: '图片', icon: '🖼️' }
        ]" 
        :key="tab.key"
        class="tab"
        :class="{ active: activeTab === tab.key }"
        @click="activeTab = tab.key as 'video' | 'audio' | 'image'"
      >
        <span>{{ tab.icon }}</span>
        <span>{{ tab.label }}</span>
      </button>
    </div>

    <!-- 上传区域 -->
    <div 
      class="upload-area"
      :class="{ dragging: isDragging }"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
      @drop="handleDrop"
      @click="triggerUpload"
    >
      <input
        ref="fileInput"
        type="file"
        multiple
        accept="video/*,audio/*,image/*"
        hidden
        @change="handleFileSelect"
      />
      <div class="upload-icon">+</div>
      <p class="upload-text">点击或拖拽上传</p>
      <p class="upload-hint">支持视频、音频、图片</p>
    </div>

    <!-- 素材列表 -->
    <div class="material-list">
      <div 
        v-for="material in filteredMaterials"
        :key="material.id"
        class="material-item"
        draggable="true"
        @dragstart="handleMaterialDragStart($event, material)"
        @click="addToTimeline(material)"
        @dblclick="addToTimeline(material)"
      >
        <!-- 缩略图 -->
        <div class="material-thumb">
          <img 
            v-if="material.thumbnail" 
            :src="material.thumbnail" 
            :alt="material.name"
          />
          <div v-else class="thumb-placeholder">
            {{ material.type === 'video' ? '🎬' : material.type === 'audio' ? '🎵' : '🖼️' }}
          </div>
          <span v-if="material.duration" class="duration-badge">
            {{ formatDuration(material.duration) }}
          </span>
        </div>

        <!-- 素材信息 -->
        <div class="material-info">
          <p class="material-name" :title="material.name">{{ material.name }}</p>
        </div>

        <!-- 删除按钮 -->
        <button 
          class="delete-btn"
          @click="removeMaterial(material.id, $event)"
          title="删除素材"
        >
          ×
        </button>
      </div>

      <!-- 空状态 -->
      <div v-if="!filteredMaterials.length" class="empty-state">
        <p>暂无{{ activeTab === 'video' ? '视频' : activeTab === 'audio' ? '音频' : '图片' }}素材</p>
        <p class="empty-hint">上传或拖拽文件到此处</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.material-upload {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden; /* 防止内容溢出 */
}

/* 标签页 */
.tabs {
  display: flex;
  padding: 8px;
  gap: 4px;
  border-bottom: 1px solid var(--border-secondary);
}

.tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 8px;
  border-radius: var(--radius-md);
  font-size: 13px;
  color: var(--text-secondary);
  transition: all var(--transition-fast);
}

.tab:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.tab.active {
  background: var(--primary-light);
  color: var(--primary);
}

/* 上传区域 */
.upload-area {
  margin: 12px;
  padding: 24px;
  border: 2px dashed var(--border-primary);
  border-radius: var(--radius-lg);
  text-align: center;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.upload-area:hover,
.upload-area.dragging {
  border-color: var(--primary);
  background: var(--primary-light);
}

.upload-icon {
  width: 48px;
  height: 48px;
  margin: 0 auto 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: 300;
  color: var(--primary);
  background: var(--bg-tertiary);
  border-radius: 50%;
}

.upload-text {
  color: var(--text-primary);
  margin-bottom: 4px;
}

.upload-hint {
  font-size: 12px;
  color: var(--text-muted);
}

/* 素材列表 */
.material-list {
  flex: 1;
  min-height: 0; /* 关键：允许 flex 子元素收缩 */
  padding: 8px;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  align-content: start;
}

.material-item {
  position: relative;
  background: var(--bg-tertiary);
  border-radius: var(--radius-md);
  height: 104px;
  overflow: hidden;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.material-item:hover {
  background: var(--bg-elevated);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.material-thumb {
  position: relative;
  aspect-ratio: 16 / 9;
  background: var(--bg-primary);
}

.material-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.thumb-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
}

.duration-badge {
  position: absolute;
  bottom: 4px;
  right: 4px;
  padding: 2px 6px;
  background: rgba(0, 0, 0, 0.7);
  border-radius: var(--radius-sm);
  font-size: 11px;
  color: white;
}

.material-info {
  padding: 8px;
}

.material-name {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.delete-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  border-radius: 50%;
  color: white;
  font-size: 14px;
  opacity: 0;
  transition: opacity var(--transition-fast);
}

.material-item:hover .delete-btn {
  opacity: 1;
}

.delete-btn:hover {
  background: var(--error);
}

/* 空状态 */
.empty-state {
  grid-column: 1 / -1;
  padding: 32px;
  text-align: center;
  color: var(--text-muted);
}

.empty-hint {
  font-size: 12px;
  margin-top: 4px;
}
</style>
