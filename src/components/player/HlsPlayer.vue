<script setup lang="ts">
/**
 * HlsPlayer - 统一视频播放组件
 * 自动检测并选择最优播放方式：
 * - HLS URL → hls.js 播放
 * - Blob URL → 原生 video 播放
 */
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import Hls from 'hls.js'

// Props
interface Props {
  src?: string           // Blob URL 或 HLS URL
  hlsUrl?: string        // 优先使用 HLS URL
  autoplay?: boolean
  muted?: boolean
  loop?: boolean
  crossorigin?: string
}

const props = withDefaults(defineProps<Props>(), {
  autoplay: false,
  muted: true,
  loop: false,
  crossorigin: 'anonymous'
})

// Emits
const emit = defineEmits<{
  (e: 'loadedmetadata', event: Event): void
  (e: 'timeupdate', event: Event): void
  (e: 'ended', event: Event): void
  (e: 'error', event: Event): void
  (e: 'canplay', event: Event): void
  (e: 'seeking', event: Event): void
  (e: 'seeked', event: Event): void
}>()

// Refs
const videoRef = ref<HTMLVideoElement | null>(null)
const isHlsMode = ref(false)
let hlsInstance: Hls | null = null

// 判断是否是 HLS URL
function isHlsUrl(url: string): boolean {
  return url.includes('.m3u8') || url.includes('application/x-mpegURL')
}

// 获取实际播放 URL
const playUrl = computed(() => {
  return props.hlsUrl || props.src || ''
})

// 初始化播放器
function initPlayer() {
  const video = videoRef.value
  if (!video) return
  
  const url = playUrl.value
  if (!url) return
  
  // 清理旧的 HLS 实例
  destroyHls()
  
  if (isHlsUrl(url)) {
    // HLS 模式
    if (Hls.isSupported()) {
      isHlsMode.value = true
      hlsInstance = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        maxBufferLength: 30,
        maxMaxBufferLength: 60
      })
      
      hlsInstance.loadSource(url)
      hlsInstance.attachMedia(video)
      
      hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
        if (props.autoplay) {
          video.play().catch(() => {})
        }
      })
      
      hlsInstance.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          console.error('[HlsPlayer] Fatal HLS error:', data)
          emit('error', new Event('error'))
        }
      })
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari 原生支持 HLS
      isHlsMode.value = false
      video.src = url
    }
  } else {
    // 原生 video 模式
    isHlsMode.value = false
    video.src = url
  }
}

// 销毁 HLS 实例
function destroyHls() {
  if (hlsInstance) {
    hlsInstance.destroy()
    hlsInstance = null
  }
  isHlsMode.value = false
}

// 暴露给父组件的方法
defineExpose({
  // 获取 video 元素
  getVideoElement: () => videoRef.value,
  
  // 播放控制
  play: () => videoRef.value?.play(),
  pause: () => videoRef.value?.pause(),
  
  // 时间控制
  seek: (time: number) => {
    if (videoRef.value) {
      videoRef.value.currentTime = time
    }
  },
  
  // 获取当前时间
  getCurrentTime: () => videoRef.value?.currentTime ?? 0,
  
  // 获取时长
  getDuration: () => videoRef.value?.duration ?? 0,
  
  // 是否 HLS 模式
  isHls: () => isHlsMode.value
})

// 监听 URL 变化
watch(playUrl, () => {
  initPlayer()
})

onMounted(() => {
  initPlayer()
})

onUnmounted(() => {
  destroyHls()
})
</script>

<template>
  <video
    ref="videoRef"
    :autoplay="autoplay"
    :muted="muted"
    :loop="loop"
    :crossorigin="crossorigin"
    playsinline
    @loadedmetadata="emit('loadedmetadata', $event)"
    @timeupdate="emit('timeupdate', $event)"
    @ended="emit('ended', $event)"
    @error="emit('error', $event)"
    @canplay="emit('canplay', $event)"
    @seeking="emit('seeking', $event)"
    @seeked="emit('seeked', $event)"
  />
</template>

<style scoped>
video {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
</style>
