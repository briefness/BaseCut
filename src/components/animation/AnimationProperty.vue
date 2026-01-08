<template>
  <div class="animation-property">
    <!-- 属性行 -->
    <div class="property-row">
      <!-- 关键帧指示器 -->
      <button 
        class="keyframe-toggle"
        :class="{ active: hasKeyframeAtCurrentTime }"
        @click="toggleKeyframeAtCurrentTime"
        :title="hasKeyframeAtCurrentTime ? '删除关键帧' : '添加关键帧'"
      >
        ◆
      </button>
      
      <!-- 属性标签 -->
      <span class="property-label">{{ label }}</span>
      
      <!-- 值输入 -->
      <div class="value-input-wrapper">
        <input
          type="number"
          class="value-input"
          v-model="localInputValue"
          :step="step"
          :min="min"
          :max="max"
          @focus="onInputFocus"
          @blur="commitValue"
          @keydown.enter="commitValue"
        />
        <span class="unit">{{ unit }}</span>
      </div>
      
      <!-- 关键帧导航 -->
      <div class="keyframe-nav">
        <button 
          class="nav-btn" 
          @click="goToPrevKeyframe"
          :disabled="!hasPrevKeyframe"
          title="上一个关键帧"
        >
          ◀
        </button>
        <button 
          class="nav-btn" 
          @click="goToNextKeyframe"
          :disabled="!hasNextKeyframe"
          title="下一个关键帧"
        >
          ▶
        </button>
      </div>
    </div>
    
    <!-- 关键帧时间线（可选展开） -->
    <div v-if="showTimeline" class="keyframe-timeline">
      <div 
        v-for="kf in sortedKeyframes" 
        :key="kf.id"
        class="keyframe-marker"
        :style="{ left: getKeyframePosition(kf.time) + '%' }"
        :class="{ active: isCurrentKeyframe(kf) }"
        @click="seekToKeyframe(kf.time)"
        :title="`${kf.time.toFixed(2)}s: ${kf.value}`"
      >
        ◆
      </div>
      <!-- 当前时间指示器 -->
      <div 
        class="time-indicator"
        :style="{ left: currentTimePosition + '%' }"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useAnimationStore } from '@/stores/animation'
import { useTimelineStore } from '@/stores/timeline'
import type { AnimatableProperty, Keyframe } from '@/types/animation'
import { getPropertyValue } from '@/engine/AnimationEngine'

// Props
const props = withDefaults(defineProps<{
  label: string
  property: AnimatableProperty
  clipId: string
  currentTime: number
  min?: number
  max?: number
  step?: number
  unit?: string
  valueMultiplier?: number
  showTimeline?: boolean
}>(), {
  min: -1000,
  max: 1000,
  step: 1,
  unit: '',
  valueMultiplier: 1,
  showTimeline: false
})

// Stores
const animationStore = useAnimationStore()
const timelineStore = useTimelineStore()

// 计算属性
const track = computed(() => {
  return animationStore.getTrack(props.clipId, props.property)
})

const sortedKeyframes = computed(() => {
  return track.value?.keyframes || []
})

const clipDuration = computed(() => {
  const clip = timelineStore.getClipById(props.clipId)
  return clip?.duration || 10
})

// 当前时间是否有关键帧
const hasKeyframeAtCurrentTime = computed(() => {
  if (!track.value) return false
  return track.value.keyframes.some(kf => 
    Math.abs(kf.time - props.currentTime) < 0.01
  )
})

// 当前关键帧
const currentKeyframe = computed(() => {
  if (!track.value) return null
  return track.value.keyframes.find(kf => 
    Math.abs(kf.time - props.currentTime) < 0.01
  )
})

// 插值后的当前值
const currentValue = computed(() => {
  if (!track.value || track.value.keyframes.length === 0) {
    return getDefaultValue()
  }
  return getPropertyValue(
    [track.value],
    props.property,
    props.currentTime
  )
})

// 显示值（应用乘数）
const displayValue = computed(() => {
  return (currentValue.value * props.valueMultiplier).toFixed(2)
})

// 本地输入值（用于编辑状态）
const localInputValue = ref(displayValue.value)
const isEditing = ref(false)

// 监听显示值变化，非编辑状态时同步到本地输入值
watch(displayValue, (newVal) => {
  if (!isEditing.value) {
    localInputValue.value = newVal
  }
})

// 是否有前一个关键帧
const hasPrevKeyframe = computed(() => {
  if (!track.value) return false
  return track.value.keyframes.some(kf => kf.time < props.currentTime - 0.01)
})

// 是否有后一个关键帧
const hasNextKeyframe = computed(() => {
  if (!track.value) return false
  return track.value.keyframes.some(kf => kf.time > props.currentTime + 0.01)
})

// 当前时间在时间线上的位置（百分比）
const currentTimePosition = computed(() => {
  return (props.currentTime / clipDuration.value) * 100
})

// 方法
function getDefaultValue(): number {
  const defaults: Record<string, number> = {
    'position.x': 0,
    'position.y': 0,
    'scale.x': 1,
    'scale.y': 1,
    'scale': 1,
    'rotation': 0,
    'opacity': 1,
    'anchor.x': 0,
    'anchor.y': 0
  }
  return defaults[props.property] ?? 0
}

