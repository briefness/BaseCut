<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useTimelineStore } from '@/stores/timeline'
import { useProjectStore } from '@/stores/project'
import { useResourceStore } from '@/stores/resource'
import { WebGLRenderer } from '@/engine/WebGLRenderer'
import { HLSPlayer } from '@/engine/HLSPlayer'

const timelineStore = useTimelineStore()
const projectStore = useProjectStore()
const resourceStore = useResourceStore()

// Canvas 元素和渲染器
const canvasRef = ref<HTMLCanvasElement | null>(null)
const containerRef = ref<HTMLDivElement | null>(null)
let renderer: WebGLRenderer | null = null
let videoElement: HTMLVideoElement | null = null
let audioElement: HTMLAudioElement | null = null  // 独立的音频元素
let hlsPlayer: HLSPlayer | null = null
let animationId: number | null = null
let currentAudioMaterialId: string | null = null  // 当前加载的音频素材 ID

// 显示尺寸（根据容器自适应）
const displaySize = ref({ width: 640, height: 360 })

// HLS 相关状态
const isHLSSource = ref(false)
const isBuffering = ref(false)
const currentQuality = ref<string>('自动')
const qualityLevels = ref<{ index: number; name: string }[]>([])

// 进度条相关
const progressBarRef = ref<HTMLDivElement | null>(null)
const isDraggingProgress = ref(false)

// 计算进度百分比
const progressPercent = computed(() => {
  if (timelineStore.duration === 0) return 0
  return (timelineStore.currentTime / timelineStore.duration) * 100
})

// 进度条点击
function onProgressClick(e: MouseEvent) {
  if (!progressBarRef.value || isDraggingProgress.value) return
  
  const rect = progressBarRef.value.getBoundingClientRect()
  const percent = (e.clientX - rect.left) / rect.width
  const newTime = percent * timelineStore.duration
  timelineStore.seek(Math.max(0, Math.min(newTime, timelineStore.duration)))
}

// 进度条拖动
function onProgressMouseDown(e: MouseEvent) {
  if (!progressBarRef.value) return
  
  isDraggingProgress.value = true
  const wasPlaying = timelineStore.isPlaying
  if (wasPlaying) timelineStore.pause()
  
  const onMouseMove = (moveEvent: MouseEvent) => {
    if (!progressBarRef.value) return
    
    const rect = progressBarRef.value.getBoundingClientRect()
    const percent = Math.max(0, Math.min(1, (moveEvent.clientX - rect.left) / rect.width))
    const newTime = percent * timelineStore.duration
    timelineStore.seek(newTime)
  }
  
  const onMouseUp = () => {
    isDraggingProgress.value = false
    if (wasPlaying) timelineStore.play()
    
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }
  
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
  
  // 立即响应点击位置
  onMouseMove(e)
}

// 全屏状态
const isFullscreen = ref(false)

// 切换全屏
function toggleFullscreen() {
  if (!containerRef.value) return
  
  if (!document.fullscreenElement) {
    containerRef.value.requestFullscreen().then(() => {
      isFullscreen.value = true
    }).catch((err) => {
      console.error('全屏失败:', err)
    })
  } else {
    document.exitFullscreen().then(() => {
      isFullscreen.value = false
    })
  }
}

// 监听全屏变化
function onFullscreenChange() {
  isFullscreen.value = !!document.fullscreenElement
  // 全屏状态变化时更新尺寸
  setTimeout(updateDisplaySize, 100)
}

// 计算显示尺寸（保持宽高比）
function updateDisplaySize() {
  if (!containerRef.value) return
  
  const containerWidth = containerRef.value.clientWidth - 32
  const containerHeight = containerRef.value.clientHeight - 100 // 留出控制栏空间
  const aspectRatio = projectStore.aspectRatio
  
  let width = containerWidth
  let height = width / aspectRatio
  
  if (height > containerHeight) {
    height = containerHeight
    width = height * aspectRatio
  }
  
  displaySize.value = { width: Math.floor(width), height: Math.floor(height) }
  
  if (canvasRef.value) {
    canvasRef.value.width = displaySize.value.width
    canvasRef.value.height = displaySize.value.height
    renderer?.resize(displaySize.value.width, displaySize.value.height)
  }
}

