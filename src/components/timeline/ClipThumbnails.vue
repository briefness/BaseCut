<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { frameExtractor } from '@/utils/FrameExtractor'
import { spriteThumbnailer, type FramePosition } from '@/utils/SpriteThumbnailer'
import { useResourceStore } from '@/stores/resource'
import type { Clip } from '@/types'

// Props
interface Props {
  clip: Clip
  pixelsPerSecond: number
}

const props = defineProps<Props>()
const resourceStore = useResourceStore()

// 状态
const frames = ref<string[]>([])              // 本地模式帧列表
const spriteFrames = ref<FramePosition[]>([]) // Sprite 模式帧位置
const isLoading = ref(false)
const containerRef = ref<HTMLElement | null>(null)

// 胶卷缓存（本地模式）
let filmstripCache: { frames: string[]; interval: number; duration: number } | null = null
let videoElement: HTMLVideoElement | null = null

// 计算属性
const material = computed(() => {
  if (!props.clip.materialId) return null
  return resourceStore.getMaterial(props.clip.materialId)
})

const useSpriteMode = computed(() => !!material.value?.thumbnailSprite)

const clipWidth = computed(() => props.clip.duration * props.pixelsPerSecond)

const trackHeight = 40
const idealFrameWidth = computed(() => {
  if (!material.value) return 60
  const aspectRatio = (material.value.width || 16) / (material.value.height || 9)
  return Math.round(trackHeight * aspectRatio)
})

const MAX_FRAMES = 50
const frameCount = computed(() => {
  const count = Math.max(1, Math.ceil(clipWidth.value / idealFrameWidth.value))
  return Math.min(count, MAX_FRAMES)
})

const frameWidth = computed(() => clipWidth.value / frameCount.value)

// ========== Sprite 模式 ==========
function loadFromSprite() {
  if (!material.value?.thumbnailSprite) return
  
  spriteFrames.value = spriteThumbnailer.getFramesInRange(
    material.value.thumbnailSprite,
    props.clip.inPoint,
    props.clip.outPoint,
    frameCount.value
  )
}

function updateSpriteFrames() {
  if (!useSpriteMode.value || !material.value?.thumbnailSprite) return
  loadFromSprite()
}

// ========== 本地模式 ==========
async function loadFilmstrip() {
  if (!material.value || material.value.type !== 'video') return
  if (!material.value.blobUrl) return
  
  // 已有缓存，直接切片
  if (filmstripCache) {
    updateFramesFromFilmstrip()
    return
  }
  
  // 检查 FrameExtractor 缓存
  if (frameExtractor.hasFilmstrip(material.value.id)) {
    isLoading.value = true
    try {
      ensureVideoElement()
      videoElement!.src = material.value.blobUrl
      
      const filmstrip = await frameExtractor.getFilmstrip(
        videoElement!,
        material.value.id,
        material.value.duration || 0,
        { width: 120, quality: 0.7, interval: 1 }
      )
      filmstripCache = filmstrip
      updateFramesFromFilmstrip()
    } catch (err) {
      console.error('[ClipThumbnails] 获取胶卷失败:', err)
    } finally {
      isLoading.value = false
    }
    return
  }
  
  // 首次提取
  isLoading.value = true
  try {
    ensureVideoElement()
    videoElement!.src = material.value.blobUrl
    
    await waitForVideoLoad()
    
    const filmstrip = await frameExtractor.getFilmstrip(
      videoElement!,
      material.value.id,
      material.value.duration || videoElement!.duration,
      { width: 120, quality: 0.7, interval: 1 }
    )
    filmstripCache = filmstrip
    updateFramesFromFilmstrip()
  } catch (err) {
    console.error('[ClipThumbnails] 帧提取失败:', err)
    frames.value = []
  } finally {
    isLoading.value = false
  }
}

