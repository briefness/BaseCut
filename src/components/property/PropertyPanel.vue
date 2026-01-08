<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useTimelineStore } from '@/stores/timeline'
import { useResourceStore } from '@/stores/resource'
import { useProjectStore } from '@/stores/project'
import { useEffectsStore } from '@/stores/effects'
import SubtitleEditor from './SubtitleEditor.vue'
import EffectPanel from '../effect/EffectPanel.vue'
import EffectProperty from '../effect/EffectProperty.vue'
import AnimationPanel from '../animation/AnimationPanel.vue'
import { TRANSITION_PRESETS, type TransitionType } from '@/types'

const timelineStore = useTimelineStore()
const resourceStore = useResourceStore()
const projectStore = useProjectStore()
const effectsStore = useEffectsStore()

// 当前激活的 Tab：'property' | 'effect' | 'animation'
const activeTab = ref<'property' | 'effect' | 'animation'>('property')

// 选中的片段
const selectedClip = computed(() => timelineStore.selectedClip)

// 选中片段对应的素材
const selectedMaterial = computed(() => {
  if (!selectedClip.value?.materialId) return null
  return resourceStore.getMaterial(selectedClip.value.materialId)
})

// 选中片段所属的轨道类型
const selectedTrackType = computed(() => {
  if (!selectedClip.value) return null
  const track = timelineStore.tracks.find(t => t.id === selectedClip.value?.trackId)
  return track?.type ?? null
})

// 是否是字幕片段
const isTextClip = computed(() => selectedTrackType.value === 'text')

// 是否是音频片段
const isAudioClip = computed(() => selectedTrackType.value === 'audio')

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

// 是否是视频片段（基于轨道类型）
const isVideoClip = computed(() => selectedTrackType.value === 'video')

// 是否支持特效（仅视频素材支持）
const hasEffects = computed(() => selectedMaterial.value?.type === 'video')

// 获取下一个相邻片段（用于转场设置）
const nextClip = computed(() => {
  if (!selectedClip.value || !isVideoClip.value) return null
  
  const track = timelineStore.tracks.find(t => t.id === selectedClip.value?.trackId)
  if (!track) return null
  
  const sortedClips = [...track.clips].sort((a, b) => a.startTime - b.startTime)
  const currentIndex = sortedClips.findIndex(c => c.id === selectedClip.value?.id)
  if (currentIndex === -1 || currentIndex === sortedClips.length - 1) return null
  
  const next = sortedClips[currentIndex + 1]
  // 检查是否相邻（允许 1 秒间隙）
  const gap = next.startTime - (selectedClip.value!.startTime + selectedClip.value!.duration)
  if (gap <= 1) return next
  return null
})

// 当前转场效果
const currentTransition = computed(() => {
  if (!selectedClip.value || !nextClip.value) return null
  return timelineStore.getTransitionBetween(selectedClip.value.id, nextClip.value.id)
})

// 转场时长
const transitionDuration = ref(0.5)

// 选择转场效果
function selectTransition(type: TransitionType): void {
  if (!selectedClip.value || !nextClip.value) return
  timelineStore.addTransition(selectedClip.value.id, nextClip.value.id, type, transitionDuration.value)
  projectStore.markDirty()
}

// 移除转场
function removeTransition(): void {
  if (currentTransition.value) {
    timelineStore.removeTransition(currentTransition.value.id)
    projectStore.markDirty()
  }
}

// 删除片段
function deleteClip() {
  if (!selectedClip.value) return
  timelineStore.removeClip(selectedClip.value.id)
}

// 自动重置 Tab：当选中不支持特效或动画的片段时，强制切回属性页
watch(selectedClip, () => {
  // 如果当前 tab 是特效，但新选中的片段不支持特效，切回属性页
  if (!hasEffects.value && activeTab.value === 'effect') {
    activeTab.value = 'property'
  }
  // 如果当前 tab 是动画，但新选中的片段不是视频（不支持动画），切回属性页
  if (!isVideoClip.value && activeTab.value === 'animation') {
    activeTab.value = 'property'
  }
})
</script>

