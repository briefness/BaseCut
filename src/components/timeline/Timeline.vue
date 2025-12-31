<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useTimelineStore } from '@/stores/timeline'
import { useResourceStore } from '@/stores/resource'
import ClipThumbnails from './ClipThumbnails.vue'
import ClipWaveform from './ClipWaveform.vue'
import type { Track, Clip } from '@/types'
import { DEFAULT_SUBTITLE_STYLE, DEFAULT_SUBTITLE_POSITION } from '@/types'

const timelineStore = useTimelineStore()
const resourceStore = useResourceStore()

// 时间线容器引用
const timelineRef = ref<HTMLDivElement | null>(null)
const rulerRef = ref<HTMLDivElement | null>(null)
const rulerScrollOffset = ref(0)  // 时间尺滚动偏移量

// 每秒像素数（根据缩放和容器宽度计算）
const pixelsPerSecond = computed(() => 50 * timelineStore.zoom)

// 时间线总宽度
const timelineWidth = computed(() => {
  const minDuration = Math.max(timelineStore.duration, 60) // 最少显示60秒
  return minDuration * pixelsPerSecond.value
})

// 播放头位置（拖拽时使用预览时间）
const playheadPosition = computed(() => {
  const time = timelineStore.isSeeking ? timelineStore.seekingTime : timelineStore.currentTime
  return time * pixelsPerSecond.value
})

// 拖拽状态
const isDraggingPlayhead = ref(false)
const isDraggingClip = ref(false)
const draggingClipId = ref<string | null>(null)
const dragStartX = ref(0)
const dragStartY = ref(0)
const dragStartTime = ref(0)
const dragSourceTrack = ref<Track | null>(null)
const trackHeight = 48 // 轨道高度与 CSS .track-row 保持一致

// 裁剪拖拽状态
const isTrimmingClip = ref(false)
const trimmingClipId = ref<string | null>(null)
const trimSide = ref<'left' | 'right'>('left')
const trimStartX = ref(0)
const trimStartInPoint = ref(0)
const trimStartOutPoint = ref(0)
const trimStartTime = ref(0)
const trimStartDuration = ref(0)

// 时间刻度标记
const timeMarkers = computed(() => {
  const markers: { time: number; label: string; major: boolean }[] = []
  const duration = Math.max(timelineStore.duration, 60)
  
  // 根据缩放级别选择刻度间隔
  let interval = 1 // 秒
  if (timelineStore.zoom < 0.5) interval = 10
  else if (timelineStore.zoom < 1) interval = 5
  else if (timelineStore.zoom > 2) interval = 0.5
  
  for (let t = 0; t <= duration; t += interval) {
    const isMajor = t % (interval * 5) === 0
    markers.push({
      time: t,
      label: formatTime(t),
      major: isMajor
    })
  }
  
  return markers
})

// 格式化时间
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// 获取轨道颜色
function getTrackColor(type: string): string {
  switch (type) {
    case 'video': return 'var(--track-video)'
    case 'audio': return 'var(--track-audio)'
    case 'text': return 'var(--track-text)'
    default: return 'var(--primary)'
  }
}

// 获取片段显示名称
function getClipName(clip: Clip): string {
  if (clip.subtitle?.text) return clip.subtitle.text.substring(0, 20)
  if (clip.text) return clip.text.substring(0, 20)
  if (clip.materialId) {
    const material = resourceStore.getMaterial(clip.materialId)
    return material?.name ?? '未知素材'
  }
  return '片段'
}

// 快速添加字幕
function addSubtitle() {
  // 找到或创建文字轨道
  let textTrack = timelineStore.tracks.find(t => t.type === 'text')
  if (!textTrack) {
    textTrack = timelineStore.addTrack('text', '字幕轨道')
  }
  
  // 计算新字幕的起始时间
  // 策略：取【当前时间】和【轨道上最后一个字幕结束时间】的较大值
  const trackClips = textTrack.clips
  const lastClipEndTime = trackClips.reduce((max: number, clip) => {
    return Math.max(max, clip.startTime + clip.duration)
  }, 0)
  
  const duration = 3 // 默认 3 秒
  // 如果当前时间在最后一个字幕内部或之前，则在最后一个字幕后添加
  // 如果当前时间在最后一个字幕之后，则在当前时间添加
  const startTime = Math.max(timelineStore.currentTime, lastClipEndTime)
  
  const clip = timelineStore.addClip(textTrack.id, {
    startTime,
    duration,
    inPoint: 0,
    outPoint: duration,
    effects: [],
    subtitle: {
      text: '输入字幕文本',
      style: { ...DEFAULT_SUBTITLE_STYLE },
      position: { ...DEFAULT_SUBTITLE_POSITION }
    }
  })
  
  // 选中新添加的字幕
  timelineStore.selectClip(clip.id)
}