// 当前活跃视频片段
const activeVideoClip = computed(() => {
  const clips = timelineStore.getActiveClips(timelineStore.currentTime)
  const videoClip = clips.find(c => {
    const material = resourceStore.getMaterial(c.materialId ?? '')
    return material?.type === 'video'
  })
  return videoClip
})

// 初始化
onMounted(() => {
  if (canvasRef.value) {
    renderer = new WebGLRenderer(canvasRef.value)
    updateDisplaySize()
  }
  
  // 创建视频元素（用于播放视频和音频）
  videoElement = document.createElement('video')
  videoElement.playsInline = true
  videoElement.crossOrigin = 'anonymous'
  videoElement.volume = timelineStore.volume  // 同步音量
  
  // 初始化 HLS 播放器
  if (HLSPlayer.isSupported() || HLSPlayer.isNativeSupported()) {
    hlsPlayer = new HLSPlayer()
    hlsPlayer.init(videoElement, {
      autoStartLoad: true,
      enableWorker: true,
      maxBufferLength: 30
    })
    
    // 设置 HLS 回调
    hlsPlayer.onLoaded(() => {
      console.log('[Player] HLS 源加载完成')
      // 更新质量级别列表
      const levels = hlsPlayer?.getQualityLevels() ?? []
      qualityLevels.value = [
        { index: -1, name: '自动' },
        ...levels.map(l => ({ index: l.index, name: l.name }))
      ]
    })
    
    hlsPlayer.onBuffering((buffering) => {
      isBuffering.value = buffering
    })
    
    hlsPlayer.onQualityChange((level) => {
      currentQuality.value = level.name
    })
    
    hlsPlayer.onError((error) => {
      console.error('[Player] HLS 错误:', error)
    })
  }
  
  // 创建独立的音频元素
  audioElement = document.createElement('audio')
  audioElement.preload = 'auto'
  audioElement.volume = timelineStore.volume
  
  window.addEventListener('resize', updateDisplaySize)
  document.addEventListener('fullscreenchange', onFullscreenChange)
  
  // 开始渲染循环
  startRenderLoop()
})

onUnmounted(() => {
  window.removeEventListener('resize', updateDisplaySize)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  stopRenderLoop()
  renderer?.destroy()
  hlsPlayer?.destroy()
  renderer = null
  hlsPlayer = null
  videoElement = null
  audioElement = null
  currentAudioMaterialId = null
})

// 加载视频源
function loadVideoSource(url: string) {
  if (!videoElement) return
  
  // 检测是否为 HLS 源
  isHLSSource.value = HLSPlayer.isHLSSource(url)
  
  if (isHLSSource.value && hlsPlayer) {
    // 使用 HLS 播放器
    hlsPlayer.loadSource(url)
    console.log('[Player] 使用 HLS 播放模式')
  } else {
    // 使用普通播放
    videoElement.src = url
    videoElement.load()
    console.log('[Player] 使用普通播放模式')
  }
}

// 渲染循环
function startRenderLoop() {
  let lastTime = performance.now()
  
  const render = () => {
    const now = performance.now()
    const deltaTime = (now - lastTime) / 1000 // 转换为秒
    lastTime = now
    
    if (timelineStore.isPlaying) {
      // 优先使用音频或视频的实际播放时间来同步时间线
      // 这样可以避免时间偏差导致的频繁 seek
      let syncedFromMedia = false
      
      // 检查是否有音频在播放
      if (audioElement && !audioElement.paused && currentAudioMaterialId) {
        const activeClips = timelineStore.getActiveClips(timelineStore.currentTime)
        const audioClip = activeClips.find(c => {
          const m = resourceStore.getMaterial(c.materialId ?? '')
          return m?.type === 'audio'
        })
        if (audioClip) {
          // 从音频播放时间反推时间线时间
          const timelineTime = audioElement.currentTime - audioClip.inPoint + audioClip.startTime
          timelineStore.seek(timelineTime)
          syncedFromMedia = true
        }
      }
      
      // 检查是否有视频在播放
      if (!syncedFromMedia && videoElement && !videoElement.paused) {
        const activeClips = timelineStore.getActiveClips(timelineStore.currentTime)
        const videoClip = activeClips.find(c => {
          const m = resourceStore.getMaterial(c.materialId ?? '')
          return m?.type === 'video'
        })
        if (videoClip) {
          // 从视频播放时间反推时间线时间
          const timelineTime = videoElement.currentTime - videoClip.inPoint + videoClip.startTime
          timelineStore.seek(timelineTime)
          syncedFromMedia = true
        }
      }
      
      // 如果没有媒体在播放，使用精确的时间递增
      if (!syncedFromMedia) {
        timelineStore.seek(timelineStore.currentTime + deltaTime)
      }
      
      // 到达末尾时停止
      if (timelineStore.currentTime >= timelineStore.duration) {
        timelineStore.pause()
        timelineStore.seek(0)
      }
    }
    
    // 渲染当前帧
    renderCurrentFrame()
    
    animationId = requestAnimationFrame(render)
  }
  
  animationId = requestAnimationFrame(render)
}