<template>
  <div class="property-panel">
    <!-- 顶部导航 Tab -->
    <div class="panel-tabs">
      <button 
        class="tab-btn" 
        :class="{ active: activeTab === 'property' }"
        @click="activeTab = 'property'"
      >
        <span class="tab-icon">📋</span>属性
      </button>
      <button 
        v-if="hasEffects"
        class="tab-btn" 
        :class="{ active: activeTab === 'effect' }"
        @click="activeTab = 'effect'"
      >
        <span class="tab-icon">✨</span>特效
      </button>
      <button 
        v-if="isVideoClip"
        class="tab-btn" 
        :class="{ active: activeTab === 'animation' }"
        @click="activeTab = 'animation'"
      >
        <span class="tab-icon">🎬</span>动画
      </button>
      
      <div class="tab-spacer"></div>
      
      <button 
        class="tab-icon-btn" 
        title="项目设置"
        @click="{ activeTab = 'property'; timelineStore.selectClip(null); }"
      >
        ⚙️
      </button>
    </div>

    <!-- 属性内容区 -->
    <div v-show="activeTab === 'property'" class="panel-content scrollbar-hide">
      
      <!-- 场景1：未选中片段 -> 显示项目设置 (Contextual Layout) -->
      <transition name="fade-slide" mode="out-in">
        <div v-if="!selectedClip" class="context-panel project-settings" key="project-settings">
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

        <!-- 场景2：选中片段 -> 显示片段属性 -->
        <div v-else class="context-panel clip-properties" key="clip-properties">
          <!-- 面板头部：片段信息概览 -->
          <div class="panel-header-lg">
            <div class="clip-meta">
              <span class="clip-type-tag" :class="selectedMaterial?.type">
                {{ selectedMaterial?.type === 'video' ? 'VIDEO' : 
                   selectedMaterial?.type === 'audio' ? 'AUDIO' : 
                   selectedMaterial?.type === 'image' ? 'IMAGE' : 'TEXT' }}
              </span>
              <h3 class="clip-name" :title="selectedMaterial?.name">{{ selectedMaterial?.name || '未命名片段' }}</h3>
            </div>
          </div>

          <!-- 基础属性组 -->
          <div class="panel-group">
            <div class="group-title">基础属性</div>
            <div class="control-grid">
              
              <!-- 混合排版：时间控制 -->
              <div class="control-item full-width">
                <label>时间范围</label>
                <div class="time-range-display">
                  <div class="time-block">
                    <span class="label">入点</span>
                    <span class="value">{{ formatDuration(selectedClip.inPoint) }}</span>
                  </div>
                  <div class="divider">→</div>
                  <div class="time-block">
                    <span class="label">出点</span>
                    <span class="value">{{ formatDuration(selectedClip.outPoint) }}</span>
                  </div>
                </div>
              </div>

              <div class="control-item">
                <label>时长</label>
                <div class="input-wrapper suffix">
                  <input 
                    type="number"
                    class="custom-input"
                    :value="selectedClip.duration.toFixed(2)"
                    step="0.1"
                    min="0.1"
                    @change="(e) => updateClipProperty('duration', Number((e.target as HTMLInputElement).value))"
                  />
                  <span class="suffix-text">s</span>
                </div>
              </div>
              
               <div class="control-item">
                <label>开始</label>
                <div class="input-wrapper suffix">
                  <input 
                    type="number"
                    class="custom-input"
                    :value="selectedClip.startTime.toFixed(2)"
                     step="0.1"
                     min="0"
                    @change="(e) => updateClipProperty('startTime', Number((e.target as HTMLInputElement).value))"
                  />
                  <span class="suffix-text">s</span>
                </div>
              </div>

            </div>
          </div>

          <!-- 音频属性组 (仅音频/视频轨道显示) -->
          <div v-if="isAudioClip || isVideoClip" class="panel-group">
            <div class="group-title">音频设置</div>
            <div class="control-grid">
              <div class="control-item full-width">
                <div class="flex-label">
                  <label>音量</label>
                  <span class="value-display">{{ selectedClip.volume ?? (isAudioClip ? 40 : 100) }}%</span>
                </div>
                <div class="slider-wrapper">
                  <input 
                    type="range"
                    class="custom-slider"
                    :value="selectedClip.volume ?? (isAudioClip ? 40 : 100)"
                    min="0"
                    max="200"
                    step="1"
                    @input="(e) => updateClipProperty('volume', Number((e.target as HTMLInputElement).value))"
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- 转场设置 (仅视频显示) -->
          <div v-if="isVideoClip && nextClip" class="panel-group">
            <div class="group-title">
              <span>转场效果</span>
              <span v-if="currentTransition" class="badge-active">已应用</span>
            </div>
            
            <div class="transition-selector">
              <div 
                v-for="preset in TRANSITION_PRESETS"
                :key="preset.type"
                class="transition-option"
                :class="{ active: currentTransition?.type === preset.type }"
                @click="selectTransition(preset.type)"
                :title="preset.name"
              >
                <span class="icon">{{ preset.icon }}</span>
                <span class="name">{{ preset.name }}</span>
              </div>
            </div>
            
            <div v-if="currentTransition" class="control-row mt-2">
               <button class="btn-text danger" @click="removeTransition">
                 🗑️移除转场
               </button>
            </div>
          </div>

          <!-- 字幕编辑器 (仅文字显示) -->
          <div v-if="isTextClip" class="panel-group">
             <div class="group-title">字幕内容</div>
             <SubtitleEditor />
          </div>

          <!-- 底部操作栏 -->
          <div class="panel-actions">
            <button 
              v-if="!isTextClip"
              class="action-btn secondary"
              @click="timelineStore.splitClip(selectedClip.id, timelineStore.currentTime)"
            >
              ✂️ 分割
            </button>
            <button 
              class="action-btn danger"
              @click="deleteClip"
            >
              🗑️ 删除
            </button>
          </div>

        </div>
      </transition>
    </div>

    <!-- 特效面板 (现有代码，简单包裹即可) -->
    <div v-show="activeTab === 'effect'" class="effect-panel-container">
      <div class="effect-sections">
        <div class="effect-section">
          <h4>添加特效</h4>
          <EffectPanel />
        </div>
        
        <div v-if="effectsStore.selectedEffect" class="effect-section">
          <h4>参数调节</h4>
          <EffectProperty />
        </div>

        <div v-if="selectedClip" class="effect-section">
          <h4>已添加特效 ({{ effectsStore.getClipEffects(selectedClip.id).length }})</h4>
          <div class="effect-list">
            <div 
              v-for="effect in effectsStore.getClipEffects(selectedClip.id)"
              :key="effect.id"
              class="effect-item"
              :class="{ active: effectsStore.selectedEffectId === effect.id }"
              @click="effectsStore.selectEffect(effect.id)"
            >
               <span class="effect-icon-mini">⚡</span>
               <div class="effect-info">
                  <span class="effect-name">{{ effect.name }}</span>
                  <span class="effect-dur">{{ effect.startTime.toFixed(1) }}s - {{ (effect.startTime + effect.duration).toFixed(1) }}s</span>
               </div>
              <button class="effect-delete-mini" @click.stop="effectsStore.removeEffect(effect.id)">×</button>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 动画面板 -->
    <div v-show="activeTab === 'animation'" class="animation-panel-container">
      <AnimationPanel />
    </div>
  </div>
