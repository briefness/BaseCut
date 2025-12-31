<script setup lang="ts">
import { computed } from 'vue'
import { useTimelineStore } from '@/stores/timeline'
import type { Subtitle, SubtitleStyle, SubtitlePosition, SubtitleAnimation } from '@/types'
import { DEFAULT_SUBTITLE_STYLE, DEFAULT_SUBTITLE_POSITION } from '@/types'

const timelineStore = useTimelineStore()

// 当前选中的字幕片段
const selectedClip = computed(() => timelineStore.selectedClip)

// 判断是否是文字轨道
const isTextClip = computed(() => {
  if (!selectedClip.value) return false
  const track = timelineStore.tracks.find(t => t.id === selectedClip.value?.trackId)
  return track?.type === 'text'
})

// 当前字幕数据
const subtitle = computed(() => selectedClip.value?.subtitle)

// 更新字幕
function updateSubtitle(updates: Partial<Subtitle>) {
  if (!selectedClip.value) return
  
  const currentSubtitle = selectedClip.value.subtitle ?? {
    text: selectedClip.value.text ?? '',
    style: { ...DEFAULT_SUBTITLE_STYLE },
    position: { ...DEFAULT_SUBTITLE_POSITION }
  }
  
  timelineStore.updateClip(selectedClip.value.id, {
    subtitle: { ...currentSubtitle, ...updates }
  })
}

// 更新样式
function updateStyle(updates: Partial<SubtitleStyle>) {
  if (!selectedClip.value) return
  
  const currentStyle = subtitle.value?.style ?? { ...DEFAULT_SUBTITLE_STYLE }
  updateSubtitle({ style: { ...currentStyle, ...updates } })
}

// 更新位置
function updatePosition(updates: Partial<SubtitlePosition>) {
  if (!selectedClip.value) return
  
  const currentPosition = subtitle.value?.position ?? { ...DEFAULT_SUBTITLE_POSITION }
  updateSubtitle({ position: { ...currentPosition, ...updates } })
}

// 更新动画
function updateEnterAnimation(updates: Partial<SubtitleAnimation>) {
  if (!selectedClip.value) return
  
  const current = subtitle.value?.enterAnimation ?? { type: 'none', duration: 0.5 }
  updateSubtitle({ enterAnimation: { ...current, ...updates } })
}

function updateExitAnimation(updates: Partial<SubtitleAnimation>) {
  if (!selectedClip.value) return
  
  const current = subtitle.value?.exitAnimation ?? { type: 'none', duration: 0.5 }
  updateSubtitle({ exitAnimation: { ...current, ...updates } })
}

// 预设位置
const positionPresets = [
  { name: '顶部', x: 50, y: 15 },
  { name: '居中', x: 50, y: 50 },
  { name: '底部', x: 50, y: 85 }
]

// 入场动画选项（只包含有效的入场动画）
const enterAnimationOptions = [
  { value: 'none', label: '无' },
  { value: 'fadeIn', label: '淡入' },
  { value: 'typewriter', label: '打字机' },
  { value: 'slideUp', label: '上滑入' },
  { value: 'slideDown', label: '下滑入' },
  { value: 'scale', label: '缩放入' },
  { value: 'bounce', label: '弹跳入' }
]

// 出场动画选项（只包含有效的出场动画）
const exitAnimationOptions = [
  { value: 'none', label: '无' },
  { value: 'fadeOut', label: '淡出' },
  { value: 'slideUp', label: '上滑出' },
  { value: 'slideDown', label: '下滑出' },
  { value: 'scale', label: '缩放出' }
]

// 字体选项
const fontOptions = [
  'Microsoft YaHei',
  'PingFang SC',
  'SimHei',
  'SimSun',
  'KaiTi',
  'Arial',
  'Helvetica'
]
</script>