function stopRenderLoop() {
  if (animationId !== null) {
    cancelAnimationFrame(animationId)
    animationId = null
  }
}

// 渲染当前帧
function renderCurrentFrame() {
  if (!renderer || !videoElement) return
  
  // 同步音量
  videoElement.volume = timelineStore.volume
  
  // 获取当前时间点的所有活跃片段
  const activeClips = timelineStore.getActiveClips(timelineStore.currentTime)
  
  // 找到视频片段
  const videoClip = activeClips.find(c => {
    const material = resourceStore.getMaterial(c.materialId ?? '')
    return material?.type === 'video'
  })
  
  // 找到图片片段
  const imageClip = activeClips.find(c => {
    const material = resourceStore.getMaterial(c.materialId ?? '')
    return material?.type === 'image'
  })
  
  // 找到音频片段
  const audioClip = activeClips.find(c => {
    const material = resourceStore.getMaterial(c.materialId ?? '')
    return material?.type === 'audio'
  })
  
  // 渲染视频帧
  if (videoClip && videoClip.materialId) {
    const material = resourceStore.getMaterial(videoClip.materialId)
    if (material && material.type === 'video') {
      const clipTime = timelineStore.currentTime - videoClip.startTime + videoClip.inPoint
      const videoUrl = material.hlsUrl ?? material.blobUrl
      
      const currentSrc = hlsPlayer?.getCurrentSource() ?? videoElement.src
      if (currentSrc !== videoUrl) {
        loadVideoSource(videoUrl)
      }
      
      if (!isHLSSource.value) {
        if (Math.abs(videoElement.currentTime - clipTime) > 0.1) {
          videoElement.currentTime = clipTime
        }
      }
      
      if (timelineStore.isPlaying && videoElement.paused) {
        videoElement.play().catch(() => {
          // 忽略 AbortError：play() 被 load() 或 pause() 中断是正常行为
        })
      } else if (!timelineStore.isPlaying && !videoElement.paused) {
        videoElement.pause()
      }
      
      if (videoElement.readyState >= 2) {
        renderer.renderFrame(videoElement)
      }
    }
  } 
  // 渲染图片帧
  else if (imageClip && imageClip.materialId) {
    const material = resourceStore.getMaterial(imageClip.materialId)
    if (material && material.type === 'image') {
      // 使用图片渲染
      if (!imageCache.has(material.id)) {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => {
          imageCache.set(material.id, img)
          if (renderer) renderer.renderFrame(img)
        }
        img.src = material.blobUrl
        imageCache.set(material.id, img) // 标记为加载中
      } else {
        const img = imageCache.get(material.id)
        if (img && img.complete) {
          renderer.renderFrame(img)
        }
      }
    }
  } else {
    renderer.clear()
  }
  
  // 处理独立音频轨道
  if (audioClip && audioClip.materialId && audioElement) {
    const material = resourceStore.getMaterial(audioClip.materialId)
    if (material && material.type === 'audio') {
      // 同步音量
      audioElement.volume = timelineStore.volume
      
      const clipTime = timelineStore.currentTime - audioClip.startTime + audioClip.inPoint
      
      // 检查是否需要加载新的音频源
      if (currentAudioMaterialId !== audioClip.materialId) {
        console.log('[Player] 加载音频素材:', material.name)
        audioElement.src = material.blobUrl
        currentAudioMaterialId = audioClip.materialId
        audioElement.load()
        // 加载新源后需要设置初始时间
        audioElement.addEventListener('loadeddata', () => {
          audioElement!.currentTime = clipTime
        }, { once: true })
      }
      
      // 同步播放状态
      if (timelineStore.isPlaying) {
        if (audioElement.paused && audioElement.readyState >= 2) {
          // 播放开始时同步时间（只在开始播放时同步一次）
          audioElement.currentTime = clipTime
          audioElement.play().catch(e => console.warn('[Player] 音频播放失败:', e))
        }
        // 时间线已经跟随音频播放时间，不再需要在播放过程中 seek 音频
      } else if (!audioElement.paused) {
        audioElement.pause()
      }
    }
  } else if (audioElement && !audioElement.paused) {
    // 没有音频片段时暂停音频
    audioElement.pause()
    currentAudioMaterialId = null
  }
}