</template>

<style scoped>
.property-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: var(--text-primary);
  overflow: hidden;
}

/* 顶部导航 Tab */
.panel-tabs {
  display: flex;
  height: 40px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-secondary);
  padding: 0 4px;
  flex-shrink: 0;
}

.tab-btn {
  flex: 1;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  position: relative;
}

.tab-btn:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.tab-btn.active {
  color: var(--primary);
  font-weight: 600;
}

.tab-btn.active::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 0;
  width: 100%;
  height: 2px;
  background: var(--primary);
}

.tab-icon {
  font-size: 14px;
}

.tab-spacer {
  flex: 1;
}

.tab-icon-btn {
  width: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  color: var(--text-secondary);
  transition: all 0.2s;
  border-left: 1px solid var(--border-secondary);
}

.tab-icon-btn:hover {
  background: var(--bg-tertiary); /* using tertiary instead of hover var if not defined, but hover should be fine */
  color: var(--text-primary);
}

/* 内容区域 */
.panel-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  position: relative;
}

/* 特效面板容器：独立布局，内部管理滚动 */
.effect-panel-container {
  flex: 1;
  overflow-y: auto; /* 允许垂直滚动 */
  overflow-x: hidden; /* 强制禁止横向滚动 */
  display: flex;
  flex-direction: column;
  position: relative;
}

/* 动画面板容器 */
.animation-panel-container {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
}

.scrollbar-hide::-webkit-scrollbar {
  display: none; /* Chrome/Safari/Webkit */
}
.scrollbar-hide {
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE 10+ */
}

/* 通用面板容器 */
.context-panel {
  padding: 0 0 40px 0;
  animation: fadeIn 0.3s ease;
  transform: translateZ(0); /* 开启硬件加速 */
  will-change: opacity;
}

/* 面板头部 */
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

/* 片段元数据头部 */
.clip-meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.clip-type-tag {
  align-self: flex-start;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 3px;
  text-transform: uppercase;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
}

