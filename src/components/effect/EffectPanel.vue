<script setup lang="ts">
/**
 * 特效选择面板组件
 * 
 * 展示所有可用特效的卡片列表，支持：
 * - 分类筛选
 * - 点击添加特效到当前选中片段
 * - 特效预览悬停提示
 */

import { ref, computed } from 'vue'
import { useEffectsStore } from '@/stores/effects'
import { useTimelineStore } from '@/stores/timeline'
import type { VideoEffectType, EffectCategory } from '@/types/effects'
import { VIDEO_EFFECT_PRESETS } from '@/types/effects'

// Stores
const effectsStore = useEffectsStore()
const timelineStore = useTimelineStore()

// 当前选中的分类
const selectedCategory = ref<EffectCategory | 'all'>('all')

// 分类列表
const categories: { value: EffectCategory | 'all'; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'basic', label: '基础' },
  { value: 'distort', label: '扭曲' },
  { value: 'blur', label: '模糊' },
  { value: 'color', label: '颜色' },
  { value: 'retro', label: '复古' },
  { value: 'creative', label: '创意' }
]

// 过滤后的特效列表
const filteredPresets = computed(() => {
  if (selectedCategory.value === 'all') {
    return VIDEO_EFFECT_PRESETS
  }
  return VIDEO_EFFECT_PRESETS.filter(p => p.category === selectedCategory.value)
})

// 是否有选中的片段
const hasSelectedClip = computed(() => !!timelineStore.selectedClipId)

/**
 * 添加特效到当前片段
 */
function handleAddEffect(type: VideoEffectType) {
  const clipId = timelineStore.selectedClipId
  if (!clipId) {
    alert('请先选择一个视频片段')
    return
  }
  
  effectsStore.addEffect(clipId, type)
}
</script>

<template>
  <div class="effect-panel">
    <!-- 分类标签 -->
    <div class="category-tabs">
      <button
        v-for="cat in categories"
        :key="cat.value"
        :class="['category-tab', { active: selectedCategory === cat.value }]"
        @click="selectedCategory = cat.value"
      >
        {{ cat.label }}
      </button>
    </div>

    <!-- 特效卡片列表 -->
    <div class="effect-grid">
      <div
        v-for="preset in filteredPresets"
        :key="preset.type"
        class="effect-card"
        :class="{ disabled: !hasSelectedClip }"
        @click="handleAddEffect(preset.type)"
        :title="preset.description"
      >
        <div class="effect-icon">{{ preset.icon }}</div>
        <div class="effect-name">{{ preset.name }}</div>
      </div>
    </div>

    <!-- 无选中提示 -->
    <div v-if="!hasSelectedClip" class="no-selection-hint">
      请先在时间轴选择一个视频片段
    </div>
  </div>
</template>

<style scoped>
.effect-panel {
  padding: 12px;
  /* height: 100%; Removed fixed height to allow scrolling in parent */
  width: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary, #1a1a2e);
  color: var(--text-primary, #ffffff);
  box-sizing: border-box;
}

/* 分类标签 */
.category-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  flex-wrap: wrap; /* Ensure wrapping */
}

.category-tab {
  padding: 6px 12px;
  border: none;
  border-radius: 16px;
  background: var(--bg-tertiary, #252540);
  color: var(--text-secondary, #a0a0c0);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.category-tab:hover {
  background: var(--bg-hover, #303050);
}

.category-tab.active {
  background: var(--primary-color, #6366f1);
  color: #ffffff;
}
/* 特效卡片网格 */
.effect-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  gap: 12px;
  /* overflow-y: auto; Removed internal scroll */
  /* flex: 1; Removed flex expansion */
}

.effect-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 16px 8px;
  border-radius: 8px;
  background: var(--bg-tertiary, #252540);
  cursor: pointer;
  transition: all 0.2s;
}

.effect-card:hover:not(.disabled) {
  background: var(--bg-hover, #303050);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.effect-card:active:not(.disabled) {
  transform: translateY(0);
}

.effect-card.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.effect-icon {
  font-size: 28px;
  margin-bottom: 8px;
}

.effect-name {
  font-size: 12px;
  color: var(--text-secondary, #a0a0c0);
  text-align: center;
}

/* 无选中提示 */
.no-selection-hint {
  text-align: center;
  color: var(--text-muted, #666680);
  font-size: 13px;
  padding: 16px;
  background: var(--bg-tertiary, #252540);
  border-radius: 8px;
  margin-top: 12px;
}
</style>
