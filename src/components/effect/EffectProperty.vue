<script setup lang="ts">
/**
 * 特效属性调节面板
 * 
 * 根据选中特效类型动态生成参数调节控件
 * 支持：
 * - 滑块调节
 * - 颜色选择
 * - 开关控制
 * - 时间范围调节
 */

import { computed } from 'vue'
import { useEffectsStore } from '@/stores/effects'
import { getEffectPreset, type VideoEffectType } from '@/types/effects'

const effectsStore = useEffectsStore()

// 当前选中的特效
const selectedEffect = computed(() => effectsStore.selectedEffect)

// 特效预设（用于获取参数定义）
const preset = computed(() => {
  if (!selectedEffect.value) return null
  return getEffectPreset(selectedEffect.value.type)
})

// 参数定义（根据特效类型确定可调节的参数）
const paramDefinitions = computed(() => {
  if (!selectedEffect.value) return []
  
  const type = selectedEffect.value.type
  return getParamDefinitions(type)
})

/**
 * 获取特效的参数定义
 */
function getParamDefinitions(type: VideoEffectType): ParamDefinition[] {
  const definitions: Record<VideoEffectType, ParamDefinition[]> = {
    flash: [
      { name: 'intensity', label: '强度', type: 'slider', min: 0, max: 1, step: 0.01 },
      { name: 'color', label: '颜色', type: 'color' }
    ],
    shake: [
      { name: 'intensity', label: '强度', type: 'slider', min: 0, max: 1, step: 0.01 },
      { name: 'frequency', label: '频率', type: 'slider', min: 1, max: 60, step: 1 },
      { name: 'direction', label: '方向', type: 'select', options: [
        { value: 'horizontal', label: '水平' },
        { value: 'vertical', label: '垂直' },
        { value: 'both', label: '双向' }
      ]}
    ],
    glitch: [
      { name: 'intensity', label: '强度', type: 'slider', min: 0, max: 1, step: 0.01 },
      { name: 'rgbSplit', label: 'RGB分离', type: 'slider', min: 0, max: 1, step: 0.01 },
      { name: 'scanlineIntensity', label: '扫描线', type: 'slider', min: 0, max: 1, step: 0.01 },
      { name: 'blockGlitch', label: '块状故障', type: 'toggle' }
    ],
    radialBlur: [
      { name: 'intensity', label: '强度', type: 'slider', min: 0, max: 1, step: 0.01 },
      { name: 'centerX', label: '中心X', type: 'slider', min: 0, max: 1, step: 0.01 },
      { name: 'centerY', label: '中心Y', type: 'slider', min: 0, max: 1, step: 0.01 },
      { name: 'samples', label: '品质', type: 'slider', min: 8, max: 32, step: 1 }
    ],
    chromatic: [
      { name: 'intensity', label: '强度', type: 'slider', min: 0, max: 1, step: 0.01 },
      { name: 'angle', label: '角度', type: 'slider', min: 0, max: 360, step: 1 }
    ],
    pixelate: [
      { name: 'pixelSize', label: '像素大小', type: 'slider', min: 1, max: 100, step: 1 }
    ],
    invert: [
      { name: 'intensity', label: '强度', type: 'slider', min: 0, max: 1, step: 0.01 }
    ],
    filmGrain: [
      { name: 'grainIntensity', label: '噪点', type: 'slider', min: 0, max: 1, step: 0.01 },
      { name: 'scratchIntensity', label: '划痕', type: 'slider', min: 0, max: 1, step: 0.01 },
      { name: 'flickerIntensity', label: '闪烁', type: 'slider', min: 0, max: 1, step: 0.01 },
      { name: 'sepiaAmount', label: '复古', type: 'slider', min: 0, max: 1, step: 0.01 }
    ],
    vignette: [
      { name: 'intensity', label: '强度', type: 'slider', min: 0, max: 1, step: 0.01 },
      { name: 'radius', label: '半径', type: 'slider', min: 0, max: 1, step: 0.01 },
      { name: 'softness', label: '柔和度', type: 'slider', min: 0, max: 1, step: 0.01 }
    ],
    splitScreen: [
      { name: 'splitCount', label: '分屏数', type: 'select', options: [
        { value: 2, label: '2分屏' },
        { value: 3, label: '3分屏' },
        { value: 4, label: '4分屏' }
      ]},
      { name: 'direction', label: '方向', type: 'select', options: [
        { value: 'horizontal', label: '水平' },
        { value: 'vertical', label: '垂直' },
        { value: 'grid', label: '网格' }
      ]},
      { name: 'gap', label: '间隙', type: 'slider', min: 0, max: 20, step: 1 }
    ]
  }
  
  return definitions[type] || []
}