.clip-type-tag.video { color: #60a5fa; background: rgba(96, 165, 250, 0.1); }
.clip-type-tag.audio { color: #34d399; background: rgba(52, 211, 153, 0.1); }
.clip-type-tag.text { color: #fbbf24; background: rgba(251, 191, 36, 0.1); }

.clip-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 分组容器 */
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
  display: flex;
  align-items: center;
  justify-content: space-between;
}

/* 网格布局系统 */
.control-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 10px;
}

.control-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.control-item.full-width {
  grid-column: span 2;
}

.control-item label {
  font-size: 11px;
  color: var(--text-secondary);
}

/* 自定义控件样式 */
.select-wrapper, .input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  background: var(--bg-tertiary);
  border-radius: 4px;
  transition: box-shadow 0.2s;
  height: 26px;
}

.input-wrapper:hover, .select-wrapper:hover {
  background: var(--bg-hover);
}

.input-wrapper:focus-within, .select-wrapper:focus-within {
  box-shadow: 0 0 0 1.5px var(--primary-light);
  background: var(--bg-tertiary);
}

.custom-input, .custom-select {
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

/* 时间范围显示 */
.time-range-display {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--bg-tertiary);
  padding: 4px 10px;
  border-radius: 4px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
}

.time-block {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.time-block .label {
  font-size: 8px;
  color: var(--text-muted);
  margin-bottom: 1px;
}

.divider {
  color: var(--text-muted);
  font-size: 11px;
}

/* 滑块样式 */
.flex-label {
  display: flex;
  justify-content: space-between;
  margin-bottom: 2px;
}

.value-display {
  font-size: 11px;
  color: var(--text-primary);
  font-family: monospace;
}

.slider-wrapper {
  height: 24px;
  display: flex;
  align-items: center;
}

.custom-slider {
  width: 100%;
  -webkit-appearance: none;
  height: 3px;
  background: var(--bg-tertiary);
  border-radius: 2px;
  outline: none;
  appearance: none;
}

.custom-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--primary);
  cursor: pointer;
  transition: transform 0.1s;
}

.custom-slider::-webkit-slider-thumb:hover {
  transform: scale(1.2);
}

/* 转场选择 */
.transition-selector {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  margin-top: 6px;
}

.transition-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 6px;
  background: var(--bg-tertiary);
  border-radius: 4px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.2s;
}

.transition-option:hover {
  background: var(--bg-hover);
}

.transition-option.active {
  border-color: var(--primary);
  background: var(--primary-light);
}

.transition-option .icon {
  font-size: 16px;
  margin-bottom: 2px;
}

.transition-option .name {
  font-size: 10px;
  color: var(--text-secondary);
}

.badge-active {
  font-size: 9px;
  background: var(--primary);
  color: white;
  padding: 1px 4px;
  border-radius: 2px;
}

/* 操作按钮 */
.panel-actions {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.action-btn {
  width: 100%;
  padding: 6px;
  border-radius: 4px;
  border: none;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn.secondary {
  background: var(--bg-elevated);
  color: var(--text-primary);
  border: 1px solid var(--border-primary);
}

.action-btn.danger {
  background: rgba(239, 68, 68, 0.1);
  color: var(--error);
}

.action-btn:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
}

.action-btn:active {
  transform: translateY(0);
}

/* 提示信息 */
.group-info {
  margin-top: 10px;
  font-size: 10px;
  color: var(--text-muted);
  line-height: 1.4;
  background: var(--bg-tertiary);
  padding: 8px;
  border-radius: 4px;
}

.btn-text {
  background: none;
  border: none;
  font-size: 11px;
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
}

.btn-text.danger {
  color: var(--error);
}

.mt-2 { margin-top: 8px; }

/* Transition Animations */
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.2s ease;
}

.fade-slide-enter-from {
  opacity: 0;
  transform: translateX(5px);
}

.fade-slide-leave-to {
  opacity: 0;
  transform: translateX(-5px);
}

/* Effect Panel Styles */

.effect-sections {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.effect-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.effect-item {
  display: flex;
  align-items: center;
  padding: 6px 8px;
  background: var(--bg-tertiary);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid transparent;
}

.effect-item:hover {
  background: var(--bg-hover);
}

.effect-item.active {
  background: var(--primary-light);
  border-color: var(--primary);
}

.effect-icon-mini {
  font-size: 12px;
  margin-right: 6px;
  opacity: 0.7;
}

.effect-info {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.effect-name {
  font-size: 12px;
  font-weight: 500;
}

.effect-dur {
  font-size: 9px;
  color: var(--text-muted);
}

.effect-delete-mini {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
}

.effect-delete-mini:hover {
  background: rgba(239, 68, 68, 0.1);
  color: var(--error);
}

/* Keyframes */
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>