// 图片缓存
const imageCache = new Map<string, HTMLImageElement>()

// 监听项目分辨率变化
watch(
  () => [projectStore.canvasWidth, projectStore.canvasHeight, projectStore.aspectRatio],
  () => {
    updateDisplaySize()
  }
)

// 监听活跃片段变化
watch(activeVideoClip, (newClip, oldClip) => {
  if (newClip?.materialId !== oldClip?.materialId) {
    if (newClip?.materialId) {
      const material = resourceStore.getMaterial(newClip.materialId)
      if (material) {
        const videoUrl = material.hlsUrl ?? material.blobUrl
        loadVideoSource(videoUrl)
      }
    }
  }
})

// 切换质量
function setQuality(levelIndex: number) {
  hlsPlayer?.setQualityLevel(levelIndex)
  currentQuality.value = levelIndex === -1 ? '自动' : qualityLevels.value.find(l => l.index === levelIndex)?.name ?? ''
}

// 格式化时间
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 100)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
}
</script>

<template>
  <div class="player" ref="containerRef">
    <!-- 视频画布 -->
    <div 
      class="canvas-container"
      :style="{
        width: displaySize.width + 'px',
        height: displaySize.height + 'px'
      }"
    >
      <canvas 
        ref="canvasRef" 
        :width="displaySize.width"
        :height="displaySize.height"
        class="video-canvas"
      />
      
      <!-- 空状态 -->
      <div v-if="timelineStore.duration === 0" class="empty-overlay">
        <div class="empty-icon">🎬</div>
        <p>将素材拖入轨道开始编辑</p>
      </div>
    </div>

    <!-- 播放进度条 -->
    <div 
      class="progress-bar" 
      ref="progressBarRef"
      @mousedown="onProgressMouseDown"
      @click="onProgressClick"
    >
      <div class="progress-track">
        <div 
          class="progress-fill" 
          :style="{ width: progressPercent + '%' }"
        />
        <div 
          class="progress-handle"
          :style="{ left: progressPercent + '%' }"
        />
      </div>
    </div>

    <!-- 控制栏 -->
    <div class="controls">
      <div class="controls-left">
        <!-- 播放/暂停 -->
        <button 
          class="control-btn primary"
          @click="timelineStore.togglePlay"
        >
          {{ timelineStore.isPlaying ? '⏸' : '▶' }}
        </button>
        
        <!-- 停止 -->
        <button 
          class="control-btn"
          @click="() => { timelineStore.pause(); timelineStore.seek(0) }"
        >
          ⏹
        </button>

        <!-- 快退/快进 -->
        <button 
          class="control-btn"
          @click="timelineStore.seek(timelineStore.currentTime - 5)"
        >
          ⏪
        </button>
        <button 
          class="control-btn"
          @click="timelineStore.seek(timelineStore.currentTime + 5)"
        >
          ⏩
        </button>
      </div>

      <div class="controls-center">
        <!-- 时间显示 -->
        <span class="time-display">
          {{ formatTime(timelineStore.currentTime) }} / {{ formatTime(timelineStore.duration) }}
        </span>
      </div>

      <div class="controls-right">
        <!-- HLS 状态指示 -->
        <div v-if="isHLSSource" class="hls-indicator">
          <span class="hls-badge">HLS</span>
          <span v-if="isBuffering" class="buffering-indicator">缓冲中...</span>
        </div>

        <!-- 质量选择器 -->
        <select 
          v-if="isHLSSource && qualityLevels.length > 1"
          class="quality-select"
          :value="currentQuality"
          @change="(e) => setQuality(Number((e.target as HTMLSelectElement).value))"
        >
          <option 
            v-for="level in qualityLevels" 
            :key="level.index" 
            :value="level.index"
          >
            {{ level.name }}
          </option>
        </select>

        <!-- 音量 -->
        <div class="volume-control">
          <span>🔊</span>
          <input 
            type="range" 
            min="0" 
            max="1" 
            step="0.01"
            :value="timelineStore.volume"
            @input="(e) => timelineStore.setVolume(Number((e.target as HTMLInputElement).value))"
          />
        </div>

        <!-- 全屏 -->
        <button class="control-btn" @click="toggleFullscreen">
          {{ isFullscreen ? '⛶' : '⛶' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.player {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 16px;
  gap: 16px;
}

.canvas-container {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.video-canvas {
  display: block;
  background: #000;
  /* 确保使用 HTML 属性设置的尺寸，不被 CSS 拉伸 */
  max-width: 100%;
  max-height: 100%;
}

/* 进度条 */
.progress-bar {
  width: 100%;
  max-width: 800px;
  height: 20px;
  cursor: pointer;
  padding: 6px 0;
  display: flex;
  align-items: center;
}

.progress-track {
  position: relative;
  width: 100%;
  height: 6px;
  background: var(--bg-tertiary);
  border-radius: 3px;
  overflow: visible;
}

.progress-fill {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  background: linear-gradient(90deg, var(--primary), var(--primary-light));
  border-radius: 3px 0 0 3px;
  transition: width 0.05s linear;
}

.progress-handle {
  position: absolute;
  top: 50%;
  width: 14px;
  height: 14px;
  background: var(--primary);
  border: 2px solid white;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  transition: transform 0.1s ease;
}

.progress-bar:hover .progress-handle {
  transform: translate(-50%, -50%) scale(1.2);
}

.progress-bar:active .progress-handle {
  transform: translate(-50%, -50%) scale(0.9);
}

.empty-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: rgba(0, 0, 0, 0.8);
}

.empty-icon {
  font-size: 48px;
  opacity: 0.5;
}

.empty-overlay p {
  color: var(--text-muted);
}

/* 控制栏 */
.controls {
  width: 100%;
  max-width: 640px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: var(--bg-tertiary);
  border-radius: var(--radius-lg);
}

.controls-left,
.controls-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.control-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  font-size: 16px;
  transition: all var(--transition-fast);
}

.control-btn:hover {
  background: var(--bg-elevated);
}

.control-btn.primary {
  background: var(--primary);
  color: white;
}

.control-btn.primary:hover {
  background: var(--primary-hover);
}

.time-display {
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  color: var(--text-secondary);
  background: var(--bg-secondary);
  padding: 4px 12px;
  border-radius: var(--radius-md);
}

.volume-control {
  display: flex;
  align-items: center;
  gap: 8px;
}

.volume-control input[type="range"] {
  width: 80px;
  height: 4px;
  -webkit-appearance: none;
  background: var(--bg-secondary);
  border-radius: 2px;
  cursor: pointer;
}

.volume-control input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 12px;
  height: 12px;
  background: var(--primary);
  border-radius: 50%;
  cursor: pointer;
}

/* HLS 相关样式 */
.hls-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
}

.hls-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  background: linear-gradient(135deg, #10b981, #059669);
  color: white;
  border-radius: var(--radius-sm);
  text-transform: uppercase;
}

.buffering-indicator {
  font-size: 11px;
  color: var(--warning);
  animation: pulse 1s ease-in-out infinite;
}

.quality-select {
  padding: 4px 8px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: 12px;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
}

.quality-select:hover {
  border-color: var(--primary);
}

.quality-select:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 2px var(--primary-light);
}
</style>