// 点击时间标尺定位（立即跳转 + 显示帧）
function handleRulerClick(e: MouseEvent) {
  if (!rulerRef.value) return
  const rect = rulerRef.value.getBoundingClientRect()
  // rulerScrollOffset 已经通过 transform 处理了偏移，所以不需要再加
  const x = e.clientX - rect.left + rulerScrollOffset.value
  const time = Math.max(0, x / pixelsPerSecond.value)
  console.log('[Timeline] Ruler click:', { x, time, rulerScrollOffset: rulerScrollOffset.value })
  timelineStore.seek(time)
}

// 播放头拖拽（实时预览 + 实时跳转）
function startPlayheadDrag(e: MouseEvent) {
  e.preventDefault()
  isDraggingPlayhead.value = true
  timelineStore.startSeeking()
  document.addEventListener('mousemove', handlePlayheadDrag)
  document.addEventListener('mouseup', stopPlayheadDrag)
}

function handlePlayheadDrag(e: MouseEvent) {
  if (!isDraggingPlayhead.value || !timelineRef.value) return
  const rect = timelineRef.value.getBoundingClientRect()
  const x = e.clientX - rect.left + timelineRef.value.scrollLeft
  const time = Math.max(0, Math.min(x / pixelsPerSecond.value, timelineStore.duration))
  // 实时预览 + 实时跳转
  timelineStore.updateSeekingTime(time)
  timelineStore.seek(time)
}

function stopPlayheadDrag() {
  isDraggingPlayhead.value = false
  timelineStore.stopSeeking()
  document.removeEventListener('mousemove', handlePlayheadDrag)
  document.removeEventListener('mouseup', stopPlayheadDrag)
}

// 片段拖拽
function startClipDrag(e: MouseEvent, clip: Clip, track: Track) {
  if (track.locked) return
  
  e.preventDefault()
  isDraggingClip.value = true
  draggingClipId.value = clip.id
  dragStartX.value = e.clientX
  dragStartY.value = e.clientY
  dragStartTime.value = clip.startTime
  dragSourceTrack.value = track
  
  timelineStore.selectClip(clip.id)
  
  document.addEventListener('mousemove', handleClipDrag)
  document.addEventListener('mouseup', stopClipDrag)
}

function handleClipDrag(e: MouseEvent) {
  if (!isDraggingClip.value || !draggingClipId.value) return
  
  const deltaX = e.clientX - dragStartX.value
  const deltaTime = deltaX / pixelsPerSecond.value
  const newStartTime = Math.max(0, dragStartTime.value + deltaTime)
  
  timelineStore.moveClip(draggingClipId.value, newStartTime)
}

function stopClipDrag(e: MouseEvent) {
  if (isDraggingClip.value && draggingClipId.value && dragSourceTrack.value && timelineRef.value) {
    // 检测目标轨道
    const deltaY = e.clientY - dragStartY.value
    const trackIndexDelta = Math.round(deltaY / trackHeight)
    
    if (trackIndexDelta !== 0) {
      const sourceTrackIndex = timelineStore.tracks.findIndex(t => t.id === dragSourceTrack.value!.id)
      const targetTrackIndex = sourceTrackIndex + trackIndexDelta
      
      // 检查目标轨道是否有效
      if (targetTrackIndex >= 0 && targetTrackIndex < timelineStore.tracks.length) {
        const targetTrack = timelineStore.tracks[targetTrackIndex]
        const sourceTrack = dragSourceTrack.value
        
        // 只允许在相同类型的轨道之间移动，且目标轨道未锁定
        if (targetTrack.type === sourceTrack.type && !targetTrack.locked) {
          timelineStore.moveClipToTrack(draggingClipId.value, targetTrack.id)
        }
      }
    }
  }
  
  isDraggingClip.value = false
  draggingClipId.value = null
  dragSourceTrack.value = null
  document.removeEventListener('mousemove', handleClipDrag)
  document.removeEventListener('mouseup', stopClipDrag)
}

