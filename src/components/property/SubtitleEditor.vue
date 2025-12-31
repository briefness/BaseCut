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

// 动画选项
const animationOptions = [
  { value: 'none', label: '无' },
  { value: 'fadeIn', label: '淡入' },
  { value: 'fadeOut', label: '淡出' },
  { value: 'typewriter', label: '打字机' },
  { value: 'slideUp', label: '上滑' },
  { value: 'slideDown', label: '下滑' },
  { value: 'scale', label: '缩放' },
  { value: 'bounce', label: '弹跳' }
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
      <h4>动画</h4>
      
      <div class="form-row">
        <div class="form-group">
          <label>入场</label>
          <select 
            :value="subtitle?.enterAnimation?.type ?? 'none'"
            @change="updateEnterAnimation({ type: ($event.target as HTMLSelectElement).value as any })"
          >
            <option v-for="opt in animationOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </div>
        
        <div class="form-group">
          <label>出场</label>
          <select 
            :value="subtitle?.exitAnimation?.type ?? 'none'"
            @change="updateExitAnimation({ type: ($event.target as HTMLSelectElement).value as any })"
          >
            <option v-for="opt in animationOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.subtitle-editor {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  color: var(--text-primary);
}

.form-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-section h4 {
  font-size: 13px;
  font-weight: 500;
  margin: 0;
  color: var(--text-secondary);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-group label {
  font-size: 12px;
  color: var(--text-muted);
}

.form-row {
  display: flex;
  gap: 12px;
}

.form-row .form-group {
  flex: 1;
}

textarea {
  width: 100%;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 13px;
  resize: vertical;
}

input[type="number"],
input[type="text"],
select {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 13px;
}

input[type="color"] {
  width: 100%;
  height: 32px;
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-secondary);
  cursor: pointer;
}

input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.position-presets {
  display: flex;
  gap: 8px;
}

.position-presets button {
  flex: 1;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.position-presets button:hover {
  background: var(--bg-tertiary);
}

.position-presets button.active {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}
</style>
