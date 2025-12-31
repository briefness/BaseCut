<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { waveformExtractor } from '@/utils/WaveformExtractor'
import { useResourceStore } from '@/stores/resource'
import type { Clip } from '@/types'

// Props
interface Props {
  clip: Clip
  pixelsPerSecond: number
}

const props = defineProps<Props>()

const resourceStore = useResourceStore()

// 波形数据
const waveformPeaks = ref<number[]>([])
const isLoading = ref(false)
const containerRef = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)

// 获取素材
const material = computed(() => {
  if (!props.clip.materialId) return null
  return resourceStore.getMaterial(props.clip.materialId)
})

// 计算片段显示宽度（像素）
const clipWidth = computed(() => {
  return props.clip.duration * props.pixelsPerSecond
})

// 原始波形数据（完整）
let fullWaveform: number[] = []
let fullDuration: number = 0

// 提取波形（支持远程和本地两种模式）
async function extractWaveform() {
  if (!material.value) return
  if (material.value.type !== 'audio' && material.value.type !== 'video') return
  if (isLoading.value) return
  
  isLoading.value = true
  
  try {
    // 优先使用远程波形数据
    if (material.value.waveformUrl) {
      await loadRemoteWaveform()
    } else if (material.value.blobUrl) {
      await loadLocalWaveform()
    }
    
    // 更新显示
    updateDisplayWaveform()
  } catch (err) {
    console.error('[ClipWaveform] 波形提取失败:', err)
    waveformPeaks.value = []
  } finally {
    isLoading.value = false
  }
}

// 从远程 URL 加载波形数据
async function loadRemoteWaveform() {
  if (!material.value?.waveformUrl) return
  
  const response = await fetch(material.value.waveformUrl)
  if (!response.ok) {
    throw new Error(`Failed to fetch waveform: ${response.status}`)
  }
  
  const data = await response.json()
  
  // 支持多种格式：直接数组或包含 peaks 字段的对象
  if (Array.isArray(data)) {
    fullWaveform = data
  } else if (data.peaks && Array.isArray(data.peaks)) {
    fullWaveform = data.peaks
  } else {
    throw new Error('Invalid waveform data format')
  }
  
  fullDuration = material.value.duration || 0
}

// 本地提取波形
async function loadLocalWaveform() {
  if (!material.value?.blobUrl) return
  
  fullWaveform = await waveformExtractor.extractWaveform(
    material.value.blobUrl,
    material.value.id,
    { samplesPerSecond: 100 }
  )
  fullDuration = material.value.duration || 0
}

// 更新显示的波形（根据 inPoint/outPoint 裁剪）
function updateDisplayWaveform() {
  if (fullWaveform.length === 0 || fullDuration <= 0) {
    waveformPeaks.value = []
    return
  }
  
  // 计算需要显示的采样点数（每像素约 1 个采样点）
  const targetSamples = Math.ceil(clipWidth.value)
  
  // 获取指定范围的波形
  waveformPeaks.value = waveformExtractor.getWaveformSlice(
    fullWaveform,
    fullDuration,
    props.clip.inPoint,
    props.clip.outPoint,
    targetSamples
  )
  
  // 绘制波形
  drawWaveform()
}

// 绘制波形到 Canvas（竖条形 + 间隙样式）
function drawWaveform() {
  const canvas = canvasRef.value
  if (!canvas) return
  
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  
  const peaks = waveformPeaks.value
  const width = Math.ceil(clipWidth.value)
  const height = 40 // 轨道高度
  
  // 设置 Canvas 尺寸
  canvas.width = width
  canvas.height = height
  
  // 清空画布
  ctx.clearRect(0, 0, width, height)
  
  if (peaks.length === 0) return
  
  // 竖条形配置
  const barWidth = 2         // 条形宽度
  const barGap = 1           // 条形间隙
  const minBarHeight = 2     // 最小高度
  const maxBarHeight = height * 0.85  // 最大高度（85%轨道高度）
  const paddingBottom = 2    // 底部留白
  
  // 计算需要绘制的条形数量
  const barSpacing = barWidth + barGap
  const numBars = Math.floor(width / barSpacing)
  
  // 设置颜色（使用当前主题色）
  ctx.fillStyle = 'rgba(255, 255, 255, 0.65)'
  
  for (let i = 0; i < numBars; i++) {
    // 获取这个区间的峰值（取最大值）
    const startIdx = Math.floor(i * peaks.length / numBars)
    const endIdx = Math.min(Math.floor((i + 1) * peaks.length / numBars), peaks.length)
    
    let maxPeak = 0
    for (let j = startIdx; j < endIdx; j++) {
      maxPeak = Math.max(maxPeak, peaks[j])
    }
    
    // 计算条形高度
    const barHeight = Math.max(minBarHeight, maxPeak * maxBarHeight)
    
    // 从底部向上绘制
    const x = i * barSpacing
    const y = height - paddingBottom - barHeight
    
    // 绘制圆角条形
    ctx.beginPath()
    ctx.roundRect(x, y, barWidth, barHeight, 1)
    ctx.fill()
  }
}

// IntersectionObserver 懒加载
let observer: IntersectionObserver | null = null

onMounted(() => {
  observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting && waveformPeaks.value.length === 0) {
        extractWaveform()
      }
    },
    { threshold: 0.1 }
  )
  
  if (containerRef.value) {
    observer.observe(containerRef.value)
  }
})

onUnmounted(() => {
  observer?.disconnect()
})

// 监听裁剪变化更新波形显示
let debounceTimer: number | null = null

watch(
  () => [props.clip.inPoint, props.clip.outPoint, props.clip.duration, clipWidth.value],
  () => {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = window.setTimeout(() => {
      updateDisplayWaveform()
    }, 300)
  }
)

// 监听宽度变化重绘
watch(clipWidth, () => {
  if (waveformPeaks.value.length > 0) {
    drawWaveform()
  }
})
</script>

<template>
  <div ref="containerRef" class="clip-waveform">
    <canvas ref="canvasRef" class="waveform-canvas" />
    
    <!-- 加载中状态 -->
    <div v-if="isLoading" class="loading">
      <span class="loading-spinner"></span>
    </div>
  </div>
</template>

<style scoped>
.clip-waveform {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: inherit;
}

.waveform-canvas {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
}

.loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.2);
}

.loading-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