// 点击片段选中
function selectClip(clip: Clip) {
  timelineStore.selectClip(clip.id)
}

// ==================== 裁剪功能 ====================

// 开始裁剪拖拽
function startTrimDrag(e: MouseEvent, clip: Clip, side: 'left' | 'right') {
  e.preventDefault()
  e.stopPropagation()
  
  const track = timelineStore.tracks.find(t => t.clips.some(c => c.id === clip.id))
  if (track?.locked) return
  
  isTrimmingClip.value = true
  trimmingClipId.value = clip.id
  trimSide.value = side
  trimStartX.value = e.clientX
  trimStartInPoint.value = clip.inPoint
  trimStartOutPoint.value = clip.outPoint
  trimStartTime.value = clip.startTime
  trimStartDuration.value = clip.duration
  
  timelineStore.selectClip(clip.id)
  
  document.addEventListener('mousemove', handleTrimDrag)
  document.addEventListener('mouseup', stopTrimDrag)
}

// 处理裁剪拖拽
function handleTrimDrag(e: MouseEvent) {
  if (!isTrimmingClip.value || !trimmingClipId.value) return
  
  const deltaX = e.clientX - trimStartX.value
  const deltaTime = deltaX / pixelsPerSecond.value
  
  // 获取素材信息
  const clip = timelineStore.tracks
    .flatMap(t => t.clips)
    .find(c => c.id === trimmingClipId.value)
  if (!clip) return
  
  const material = clip.materialId ? resourceStore.getMaterial(clip.materialId) : null
  const materialDuration = material?.duration ?? clip.duration + clip.inPoint
  
  if (trimSide.value === 'left') {
    // 左侧裁剪：调整 inPoint 和 startTime
    const newInPoint = Math.max(0, trimStartInPoint.value + deltaTime)
    const maxInPoint = trimStartOutPoint.value - 0.1 // 至少保留 0.1 秒
    const clampedInPoint = Math.min(newInPoint, maxInPoint)
    
    const inPointDelta = clampedInPoint - trimStartInPoint.value
    const newStartTime = Math.max(0, trimStartTime.value + inPointDelta)
    const newDuration = trimStartDuration.value - inPointDelta
    
    if (newDuration > 0.1) {
      timelineStore.updateClip(trimmingClipId.value, {
        inPoint: clampedInPoint,
        startTime: newStartTime,
        duration: newDuration
      })
    }
  } else {
    // 右侧裁剪：调整 outPoint 和 duration
    const newOutPoint = Math.min(materialDuration, trimStartOutPoint.value + deltaTime)
    const minOutPoint = trimStartInPoint.value + 0.1 // 至少保留 0.1 秒
    const clampedOutPoint = Math.max(newOutPoint, minOutPoint)
    
    const newDuration = clampedOutPoint - trimStartInPoint.value
    
    if (newDuration > 0.1) {
      timelineStore.updateClip(trimmingClipId.value, {
        outPoint: clampedOutPoint,
        duration: newDuration
      })
    }
  }
}

// 停止裁剪拖拽
function stopTrimDrag() {
  isTrimmingClip.value = false
  trimmingClipId.value = null
  document.removeEventListener('mousemove', handleTrimDrag)
  document.removeEventListener('mouseup', stopTrimDrag)
}

// 删除片段
function deleteClip(clipId: string, e: Event) {
  e.stopPropagation()
  timelineStore.removeClip(clipId)
}

// 添加轨道
function addTrack(type: 'video' | 'audio' | 'text') {
  timelineStore.addTrack(type)
}

// 删除轨道
function removeTrack(trackId: string) {
  timelineStore.removeTrack(trackId)
}

// 素材拖拽状态
const dragOverTrackId = ref<string | null>(null)

// 处理素材拖拽到轨道
function handleTrackDragOver(e: DragEvent, track: Track) {
  if (track.locked) return
  
  // 检查是否是素材拖拽
  const data = e.dataTransfer?.types.includes('application/json')
  if (!data) return
  
  e.preventDefault()
  e.dataTransfer!.dropEffect = 'copy'
  dragOverTrackId.value = track.id
}

function handleTrackDragLeave(e: DragEvent, track: Track) {
  // 确保是离开当前轨道，而不是进入子元素
  const relatedTarget = e.relatedTarget as HTMLElement
  const trackElement = e.currentTarget as HTMLElement
  if (relatedTarget && trackElement.contains(relatedTarget)) return
  
  if (dragOverTrackId.value === track.id) {
    dragOverTrackId.value = null
  }
}

