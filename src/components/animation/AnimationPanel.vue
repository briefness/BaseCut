<template>
  <div class="animation-panel">
    <!-- 标题栏 -->
    <div class="panel-header">
      <h3>🎬 关键帧动画</h3>
      <div class="header-actions">
        <!-- 当前时间显示 -->
        <span v-if="selectedClipId" class="current-time-badge" :title="'关键帧将添加到此时间点'">
          ⏱️ {{ formatTime(currentTimeInClip) }}
        </span>
        <button 
          class="action-btn" 
          @click="toggleAllTracks"
          :title="allTracksEnabled ? '禁用所有' : '启用所有'"
        >
          {{ allTracksEnabled ? '🔒' : '🔓' }}
        </button>
      </div>
    </div>
    
    <!-- 无选中片段提示 -->
    <div v-if="!selectedClipId" class="empty-state">
      <span class="icon">📽️</span>
      <p>请先在时间轴上选择一个视频片段</p>
    </div>
    
    <!-- 动画属性列表 -->
    <div v-else class="property-list">
      <!-- 位置 -->
      <div class="property-group">
        <div class="group-header" @click="toggleGroup('position')">
          <span class="expand-icon">{{ expandedGroups.position ? '▼' : '▶' }}</span>
          <span class="group-name">📍 位置</span>
        </div>
        <div v-show="expandedGroups.position" class="group-content">
          <AnimationProperty
            label="X"
            property="position.x"
            :clipId="selectedClipId"
            :currentTime="currentTimeInClip"
            unit="px"
          />
          <AnimationProperty
            label="Y"
            property="position.y"
            :clipId="selectedClipId"
            :currentTime="currentTimeInClip"
            unit="px"
          />
        </div>
      </div>
      
      <!-- 缩放 -->
      <div class="property-group">
        <div class="group-header" @click="toggleGroup('scale')">
          <span class="expand-icon">{{ expandedGroups.scale ? '▼' : '▶' }}</span>
          <span class="group-name">🔍 缩放</span>
        </div>
        <div v-show="expandedGroups.scale" class="group-content">
          <AnimationProperty
            label="统一"
            property="scale"
            :clipId="selectedClipId"
            :currentTime="currentTimeInClip"
            :min="0"
            :max="5"
            :step="0.01"
            unit="x"
          />
          <AnimationProperty
            label="X"
            property="scale.x"
            :clipId="selectedClipId"
            :currentTime="currentTimeInClip"
            :min="0"
            :max="5"
            :step="0.01"
            unit="x"
          />
          <AnimationProperty
            label="Y"
            property="scale.y"
            :clipId="selectedClipId"
            :currentTime="currentTimeInClip"
            :min="0"
            :max="5"
            :step="0.01"
            unit="x"
          />
        </div>
      </div>
      
      <!-- 旋转 -->
      <div class="property-group">
        <div class="group-header" @click="toggleGroup('rotation')">
          <span class="expand-icon">{{ expandedGroups.rotation ? '▼' : '▶' }}</span>
          <span class="group-name">🔄 旋转</span>
        </div>
        <div v-show="expandedGroups.rotation" class="group-content">
          <AnimationProperty
            label="角度"
            property="rotation"
            :clipId="selectedClipId"
            :currentTime="currentTimeInClip"
            :min="-360"
            :max="360"
            :step="1"
            unit="°"
          />
        </div>
      </div>
      
      <!-- 透明度 -->
      <div class="property-group">
        <div class="group-header" @click="toggleGroup('opacity')">
          <span class="expand-icon">{{ expandedGroups.opacity ? '▼' : '▶' }}</span>
          <span class="group-name">💧 透明度</span>
        </div>
        <div v-show="expandedGroups.opacity" class="group-content">
          <AnimationProperty
            label="透明度"
            property="opacity"
            :clipId="selectedClipId"
            :currentTime="currentTimeInClip"
            :min="0"
            :max="1"
            :step="0.01"
            unit="%"
            :valueMultiplier="100"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue'
import { useAnimationStore } from '@/stores/animation'
import { useTimelineStore } from '@/stores/timeline'
import AnimationProperty from './AnimationProperty.vue'

// Stores
const animationStore = useAnimationStore()
const timelineStore = useTimelineStore()

// 展开状态
const expandedGroups = reactive({
  position: true,
  scale: false,
  rotation: false,
  opacity: false
})

// 计算属性
const selectedClipId = computed(() => {
  // 获取当前选中的片段 ID
  const selectedIds = timelineStore.selectedClipIds
  return selectedIds.length === 1 ? selectedIds[0] : null
})

const currentTimeInClip = computed(() => {
  if (!selectedClipId.value) return 0
  
  // 获取选中片段
  const clip = timelineStore.getClipById(selectedClipId.value)
  if (!clip) return 0
  
  // 计算相对于片段起点的时间
  const globalTime = timelineStore.currentTime
  return Math.max(0, globalTime - clip.startTime)
})

const allTracksEnabled = computed(() => {
  if (!selectedClipId.value) return false
  const animation = animationStore.getClipAnimation(selectedClipId.value)
  if (!animation) return false
  return animation.tracks.every(t => t.enabled)
})

// 方法
function toggleGroup(group: keyof typeof expandedGroups) {
  expandedGroups[group] = !expandedGroups[group]
}

function toggleAllTracks() {
  if (!selectedClipId.value) return
  const animation = animationStore.getClipAnimation(selectedClipId.value)
  if (!animation) return
  
  const newState = !allTracksEnabled.value
  animation.tracks.forEach(track => {
    animationStore.setTrackEnabled(selectedClipId.value!, track.property, newState)
  })
}

// 格式化时间显示（秒 -> mm:ss.ms）
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 100)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
}
</script>

<style scoped>
.animation-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-secondary, #1a1a2e);
  color: var(--text-primary, #fff);
  font-size: 13px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color, #2d2d44);
}

.panel-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.current-time-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: var(--primary-color, #4a9eff);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  border-radius: 12px;
  font-family: 'SF Mono', monospace;
}

.action-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 16px;
  transition: background 0.2s;
}

.action-btn:hover {
  background: var(--bg-hover, #2d2d44);
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 12px;
  color: var(--text-secondary, #888);
}

.empty-state .icon {
  font-size: 48px;
  opacity: 0.5;
}

.property-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.property-group {
  border-bottom: 1px solid var(--border-color, #2d2d44);
}

.group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  cursor: pointer;
  user-select: none;
  transition: background 0.2s;
}

.group-header:hover {
  background: var(--bg-hover, #2d2d44);
}

.expand-icon {
  font-size: 10px;
  color: var(--text-secondary, #888);
  width: 12px;
}

.group-name {
  font-weight: 500;
}

.group-content {
  padding: 0 16px 12px;
}
</style>