<template>
  <div v-if="isTextClip" class="subtitle-editor">
    <h3 class="section-title">字幕编辑</h3>
    
    <!-- 文本内容 -->
    <div class="form-group">
      <label>文本内容</label>
      <textarea 
        :value="subtitle?.text ?? selectedClip?.text ?? ''"
        @input="updateSubtitle({ text: ($event.target as HTMLTextAreaElement).value })"
        placeholder="输入字幕文本..."
        rows="3"
      />
    </div>
    
    <!-- 基础样式 -->
    <div class="form-section">
      <h4>样式</h4>
      
      <div class="form-row">
        <div class="form-group">
          <label>字体</label>
          <select 
            :value="subtitle?.style.fontFamily ?? 'Microsoft YaHei'"
            @change="updateStyle({ fontFamily: ($event.target as HTMLSelectElement).value })"
          >
            <option v-for="font in fontOptions" :key="font" :value="font">{{ font }}</option>
          </select>
        </div>
        
        <div class="form-group">
          <label>字号</label>
          <input 
            type="number" 
            :value="subtitle?.style.fontSize ?? 48"
            @input="updateStyle({ fontSize: Number(($event.target as HTMLInputElement).value) })"
            min="12" 
            max="200"
          />
        </div>
      </div>
      
      <div class="form-row">
        <div class="form-group">
          <label>颜色</label>
          <input 
            type="color" 
            :value="subtitle?.style.color ?? '#ffffff'"
            @input="updateStyle({ color: ($event.target as HTMLInputElement).value })"
          />
        </div>
        
        <div class="form-group">
          <label>粗体</label>
          <input 
            type="checkbox" 
            :checked="subtitle?.style.fontWeight === 'bold'"
            @change="updateStyle({ fontWeight: ($event.target as HTMLInputElement).checked ? 'bold' : 'normal' })"
          />
        </div>
        
        <div class="form-group">
          <label>斜体</label>
          <input 
            type="checkbox" 
            :checked="subtitle?.style.fontStyle === 'italic'"
            @change="updateStyle({ fontStyle: ($event.target as HTMLInputElement).checked ? 'italic' : 'normal' })"
          />
        </div>
      </div>
    </div>
    
    <!-- 描边 -->
    <div class="form-section">
      <div class="section-header">
        <h4>描边</h4>
        <input 
          type="checkbox" 
          :checked="subtitle?.style.strokeEnabled ?? true"
          @change="updateStyle({ strokeEnabled: ($event.target as HTMLInputElement).checked })"
        />
      </div>
      
      <div v-if="subtitle?.style.strokeEnabled !== false" class="form-row">
        <div class="form-group">
          <label>颜色</label>
          <input 
            type="color" 
            :value="subtitle?.style.strokeColor ?? '#000000'"
            @input="updateStyle({ strokeColor: ($event.target as HTMLInputElement).value })"
          />
        </div>
        
        <div class="form-group">
          <label>宽度</label>
          <input 
            type="number" 
            :value="subtitle?.style.strokeWidth ?? 2"
            @input="updateStyle({ strokeWidth: Number(($event.target as HTMLInputElement).value) })"
            min="0" 
            max="10"
          />
        </div>
      </div>
    </div>
    
    <!-- 阴影 -->
    <div class="form-section">
      <div class="section-header">
        <h4>阴影</h4>
        <input 
          type="checkbox" 
          :checked="subtitle?.style.shadowEnabled ?? false"
          @change="updateStyle({ shadowEnabled: ($event.target as HTMLInputElement).checked })"
        />
      </div>
      
      <div v-if="subtitle?.style.shadowEnabled" class="form-row">
        <div class="form-group">
          <label>颜色</label>
          <input 
            type="color" 
            :value="subtitle?.style.shadowColor ?? '#000000'"
            @input="updateStyle({ shadowColor: ($event.target as HTMLInputElement).value })"
          />
        </div>
        
        <div class="form-group">
          <label>模糊</label>
          <input 
            type="number" 
            :value="subtitle?.style.shadowBlur ?? 4"
            @input="updateStyle({ shadowBlur: Number(($event.target as HTMLInputElement).value) })"
            min="0" 
            max="20"
          />
        </div>
      </div>
    </div>
    
    <!-- 位置 -->
    <div class="form-section">
      <h4>位置</h4>
      
      <div class="position-presets">
        <button 
          v-for="preset in positionPresets" 
          :key="preset.name"
          @click="updatePosition({ x: preset.x, y: preset.y })"
          :class="{ active: subtitle?.position.x === preset.x && subtitle?.position.y === preset.y }"
        >
          {{ preset.name }}
        </button>
      </div>
    </div>
    
    <!-- 动画 -->
    <div class="form-section">
      <h4>动画效果</h4>
      
      <div class="animation-grid">
        <div class="form-group">
          <label>入场动画</label>
          <select 
            :value="subtitle?.enterAnimation?.type ?? 'none'"
            @change="updateEnterAnimation({ type: ($event.target as HTMLSelectElement).value as any })"
          >
            <option v-for="opt in enterAnimationOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </div>
        
        <div class="form-group" v-if="subtitle?.enterAnimation?.type && subtitle?.enterAnimation?.type !== 'none'">
          <label>入场时长(s)</label>
          <input 
            type="number" 
            :value="subtitle?.enterAnimation?.duration ?? 0.5"
            @input="updateEnterAnimation({ duration: Number(($event.target as HTMLInputElement).value) })"
            min="0.1" 
            max="3"
            step="0.1"
          />
        </div>
        
        <div class="form-group">
          <label>出场动画</label>
          <select 
            :value="subtitle?.exitAnimation?.type ?? 'none'"
            @change="updateExitAnimation({ type: ($event.target as HTMLSelectElement).value as any })"
          >
            <option v-for="opt in exitAnimationOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </div>
        
        <div class="form-group" v-if="subtitle?.exitAnimation?.type && subtitle?.exitAnimation?.type !== 'none'">
          <label>出场时长(s)</label>
          <input 
            type="number" 
            :value="subtitle?.exitAnimation?.duration ?? 0.5"
            @input="updateExitAnimation({ duration: Number(($event.target as HTMLInputElement).value) })"
            min="0.1" 
            max="3"
            step="0.1"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ==================== 容器 ==================== */