function toggleKeyframeAtCurrentTime() {
  if (hasKeyframeAtCurrentTime.value && currentKeyframe.value) {
    // 删除关键帧
    animationStore.removeKeyframe(
      props.clipId,
      props.property,
      currentKeyframe.value.id
    )
  } else {
    // 添加关键帧
    animationStore.addKeyframe(
      props.clipId,
      props.property,
      {
        time: props.currentTime,
        value: currentValue.value
      }
    )
  }
}

function onInputFocus() {
  isEditing.value = true
}

// 提交值（在 blur 或 Enter 时调用）
function commitValue() {
  isEditing.value = false
  
  const rawValue = parseFloat(localInputValue.value)
  if (isNaN(rawValue)) {
    // 无效值，恢复为当前显示值
    localInputValue.value = displayValue.value
    return
  }
  
  // 还原乘数
  const actualValue = rawValue / props.valueMultiplier
  
  // 如果当前时间有关键帧，更新它
  if (hasKeyframeAtCurrentTime.value && currentKeyframe.value) {
    animationStore.updateKeyframe(
      props.clipId,
      props.property,
      currentKeyframe.value.id,
      { value: actualValue }
    )
  } else {
    // 否则创建新关键帧
    animationStore.addKeyframe(
      props.clipId,
      props.property,
      {
        time: props.currentTime,
        value: actualValue
      }
    )
  }
  
  // 更新本地值为格式化后的值
  localInputValue.value = (actualValue * props.valueMultiplier).toFixed(2)
}

function goToPrevKeyframe() {
  if (!track.value) return
  const prevKeyframes = track.value.keyframes.filter(kf => kf.time < props.currentTime - 0.01)
  if (prevKeyframes.length === 0) return
  
  const prevKf = prevKeyframes[prevKeyframes.length - 1]
  seekToKeyframe(prevKf.time)
}

function goToNextKeyframe() {
  if (!track.value) return
  const nextKeyframes = track.value.keyframes.filter(kf => kf.time > props.currentTime + 0.01)
  if (nextKeyframes.length === 0) return
  
  const nextKf = nextKeyframes[0]
  seekToKeyframe(nextKf.time)
}

function seekToKeyframe(time: number) {
  // 获取片段起始时间，转换为全局时间
  const clip = timelineStore.getClipById(props.clipId)
  if (!clip) return
  
  const globalTime = clip.startTime + time
  timelineStore.setCurrentTime(globalTime)
}

function getKeyframePosition(time: number): number {
  return (time / clipDuration.value) * 100
}

function isCurrentKeyframe(kf: Keyframe): boolean {
  return Math.abs(kf.time - props.currentTime) < 0.01
}
</script>

<style scoped>
.animation-property {
  margin-bottom: 8px;
}

.property-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
}

.keyframe-toggle {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--text-secondary, #666);
  cursor: pointer;
  font-size: 12px;
  border-radius: 4px;
  transition: all 0.2s;
}

.keyframe-toggle:hover {
  background: var(--bg-hover, #2d2d44);
  color: var(--text-primary, #fff);
}

.keyframe-toggle.active {
  color: var(--accent-color, #ffd700);
}

.property-label {
  width: 40px;
  font-size: 12px;
  color: var(--text-secondary, #888);
}

.value-input-wrapper {
  display: flex;
  align-items: center;
  flex: 1;
  max-width: 100px;
  background: var(--input-bg, #0d0d1a);
  border: 1px solid var(--border-color, #2d2d44);
  border-radius: 4px;
  padding: 0 8px;
}

.value-input {
  flex: 1;
  background: transparent;
  border: none;
  color: var(--text-primary, #fff);
  font-size: 12px;
  padding: 6px 0;
  width: 60px;
  outline: none;
}

/* 隐藏数字输入的箭头 */
.value-input::-webkit-outer-spin-button,
.value-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.unit {
  font-size: 11px;
  color: var(--text-secondary, #666);
}

.keyframe-nav {
  display: flex;
  gap: 2px;
}

.nav-btn {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--text-secondary, #666);
  cursor: pointer;
  font-size: 8px;
  border-radius: 3px;
  transition: all 0.2s;
}

.nav-btn:hover:not(:disabled) {
  background: var(--bg-hover, #2d2d44);
  color: var(--text-primary, #fff);
}

.nav-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* 关键帧时间线 */
.keyframe-timeline {
  position: relative;
  height: 16px;
  background: var(--bg-tertiary, #0d0d1a);
  border-radius: 3px;
  margin-top: 4px;
  margin-left: 32px;
}

.keyframe-marker {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  color: var(--text-secondary, #666);
  font-size: 10px;
  cursor: pointer;
  transition: color 0.2s;
}

.keyframe-marker:hover,
.keyframe-marker.active {
  color: var(--accent-color, #ffd700);
}

.time-indicator {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--primary-color, #4a9eff);
  transform: translateX(-50%);
}
</style>