function handleTrackDrop(e: DragEvent, track: Track) {
  e.preventDefault()
  dragOverTrackId.value = null
  
  if (track.locked) return
  
  // 解析拖拽数据
  const jsonData = e.dataTransfer?.getData('application/json')
  if (!jsonData) return
  
  try {
    const data = JSON.parse(jsonData)
    if (data.type !== 'material') return
    
    // 检查素材类型是否匹配轨道类型
    const material = resourceStore.getMaterial(data.materialId)
    if (!material) return
    
    // 视频素材只能放到视频轨道，音频素材只能放到音频轨道
    if (material.type !== track.type) {
      console.warn(`素材类型 ${material.type} 与轨道类型 ${track.type} 不匹配`)
      return
    }
    
    // 计算新片段的开始时间（根据鼠标位置或放在轨道末尾）
    const trackElement = e.currentTarget as HTMLElement
    const rect = trackElement.getBoundingClientRect()
    const x = e.clientX - rect.left + (timelineRef.value?.scrollLeft ?? 0)
    const dropTime = x / pixelsPerSecond.value
    
    // 也可以选择放在最后一个片段之后
    // const lastClip = track.clips[track.clips.length - 1]
    // const startTime = lastClip ? lastClip.startTime + lastClip.duration : 0
    
    const startTime = Math.max(0, dropTime)
    
    // 添加片段
    timelineStore.addClip(track.id, {
      materialId: material.id,
      startTime,
      duration: material.duration ?? 5,
      inPoint: 0,
      outPoint: material.duration ?? 5,
      effects: []
    })
  } catch (err) {
    console.error('解析拖拽数据失败:', err)
  }
}

// 缩放控制
function handleZoom(delta: number) {
  timelineStore.setZoom(timelineStore.zoom + delta)
}

// 同步滚动
function syncScroll(e: Event) {
  const target = e.target as HTMLElement
  // 同步时间尺滚动偏移（使用 transform）
  rulerScrollOffset.value = target.scrollLeft
  if (timelineRef.value && target !== timelineRef.value) {
    timelineRef.value.scrollLeft = target.scrollLeft
  }
}

onMounted(() => {
  timelineRef.value?.addEventListener('scroll', syncScroll)
})

onUnmounted(() => {
  timelineRef.value?.removeEventListener('scroll', syncScroll)
})
</script>