function ensureVideoElement() {
  if (!videoElement) {
    videoElement = document.createElement('video')
    videoElement.crossOrigin = 'anonymous'
    videoElement.preload = 'metadata'
    videoElement.muted = true
  }
}

function waitForVideoLoad(): Promise<void> {
  return new Promise((resolve, reject) => {
    const onLoaded = () => {
      videoElement!.removeEventListener('loadedmetadata', onLoaded)
      videoElement!.removeEventListener('error', onError)
      resolve()
    }
    const onError = () => {
      videoElement!.removeEventListener('loadedmetadata', onLoaded)
      videoElement!.removeEventListener('error', onError)
      reject(new Error('Failed to load video'))
    }
    
    if (videoElement!.readyState >= 1) {
      resolve()
    } else {
      videoElement!.addEventListener('loadedmetadata', onLoaded)
      videoElement!.addEventListener('error', onError)
    }
  })
}

function updateFramesFromFilmstrip() {
  if (!filmstripCache) {
    frames.value = []
    return
  }
  frames.value = frameExtractor.getFilmstripSlice(
    filmstripCache,
    props.clip.inPoint,
    props.clip.outPoint,
    frameCount.value
  )
}

// ========== 统一入口 ==========
async function loadThumbnails() {
  if (!material.value || material.value.type !== 'video') return
  if (isLoading.value) return
  
  if (useSpriteMode.value) {
    loadFromSprite()
  } else {
    await loadFilmstrip()
  }
}

// ========== 生命周期 ==========
let observer: IntersectionObserver | null = null

onMounted(() => {
  observer = new IntersectionObserver(
    (entries) => {
      const hasFrames = frames.value.length > 0 || spriteFrames.value.length > 0
      if (entries[0].isIntersecting && !hasFrames) {
        loadThumbnails()
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
  if (videoElement) {
    videoElement.src = ''
    videoElement = null
  }
})

// 监听裁剪变化
watch(
  () => [props.clip.inPoint, props.clip.outPoint, frameCount.value],
  () => {
    if (useSpriteMode.value) {
      updateSpriteFrames()
    } else if (filmstripCache) {
      updateFramesFromFilmstrip()
    }
  }
)
</script>

<template>
  <div ref="containerRef" class="clip-thumbnails">
    <!-- Sprite 模式帧 -->
    <div 
      v-if="useSpriteMode && spriteFrames.length > 0"
      v-for="(pos, index) in spriteFrames"
      :key="`sprite-${index}`"
      class="frame"
      :style="{ 
        backgroundImage: `url(${pos.spriteUrl})`,
        backgroundPosition: `-${pos.x}px -${pos.y}px`,
        backgroundSize: 'auto',
        width: `${frameWidth}px`,
        flexShrink: 0
      }"
    />
    
    <!-- 本地模式帧 -->
    <div 
      v-else-if="frames.length > 0"
      v-for="(frame, index) in frames"
      :key="`local-${index}`"
      class="frame"
      :style="{ 
        backgroundImage: `url(${frame})`,
        width: `${frameWidth}px`,
        flexShrink: 0
      }"
    />
    
    <!-- 加载中状态 -->
    <div v-if="isLoading && frames.length === 0 && spriteFrames.length === 0" class="loading">
      <span class="loading-spinner"></span>
    </div>
    
    <!-- 空状态占位 -->
    <div 
      v-if="!isLoading && frames.length === 0 && spriteFrames.length === 0" 
      class="placeholder"
    />
  </div>
</template>

<style scoped>
.clip-thumbnails {
  position: absolute;
  inset: 0;
  display: flex;
  overflow: hidden;
  border-radius: inherit;
}

.frame {
  height: 100%;
  background-size: cover;  /* 裁剪填满 */
  background-position: center;
  background-repeat: no-repeat;
}



.loading {
  flex: 1;
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

.placeholder {
  flex: 1;
  background: rgba(0, 0, 0, 0.1);
}
</style>
