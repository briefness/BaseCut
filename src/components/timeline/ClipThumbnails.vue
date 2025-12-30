<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { frameExtractor } from '@/utils/FrameExtractor'
import { useResourceStore } from '@/stores/resource'
import type { Clip } from '@/types'

// Props
interface Props {
  clip: Clip
  pixelsPerSecond: number
}

const props = defineProps<Props>()

const resourceStore = useResourceStore()

// 帧列表
const frames = ref<string[]>([])
const isLoading = ref(false)
const containerRef = ref<HTMLElement | null>(null)

// 胶卷缓存引用
let filmstripCache: { frames: string[]; interval: number; duration: number } | null = null

// 获取素材
const material = computed(() => {
  if (!props.clip.materialId) return null
  return resourceStore.getMaterial(props.clip.materialId)
})

// 计算片段总宽度（像素）
const clipWidth = computed(() => {
  return props.clip.duration * props.pixelsPerSecond
})

// 计算理想帧宽度（基于轨道高度和视频宽高比）
const trackHeight = 40 // 轨道高度
const idealFrameWidth = computed(() => {
  if (!material.value) return 60
  const aspectRatio = (material.value.width || 16) / (material.value.height || 9)
  return Math.round(trackHeight * aspectRatio)
})

// 计算需要显示的帧数（确保铺满，但限制最大数量）
const MAX_FRAMES = 50 // 性能保护：最多 50 帧
const frameCount = computed(() => {
  const count = Math.max(1, Math.ceil(clipWidth.value / idealFrameWidth.value))
  return Math.min(count, MAX_FRAMES)
})

// 实际每帧显示宽度（确保铺满整个片段无留白）
const frameWidth = computed(() => {
  return clipWidth.value / frameCount.value
})

// 视频元素引用
let videoElement: HTMLVideoElement | null = null

// 加载素材胶卷
async function loadFilmstrip() {
  if (!material.value || material.value.type !== 'video') return
  if (isLoading.value) return
  
  // 如果已有胶卷缓存，直接切片显示
  if (filmstripCache) {
    updateFramesFromFilmstrip()
    return
  }
  
  // 检查 FrameExtractor 是否已有该素材的胶卷
  if (frameExtractor.hasFilmstrip(material.value.id)) {
    // 从 FrameExtractor 获取已缓存的胶卷
    isLoading.value = true
    try {
      if (!videoElement) {
        videoElement = document.createElement('video')
        videoElement.crossOrigin = 'anonymous'
        videoElement.preload = 'metadata'
        videoElement.muted = true
      }
      videoElement.src = material.value.blobUrl
      
      const filmstrip = await frameExtractor.getFilmstrip(
        videoElement,
        material.value.id,
        material.value.duration || 0,
        { width: 120, quality: 0.7, interval: 0.5 }
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
  
  // 首次加载：提取整个素材的胶卷
  isLoading.value = true
  
  try {
    if (!videoElement) {
      videoElement = document.createElement('video')
      videoElement.crossOrigin = 'anonymous'
      videoElement.preload = 'metadata'
      videoElement.muted = true
    }
    
    videoElement.src = material.value.blobUrl
    
    // 等待视频元数据加载
    await new Promise<void>((resolve, reject) => {
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
    
    // 获取素材胶卷（会自动缓存）
    const filmstrip = await frameExtractor.getFilmstrip(
      videoElement,
      material.value.id,
      material.value.duration || videoElement.duration,
      { width: 120, quality: 0.7, interval: 0.5 }
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

// 从胶卷切片更新显示的帧
function updateFramesFromFilmstrip() {
  if (!filmstripCache) {
    frames.value = []
    return
  }
  
  // 从胶卷中切片获取当前范围的帧
  frames.value = frameExtractor.getFilmstripSlice(
    filmstripCache,
    props.clip.inPoint,
    props.clip.outPoint,
    frameCount.value
  )
}

// IntersectionObserver 懒加载
let observer: IntersectionObserver | null = null

onMounted(() => {
  observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting && frames.value.length === 0) {
        loadFilmstrip()
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

// 监听裁剪变化 - 直接从胶卷切片，无需重新提取
watch(
  () => [props.clip.inPoint, props.clip.outPoint, frameCount.value],
  () => {
    // 如果已有胶卷，直接切片更新（瞬间完成）
    if (filmstripCache) {
      updateFramesFromFilmstrip()
    }
  }
)
</script>

<template>
  <div ref="containerRef" class="clip-thumbnails">
    <!-- 帧图片 -->
    <div 
      v-for="(frame, index) in frames"
      :key="index"
      class="frame"
      :style="{ 
        backgroundImage: `url(${frame})`,
        width: `${frameWidth}px`,
        flexShrink: 0
      }"
    />
    
    <!-- 加载中状态 -->
    <div v-if="isLoading && frames.length === 0" class="loading">
      <span class="loading-spinner"></span>
    </div>
    
    <!-- 空状态占位 -->
    <div 
      v-if="!isLoading && frames.length === 0" 
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