<template>
  <div class="timeline">
    <!-- 工具栏 -->
    <div class="timeline-toolbar">
      <div class="toolbar-left">
        <!-- 添加轨道按钮 -->
        <div class="add-track-group">
          <button class="btn btn-ghost" @click="addTrack('video')">
            + 视频轨道
          </button>
          <button class="btn btn-ghost" @click="addTrack('audio')">
            + 音频轨道
          </button>
          <button class="btn btn-ghost" @click="addTrack('text')">
            + 文字轨道
          </button>
          <button class="btn btn-primary" @click="addSubtitle">
            📝 添加字幕
          </button>
        </div>
      </div>
      
      <div class="toolbar-right">
        <!-- 缩放控制 -->
        <div class="zoom-control">
          <button class="zoom-btn" @click="handleZoom(-0.2)">−</button>
          <span class="zoom-value">{{ Math.round(timelineStore.zoom * 100) }}%</span>
          <button class="zoom-btn" @click="handleZoom(0.2)">+</button>
        </div>
      </div>
    </div>

    <!-- 时间标尺 -->
    <div 
      class="time-ruler"
      ref="rulerRef"
      @click="handleRulerClick"
    >
      <div class="ruler-content" :style="{ width: `${timelineWidth}px`, transform: `translateX(-${rulerScrollOffset}px)` }">
        <div 
          v-for="marker in timeMarkers"
          :key="marker.time"
          class="time-marker"
          :class="{ major: marker.major }"
          :style="{ left: `${marker.time * pixelsPerSecond}px` }"
        >
          <span v-if="marker.major" class="marker-label">{{ marker.label }}</span>
        </div>
      </div>
    </div>

    <!-- 轨道区域 -->
    <div class="tracks-container">
      <!-- 轨道头部 -->
      <div class="track-headers">
        <div 
          v-for="track in timelineStore.tracks"
          :key="track.id"
          class="track-header"
          :class="{ locked: track.locked, muted: track.muted }"
        >
          <div class="track-info">
            <span 
              class="track-type-indicator"
              :style="{ background: getTrackColor(track.type) }"
            ></span>
            <span class="track-name">{{ track.name }}</span>
          </div>
          <div class="track-controls">
            <button 
              class="track-btn"
              :class="{ active: track.muted }"
              @click="timelineStore.toggleTrackMute(track.id)"
              title="静音"
            >
              {{ track.muted ? '🔇' : '🔊' }}
            </button>
            <button 
              class="track-btn"
              :class="{ active: track.locked }"
              @click="timelineStore.toggleTrackLock(track.id)"
              title="锁定"
            >
              {{ track.locked ? '🔒' : '🔓' }}
            </button>
            <button 
              class="track-btn delete"
              @click="removeTrack(track.id)"
              title="删除轨道"
            >
              ×
            </button>
          </div>
        </div>
        
        <!-- 空状态 -->
        <div v-if="timelineStore.tracks.length === 0" class="empty-tracks">
          点击上方按钮添加轨道
        </div>
      </div>

      <!-- 轨道内容 -->
      <div 
        class="track-content"
        ref="timelineRef"
      >
        <div 
          class="tracks-scroll-content"
          :style="{ width: `${timelineWidth}px` }"
        >
          <!-- 播放头 -->
          <div 
            class="playhead"
            :style="{ left: `${playheadPosition}px` }"
            @mousedown="startPlayheadDrag"
          >
            <div class="playhead-head"></div>
            <div class="playhead-line"></div>
          </div>

          <!-- 轨道 -->
          <div 
            v-for="track in timelineStore.tracks"
            :key="track.id"
            class="track-row"
            :class="{ 
              locked: track.locked,
              'drag-over': dragOverTrackId === track.id
            }"
            @dragover="handleTrackDragOver($event, track)"
            @dragleave="handleTrackDragLeave($event, track)"
            @drop="handleTrackDrop($event, track)"
          >
            <!-- 片段 -->
            <div 
              v-for="clip in track.clips"
              :key="clip.id"
              class="clip"
              :class="{ 
                selected: timelineStore.selectedClipId === clip.id,
                dragging: draggingClipId === clip.id,
                trimming: trimmingClipId === clip.id
              }"
              :style="{
                left: `${clip.startTime * pixelsPerSecond}px`,
                width: `${clip.duration * pixelsPerSecond}px`,
                background: getTrackColor(track.type)
              }"
              @click="selectClip(clip)"
              @mousedown="startClipDrag($event, clip, track)"
            >
              <!-- 帧预览（仅视频轨道） -->
              <ClipThumbnails 
                v-if="track.type === 'video'"
                :clip="clip"
                :pixels-per-second="pixelsPerSecond"
              />
              
              <!-- 波形预览（音频轨道） -->
              <ClipWaveform 
                v-if="track.type === 'audio'"
                :clip="clip"
                :pixels-per-second="pixelsPerSecond"
              />
              
              <!-- 裁剪手柄 -->
              <div 
                class="trim-handle left"
                @mousedown.stop="startTrimDrag($event, clip, 'left')"
              />
              <div 
                class="trim-handle right"
                @mousedown.stop="startTrimDrag($event, clip, 'right')"
              />
              
              <span class="clip-name">{{ getClipName(clip) }}</span>
              <button 
                class="clip-delete"
                @click="deleteClip(clip.id, $event)"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.timeline {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
}

/* 工具栏 */
.timeline-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-secondary);
  flex-shrink: 0;
}

.add-track-group {
  display: flex;
  gap: 4px;
}

.add-track-group .btn {
  font-size: 12px;
  padding: 4px 8px;
}

.zoom-control {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-tertiary);
  padding: 4px 8px;
  border-radius: var(--radius-md);
}

.zoom-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  font-size: 16px;
  color: var(--text-secondary);
}

.zoom-btn:hover {
  background: var(--bg-elevated);
  color: var(--text-primary);
}

.zoom-value {
  font-size: 12px;
  color: var(--text-secondary);
  min-width: 40px;
  text-align: center;
}

/* 时间标尺 */
.time-ruler {
  height: 28px;
  background: var(--bg-tertiary);
  border-bottom: 1px solid var(--border-secondary);
  overflow: hidden;  /* 禁用独立滚动，与轨道区域同步 */
  flex-shrink: 0;
  cursor: pointer;
  margin-left: 120px; /* 与轨道头部对齐 */
}