.subtitle-editor {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  margin: 0;
  color: var(--text-primary);
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}

/* ==================== 表单分组 ==================== */
.form-section {
  background: var(--bg-secondary);
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.form-section h4 {
  font-size: 12px;
  font-weight: 600;
  margin: 0;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

/* ==================== 表单项 ==================== */
.form-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-group label {
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 500;
}

.form-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
  gap: 10px;
}

/* ==================== 文本域 ==================== */
textarea {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  font-size: 13px;
  resize: vertical;
  min-height: 60px;
  transition: border-color 0.2s, box-shadow 0.2s;
}

textarea:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.15);
}

/* ==================== 输入框 & 选择器 ==================== */
input[type="number"],
input[type="text"],
select {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  font-size: 12px;
  transition: border-color 0.2s, box-shadow 0.2s;
}

input[type="number"]:focus,
input[type="text"]:focus,
select:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.15);
}

/* ==================== 颜色选择器 ==================== */
input[type="color"] {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 36px;
  padding: 3px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-tertiary);
  cursor: pointer;
  transition: border-color 0.2s;
}

input[type="color"]::-webkit-color-swatch-wrapper {
  padding: 0;
}

input[type="color"]::-webkit-color-swatch {
  border: none;
  border-radius: 4px;
}

input[type="color"]:hover {
  border-color: var(--primary);
}

/* ==================== 自定义 Toggle Switch ==================== */
input[type="checkbox"] {
  -webkit-appearance: none;
  appearance: none;
  width: 36px;
  height: 20px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 10px;
  position: relative;
  cursor: pointer;
  transition: all 0.2s;
}

input[type="checkbox"]::before {
  content: '';
  position: absolute;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  top: 2px;
  left: 2px;
  background: var(--text-muted);
  transition: all 0.2s;
}

input[type="checkbox"]:checked {
  background: var(--primary);
  border-color: var(--primary);
}

input[type="checkbox"]:checked::before {
  left: 18px;
  background: white;
}

/* ==================== 位置预设按钮 ==================== */
.position-presets {
  display: flex;
  gap: 6px;
}

.position-presets button {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.position-presets button:hover {
  background: var(--bg-secondary);
  border-color: var(--primary);
  color: var(--text-primary);
}

.position-presets button.active {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}

/* ==================== 动画网格 ==================== */
.animation-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

/* ==================== 响应式 ==================== */
@media (max-width: 360px) {
  .form-row {
    grid-template-columns: 1fr;
  }
  
  .animation-grid {
    grid-template-columns: 1fr;
  }
}
</style>