interface ParamDefinition {
  name: string
  label: string
  type: 'slider' | 'color' | 'toggle' | 'select'
  min?: number
  max?: number
  step?: number
  options?: { value: string | number; label: string }[]
}

/**
 * 更新参数值
 */
function handleParamChange(name: string, value: number | string | boolean) {
  if (!selectedEffect.value) return
  effectsStore.updateEffectParam(selectedEffect.value.id, name, value)
}

/**
 * 更新时间范围
 */
function handleTimeChange(field: 'startTime' | 'duration', value: number) {
  if (!selectedEffect.value) return
  effectsStore.updateEffect(selectedEffect.value.id, { [field]: value })
}

/**
 * 切换启用状态
 */
function handleToggleEnabled() {
  if (!selectedEffect.value) return
  effectsStore.toggleEffect(selectedEffect.value.id)
}

/**
 * 删除特效
 */
function handleDelete() {
  if (!selectedEffect.value) return
  effectsStore.removeEffect(selectedEffect.value.id)
}
</script>

<template>
  <div class="effect-property">
    <!-- 未选中提示 -->
    <div v-if="!selectedEffect" class="no-selection">
      <span>选择一个特效以编辑属性</span>
    </div>

    <!-- 特效属性 -->
    <template v-else>
      <!-- 头部信息 -->
      <div class="property-header">
        <div class="effect-info">
          <span class="effect-icon">{{ preset?.icon }}</span>
          <span class="effect-name">{{ preset?.name }}</span>
        </div>
        <div class="header-actions">
          <button 
            class="toggle-btn"
            :class="{ disabled: !selectedEffect.enabled }"
            @click="handleToggleEnabled"
            :title="selectedEffect.enabled ? '禁用' : '启用'"
          >
            {{ selectedEffect.enabled ? '✓' : '○' }}
          </button>
          <button class="delete-btn" @click="handleDelete" title="删除特效">
            🗑️
          </button>
        </div>
      </div>

      <!-- 时间设置 -->
      <div class="property-section">
        <div class="section-title">时间</div>
        <div class="time-inputs">
          <div class="input-group">
            <label>开始</label>
            <input
              type="number"
              :value="selectedEffect.startTime"
              @input="handleTimeChange('startTime', parseFloat(($event.target as HTMLInputElement).value) || 0)"
              step="0.1"
              min="0"
            />
          </div>
          <div class="input-group">
            <label>时长</label>
            <input
              type="number"
              :value="selectedEffect.duration"
              @input="handleTimeChange('duration', parseFloat(($event.target as HTMLInputElement).value) || 0.1)"
              step="0.1"
              min="0.1"
            />
          </div>
        </div>
      </div>

      <!-- 参数调节 -->
      <div class="property-section">
        <div class="section-title">参数</div>
        
        <div 
          v-for="param in paramDefinitions"
          :key="param.name"
          class="param-row"
        >
          <label>{{ param.label }}</label>
          
          <!-- 滑块 -->
          <template v-if="param.type === 'slider'">
            <div class="slider-group">
              <input
                type="range"
                :min="param.min"
                :max="param.max"
                :step="param.step"
                :value="selectedEffect.params[param.name]"
                @input="handleParamChange(param.name, parseFloat(($event.target as HTMLInputElement).value))"
              />
              <span class="slider-value">
                {{ (selectedEffect.params[param.name] as number)?.toFixed?.(2) ?? selectedEffect.params[param.name] }}
              </span>
            </div>
          </template>
          
          <!-- 颜色选择 -->
          <template v-else-if="param.type === 'color'">
            <input
              type="color"
              :value="selectedEffect.params[param.name]"
              @input="handleParamChange(param.name, ($event.target as HTMLInputElement).value)"
            />
          </template>
          
          <!-- 开关 -->
          <template v-else-if="param.type === 'toggle'">
            <label class="toggle">
              <input
                type="checkbox"
                :checked="selectedEffect.params[param.name] as boolean"
                @change="handleParamChange(param.name, ($event.target as HTMLInputElement).checked)"
              />
              <span class="toggle-slider"></span>
            </label>
          </template>
          
          <!-- 下拉选择 -->
          <template v-else-if="param.type === 'select'">
            <select
              :value="selectedEffect.params[param.name]"
              @change="handleParamChange(param.name, ($event.target as HTMLSelectElement).value)"
            >
              <option
                v-for="opt in param.options"
                :key="opt.value"
                :value="opt.value"
              >
                {{ opt.label }}
              </option>
            </select>
          </template>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.effect-property {
  padding: 16px;
  /* height: 100%; Removed to allow parent scroll */
  /* overflow-y: auto; Removed internal scroll */
  background: var(--bg-secondary, #1a1a2e);
  color: var(--text-primary, #ffffff);
  box-sizing: border-box;
}

.effect-property * {
  box-sizing: border-box;
}

.no-selection {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-muted, #666680);
  font-size: 14px;
}

/* 头部 */
.property-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-color, #333350);
  margin-bottom: 16px;
}

.effect-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.effect-icon {
  font-size: 24px;
}

.effect-name {
  font-size: 16px;
  font-weight: 500;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.toggle-btn, .delete-btn {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 6px;
  background: var(--bg-tertiary, #252540);
  cursor: pointer;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.toggle-btn:hover, .delete-btn:hover {
  background: var(--bg-hover, #303050);
}

.toggle-btn.disabled {
  opacity: 0.5;
}

.delete-btn:hover {
  background: var(--danger-color, #ef4444);
}

/* 段落 */
.property-section {
  margin-bottom: 20px;
}

.section-title {
  font-size: 12px;
  color: var(--text-muted, #666680);
  text-transform: uppercase;
  margin-bottom: 12px;
}

/* 时间输入 */
.time-inputs {
  display: flex;
  gap: 16px;
}

.input-group {
  flex: 1;
}

.input-group label {
  display: block;
  font-size: 12px;
  color: var(--text-secondary, #a0a0c0);
  margin-bottom: 4px;
}

.input-group input {
  width: 100%;
  padding: 8px;
  border: 1px solid var(--border-color, #333350);
  border-radius: 6px;
  background: var(--bg-tertiary, #252540);
  color: var(--text-primary, #ffffff);
  font-size: 14px;
}

/* 参数行 */
.param-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid var(--border-color-subtle, #2a2a45);
}

.param-row label {
  font-size: 13px;
  color: var(--text-secondary, #a0a0c0);
  min-width: 80px;
}

/* 滑块 */
.slider-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  margin-left: 16px;
}

.slider-group input[type="range"] {
  flex: 1;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: var(--bg-tertiary, #252540);
  border-radius: 2px;
}

.slider-group input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--primary-color, #6366f1);
  cursor: pointer;
}

.slider-value {
  font-size: 12px;
  color: var(--text-secondary, #a0a0c0);
  min-width: 40px;
  text-align: right;
}

/* 颜色选择 */
input[type="color"] {
  width: 40px;
  height: 28px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

/* 下拉选择 */
select {
  padding: 6px 12px;
  border: 1px solid var(--border-color, #333350);
  border-radius: 6px;
  background: var(--bg-tertiary, #252540);
  color: var(--text-primary, #ffffff);
  font-size: 13px;
}

/* 开关 */
.toggle {
  position: relative;
  display: inline-block;
  width: 40px;
  height: 22px;
}

.toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--bg-tertiary, #252540);
  transition: 0.2s;
  border-radius: 22px;
}

.toggle-slider:before {
  position: absolute;
  content: "";
  height: 16px;
  width: 16px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: 0.2s;
  border-radius: 50%;
}

.toggle input:checked + .toggle-slider {
  background-color: var(--primary-color, #6366f1);
}

.toggle input:checked + .toggle-slider:before {
  transform: translateX(18px);
}
</style>