.time-ruler::-webkit-scrollbar {
  display: none;
}

.ruler-content {
  position: relative;
  height: 100%;
}

.time-marker {
  position: absolute;
  top: 0;
  height: 100%;
}

.time-marker::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  width: 1px;
  height: 8px;
  background: var(--border-primary);
}

.time-marker.major::after {
  height: 14px;
  background: var(--text-muted);
}

.marker-label {
  position: absolute;
  top: 4px;
  left: 4px;
  font-size: 10px;
  color: var(--text-muted);
  white-space: nowrap;
}

/* 轨道区域 */
.tracks-container {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.track-headers {
  width: 120px;
  flex-shrink: 0;
  background: var(--bg-tertiary);
  border-right: 1px solid var(--border-secondary);
  overflow-y: auto;
}

.track-header {
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px;
  border-bottom: 1px solid var(--border-secondary);
}

.track-header.locked {
  opacity: 0.6;
}

.track-header.muted {
  opacity: 0.5;
}

.track-info {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.track-type-indicator {
  width: 4px;
  height: 24px;
  border-radius: 2px;
  flex-shrink: 0;
}

.track-name {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.track-controls {
  display: flex;
  gap: 2px;
}

.track-btn {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  font-size: 10px;
  opacity: 0.5;
  transition: all var(--transition-fast);
}

.track-btn:hover {
  opacity: 1;
  background: var(--bg-elevated);
}

.track-btn.active {
  opacity: 1;
}

.track-btn.delete:hover {
  background: var(--error);
  color: white;
}

.empty-tracks {
  padding: 24px 12px;
  text-align: center;
  color: var(--text-muted);
  font-size: 12px;
}

/* 轨道内容 */
.track-content {
  flex: 1;
  overflow: auto;
  position: relative;
}

.tracks-scroll-content {
  position: relative;
  min-height: 100%;
}

.track-row {
  height: 48px;
  position: relative;
  border-bottom: 1px solid var(--border-secondary);
}

.track-row.locked {
  pointer-events: none;
  opacity: 0.6;
}

.track-row.drag-over {
  background: var(--primary-light);
  box-shadow: inset 0 0 0 2px var(--primary);
}

/* 片段 */
.clip {
  position: absolute;
  top: 4px;
  height: 40px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  padding: 0 8px;
  cursor: pointer;
  user-select: none;
  transition: all var(--transition-fast);
  overflow: hidden;
}

.clip:hover {
  filter: brightness(1.1);
}

.clip.selected {
  box-shadow: 0 0 0 2px white, 0 0 0 4px var(--primary);
}

.clip.dragging {
  opacity: 0.8;
  cursor: grabbing;
}

.clip-name {
  font-size: 11px;
  color: white;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}

.clip-delete {
  position: absolute;
  right: 4px;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 50%;
  color: white;
  font-size: 12px;
  opacity: 0;
  transition: opacity var(--transition-fast);
}

.clip:hover .clip-delete {
  opacity: 1;
}

.clip-delete:hover {
  background: var(--error);
}

/* 裁剪手柄 */
.trim-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 8px;
  cursor: ew-resize;
  z-index: 10;
  transition: background var(--transition-fast);
}

.trim-handle.left {
  left: 0;
  border-radius: var(--radius-md) 0 0 var(--radius-md);
}

.trim-handle.right {
  right: 0;
  border-radius: 0 var(--radius-md) var(--radius-md) 0;
}

.trim-handle:hover,
.clip.trimming .trim-handle {
  background: rgba(255, 255, 255, 0.3);
}

.trim-handle::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 2px;
  height: 16px;
  background: rgba(255, 255, 255, 0.6);
  border-radius: 1px;
  opacity: 0;
  transition: opacity var(--transition-fast);
}

.trim-handle:hover::after,
.clip.trimming .trim-handle::after {
  opacity: 1;
}

/* 播放头 */
.playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  z-index: 100;
  cursor: ew-resize;
  padding: 0 6px;
  margin-left: -6px;
}

.playhead-head {
  width: 12px;
  height: 12px;
  background: var(--error);
  border-radius: 2px;
  transform: translateX(-5px);
  clip-path: polygon(0 0, 100% 0, 100% 70%, 50% 100%, 0 70%);
}

.playhead-line {
  position: absolute;
  top: 12px;
  bottom: 0;
  left: 50%;
  width: 2px;
  background: var(--error);
  transform: translateX(-1px);
}
</style>
