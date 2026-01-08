<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { App, Image as LeaferImage } from 'leafer-ui'
import '@leafer-in/editor'
import { useTimelineStore } from '@/stores/timeline'
import { useProjectStore } from '@/stores/project'
import { useResourceStore } from '@/stores/resource'
import { useEffectsStore } from '@/stores/effects'
import { WebGLRenderer } from '@/engine/WebGLRenderer'
import { HLSPlayer } from '@/engine/HLSPlayer'
import { frameExtractor } from '@/utils/FrameExtractor'
import { subtitleRenderer } from '@/utils/SubtitleRenderer'

const timelineStore = useTimelineStore()
const projectStore = useProjectStore()
const resourceStore = useResourceStore()
const effectsStore = useEffectsStore()

// Canvas 元素和渲染器
const canvasRef = ref<HTMLCanvasElement | null>(null)
const subtitleCanvasRef = ref<HTMLCanvasElement | null>(null)  // 字幕层 Canvas
const containerRef = ref<HTMLDivElement | null>(null)
let renderer: WebGLRenderer | null = null
let videoElement: HTMLVideoElement | null = null
let audioElement: HTMLAudioElement | null = null  // 独立的音频元素
let hlsPlayer: HLSPlayer | null = null
let animationId: number | null = null
let currentAudioMaterialId: string | null = null  // 当前加载的音频素材 ID
let lastVideoClipId: string | null = null  // 上一个渲染的视频片段 ID
let needsInitialSeek = false  // 是否需要初始 seek

// 转场渲染相关
let transitionVideoB: HTMLVideoElement | null = null  // 转场回退用视频元素
const frameImageCache = new Map<string, HTMLImageElement>()  // 转场帧图片缓存
// 移除重复定义
// 移除重复定义

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

// 进度条拖动（使用预览机制与时间轴播放头保持一致）
function onProgressMouseDown(e: MouseEvent) {
  if (!progressBarRef.value) return
  
  isDraggingProgress.value = true
  const wasPlaying = timelineStore.isPlaying
  if (wasPlaying) timelineStore.pause()
  
  // 开始拖拽预览
  timelineStore.startSeeking()
  
  const onMouseMove = (moveEvent: MouseEvent) => {
    if (!progressBarRef.value) return
    
    const rect = progressBarRef.value.getBoundingClientRect()
    const percent = Math.max(0, Math.min(1, (moveEvent.clientX - rect.left) / rect.width))
    const newTime = percent * timelineStore.duration
    // 实时预览 + 实时跳转
    timelineStore.updateSeekingTime(newTime)
    timelineStore.seek(newTime)
  }
  
  const onMouseUp = () => {
    isDraggingProgress.value = false
    // 结束拖拽，执行实际 seek
    timelineStore.stopSeeking()
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
  
  // 初始化转场回退视频元素
  transitionVideoB = document.createElement('video')
  transitionVideoB.muted = true
  transitionVideoB.preload = 'auto'
  
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

// 渲染循环（高性能优化版）
// 核心优化：使用局部变量跟踪渲染时间，降低 Pinia 更新频率
let localRenderTime = 0        // 局部渲染时间（不触发响应式）
let lastSyncTime = 0           // 上次同步到 Pinia 的时间
const SYNC_INTERVAL = 50       // 同步间隔（毫秒）- 20fps 足够 UI 更新

function startRenderLoop() {
  let lastFrameTime = performance.now()
  localRenderTime = timelineStore.currentTime  // 初始化为当前时间
  
  const render = () => {
    const now = performance.now()
    const deltaTime = (now - lastFrameTime) / 1000
    lastFrameTime = now
    
    if (timelineStore.isPlaying) {
      // 使用媒体元素时间或 deltaTime 更新局部渲染时间
      let syncedFromMedia = false
      
      // 从音频同步（如果有）
      if (audioElement && !audioElement.paused && currentAudioMaterialId) {
        const activeClips = timelineStore.getActiveClips(localRenderTime)
        const audioClip = activeClips.find(c => {
          const m = resourceStore.getMaterial(c.materialId ?? '')
          return m?.type === 'audio'
        })
        if (audioClip) {
          localRenderTime = audioElement.currentTime - audioClip.inPoint + audioClip.startTime
          syncedFromMedia = true
        }
      }
      
      // 从视频同步（如果有）
      if (!syncedFromMedia && videoElement && !videoElement.paused) {
        const activeClips = timelineStore.getActiveClips(localRenderTime)
        const videoClip = activeClips.find(c => {
          const m = resourceStore.getMaterial(c.materialId ?? '')
          return m?.type === 'video'
        })
        if (videoClip) {
          // 从视频元素时间反推时间线时间
          // 确保结果在片段范围内
          const clipMediaTime = videoElement.currentTime
          const clipTimelineTime = clipMediaTime - videoClip.inPoint + videoClip.startTime
          
          // 边界保护：确保时间在片段范围内
          if (clipTimelineTime >= videoClip.startTime && 
              clipTimelineTime <= videoClip.startTime + videoClip.duration) {
            localRenderTime = clipTimelineTime
            syncedFromMedia = true
          }
        }
      }
      
      // 没有媒体时使用 deltaTime
      if (!syncedFromMedia) {
        localRenderTime += deltaTime
      }
      
      // 边界检查：确保不超出范围
      localRenderTime = Math.max(0, Math.min(localRenderTime, timelineStore.duration))
      
      // 到达末尾时停止
      if (localRenderTime >= timelineStore.duration) {
        timelineStore.pause()
        localRenderTime = 0
        timelineStore.seek(0)
      }
      
      // 低频同步到 Pinia（每 SYNC_INTERVAL 毫秒）
      if (now - lastSyncTime > SYNC_INTERVAL) {
        timelineStore.seek(localRenderTime)
        lastSyncTime = now
      }
    } else {
      // 非播放状态时，始终使用 currentTime（seek 会更新它）
      // isSeeking 时使用 seekingTime 以获得更快的响应
      localRenderTime = timelineStore.currentTime
    }
    
    // 使用局部时间渲染当前帧
    renderCurrentFrame(localRenderTime)
    
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

// 缩略图缓存（用于拖拽预览）
const thumbnailCache = new Map<string, HTMLImageElement>()

// 渲染缩略图帧（拖拽时使用）
function renderThumbnailFrame(frameUrl: string, cacheKey: string) {
  if (!renderer) return
  
  // 检查缓存
  const cached = thumbnailCache.get(cacheKey)
  if (cached && cached.complete) {
    renderer.renderFrame(cached)
    return
  }
  
  // 检查是否已在加载
  if (cached) return
  
  // 加载新图片
  const img = new Image()
  img.crossOrigin = 'anonymous'
  thumbnailCache.set(cacheKey, img)
  
  img.onload = () => {
    if (renderer && timelineStore.isSeeking) {
      renderer.renderFrame(img)
    }
  }
  
  img.src = frameUrl
}

// 渲染当前帧
  // 预加载转场视频（提前 1.5 秒）
  const checkPreloadTransition = (currentTime: number) => {
    // 简单遍历查找下一个即将到来的转场
    for (const transition of timelineStore.transitions) {
      const track = timelineStore.tracks.find(t => t.clips.some(c => c.id === transition.clipBId))
      const clipB = track?.clips.find(c => c.id === transition.clipBId)
      
      if (clipB) {
        const transitionStart = clipB.startTime - transition.duration / 2
        
        // 如果转场在未来 1.5 秒内，且尚未加载
        if (transitionStart > currentTime && transitionStart < currentTime + 1.5) {
           const materialB = resourceStore.getMaterial(clipB.materialId ?? '')
           const videoUrlB = materialB?.hlsUrl ?? materialB?.blobUrl ?? ''
           
           if (videoUrlB && transitionVideoB && transitionVideoB.src !== videoUrlB) {
             console.log('[Player] Preloading transition video:', videoUrlB)
             transitionVideoB.src = videoUrlB
             transitionVideoB.load()
             // 预加载不播放
             transitionVideoB.pause()
             transitionVideoB.currentTime = clipB.inPoint
           }
           break
        }
      }
    }
  }

  // 渲染贴纸层
  function renderStickers(_renderTime: number) {
     // 预览模式下，贴纸完全由 LeaferJS 层负责渲染 (所见即所得)
     // WebGL 仅用于 Export
  }

  // 统一后期渲染 (贴纸 + 字幕)
  function renderPostEffects(time: number) {
     renderStickers(time)
     renderSubtitles(time)
  }

function renderCurrentFrame(renderTime: number) {
    // 检查预加载
    if (timelineStore.isPlaying) {
      checkPreloadTransition(renderTime)
    }
  if (!renderer || !videoElement) return
  
  // 同步音量 (限制在 0-1 之间防止报错)
  videoElement.volume = Math.min(1.0, Math.max(0, timelineStore.volume))
  
  // 获取当前时间点的所有活跃片段（使用传入的渲染时间）
  const activeClips = timelineStore.getActiveClips(renderTime)
  
  // 检查是否在转场区域
  const transitionInfo = timelineStore.getTransitionAt(renderTime)
  if (transitionInfo) {
    // 在转场区域，使用 WebGL GPU 加速渲染
    const { transition, progress, clipA, clipB } = transitionInfo
    
    const materialA = resourceStore.getMaterial(clipA.materialId ?? '')
    const materialB = resourceStore.getMaterial(clipB.materialId ?? '')
    
    if (materialA && materialB) {
      // 计算两个片段的时间点
      const clipTimeA = renderTime - clipA.startTime + clipA.inPoint
      const clipTimeB = renderTime - clipB.startTime + clipB.inPoint
      
      // 获取缩略图帧
      const filmstripA = frameExtractor.getFilmstripCache(materialA.id)
      const filmstripB = frameExtractor.getFilmstripCache(materialB.id)
      
      // 获取帧图片
      const getFrameImage = (filmstrip: { frames: string[]; interval: number } | null, clipTime: number): HTMLImageElement | null => {
        if (!filmstrip || filmstrip.frames.length === 0) return null
        
        const frameIndex = Math.min(
          Math.floor(clipTime / filmstrip.interval),
          filmstrip.frames.length - 1
        )
        const frameUrl = filmstrip.frames[Math.max(0, frameIndex)]
        
        const cachedImg = frameImageCache.get(frameUrl)
        if (cachedImg && cachedImg.complete) return cachedImg
        
        if (!cachedImg) {
          const img = new Image()
          img.src = frameUrl
          frameImageCache.set(frameUrl, img)
        }
        
        return null
      }
      
      const frameA = getFrameImage(filmstripA, clipTimeA)
      const frameB = getFrameImage(filmstripB, clipTimeB)
      
      // 使用 WebGL GPU 加速转场渲染（更丝滑）
      if (frameA && frameB && renderer) {
        renderer.renderTransition(frameA, frameB, progress, transition.type)
        
        
        const subtitleTime = timelineStore.isSeeking ? timelineStore.seekingTime : timelineStore.currentTime
        renderPostEffects(subtitleTime)
        return
      }
      
      // 回退：使用视频元素
      if (videoElement.readyState >= 2 && transitionVideoB && transitionVideoB.readyState >= 2 && renderer) {
        const videoUrlB = materialB.hlsUrl ?? materialB.blobUrl ?? ''
        if (transitionVideoB.src !== videoUrlB && videoUrlB) {
          transitionVideoB.src = videoUrlB
          transitionVideoB.load()
        }
        
        // 优化：播放状态下使用 play() 保持同步，而不是每帧 seek
        if (timelineStore.isPlaying && transitionVideoB.paused) {
           transitionVideoB.play().catch(() => {})
        } else if (!timelineStore.isPlaying && !transitionVideoB.paused) {
           transitionVideoB.pause()
        }
        
        // 只在时间漂移较大时进行修正
        if (Math.abs(transitionVideoB.currentTime - clipTimeB) > 0.1) {
          transitionVideoB.currentTime = clipTimeB
        }
        
        renderer.renderTransition(videoElement, transitionVideoB, progress, transition.type)
        
        const subtitleTime = timelineStore.isSeeking ? timelineStore.seekingTime : timelineStore.currentTime
        renderPostEffects(subtitleTime)
        return
      }
    }
  }
  
  // 找到视频片段
  let videoClip = activeClips.find(c => {
    const material = resourceStore.getMaterial(c.materialId ?? '')
    return material?.type === 'video'
  })
  
  // [修复] 转场连贯性：转场期间强制 Main Player 保持在 Clip A
  // 避免转场中途 Main Player 切换到 Clip B 导致画面跳变
  if (transitionInfo && transitionInfo.clipA) {
    const materialA = resourceStore.getMaterial(transitionInfo.clipA.materialId ?? '')
    if (materialA && materialA.type === 'video') {
       videoClip = transitionInfo.clipA
    }
  }
  
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
      // 使用 renderTime 计算片段内时间
      const clipTime = renderTime - videoClip.startTime + videoClip.inPoint
      const videoUrl = material.hlsUrl ?? material.blobUrl ?? ''
      
      // 拖拽时：使用预生成的缩略图实现实时预览（不卡顿）
      if (timelineStore.isSeeking) {
        // 暂停视频播放
        if (videoElement && !videoElement.paused) {
          videoElement.pause()
        }
        
        // 从 filmstrip 获取最近的缩略图
        const filmstrip = frameExtractor.getFilmstripCache(material.id)
        if (filmstrip && filmstrip.frames.length > 0) {
          // 计算帧索引
          const frameIndex = Math.min(
            Math.floor(clipTime / filmstrip.interval),
            filmstrip.frames.length - 1
          )
          const frameUrl = filmstrip.frames[Math.max(0, frameIndex)]
          
          // 使用缓存的图片渲染
          renderThumbnailFrame(frameUrl, material.id + '_' + frameIndex)
        } else if (videoElement && videoElement.readyState >= 2) {
          // 没有缩略图时使用视频当前帧
          renderer.renderFrame(videoElement)
        } else if (transitionVideoB && transitionVideoB.readyState >= 2) {
          // [修复] 平滑切换：如果 Main Player 尚未准备好（例如转场刚结束切换到 B），
          // 尝试使用预加载了 B 的 Aux Player 进行渲染，避免黑屏
          const material = resourceStore.getMaterial(videoClip.materialId ?? '')
          const targetUrl = material?.hlsUrl ?? material?.blobUrl
          if (targetUrl && transitionVideoB.src === targetUrl) {
             renderer.renderFrame(transitionVideoB)
          }
        }
        return
      }
      
      // 正常播放时的渲染逻辑
      const currentSrc = hlsPlayer?.getCurrentSource() ?? videoElement.src
      if (currentSrc !== videoUrl && videoUrl) {
        loadVideoSource(videoUrl)
        needsInitialSeek = true  // 加载新源时需要 seek
      }
      
      // 只在以下情况 seek，而不是每帧都 seek
      // 1. 切换到不同的视频片段
      // 2. 加载新视频源后的初始 seek
      // 3. 播放状态刚开始时的同步
      // 4. 暂停状态下用户跳转到新位置（时间差超过阈值）
      const isNewClip = videoClip.id !== lastVideoClipId
      const isJustStartedPlaying = timelineStore.isPlaying && videoElement.paused
      const isPausedAndNeedsSeek = !timelineStore.isPlaying && 
        Math.abs(videoElement.currentTime - clipTime) > 0.05
      
      if (!isHLSSource.value && (isNewClip || needsInitialSeek || isJustStartedPlaying || isPausedAndNeedsSeek)) {
        // 只有在这些情况下才 seek
        if (videoElement.readyState >= 1) {
          videoElement.currentTime = clipTime
          lastVideoClipId = videoClip.id
          needsInitialSeek = false
        }
      }
      
      if (timelineStore.isPlaying && videoElement.paused) {
        videoElement.play().catch(() => {})
      } else if (!timelineStore.isPlaying && !videoElement.paused) {
        videoElement.pause()
      }
      
      // [修复] 防止源切换时的脏帧：如果正在切换片段(isNewClip)，
      // 即使 readyState 还没变，也不应该渲染 videoElement（它可能还持有上一段的画面）
      if (!isNewClip && videoElement.readyState >= 2) {
        // 计算片段内时间（用于特效）
        const clipTime = renderTime - videoClip.startTime + videoClip.inPoint
        
        // 获取当前片段的特效列表
        const clipEffects = effectsStore.getActiveEffects(videoClip.id, clipTime)
        
        if (clipEffects.length > 0) {
          // 有特效时，使用带特效的渲染
          renderer.renderFrameWithEffects(videoElement, clipEffects, clipTime, renderTime)
        } else {
          // 无特效时，使用普通渲染
          renderer.renderFrame(videoElement)
        }
        
        const subtitleTime = timelineStore.isSeeking ? timelineStore.seekingTime : timelineStore.currentTime
        renderPostEffects(subtitleTime)
        
      } else if (transitionVideoB && transitionVideoB.readyState >= 2) {
        // [修复] 平滑切换：如果 Main Player 尚未准备好（例如转场刚结束切换到 B），
        // 尝试使用预加载了 B 的 Aux Player 进行渲染，避免黑屏
        const material = resourceStore.getMaterial(videoClip.materialId ?? '')
        const targetUrl = material?.hlsUrl ?? material?.blobUrl
        if (targetUrl && transitionVideoB.src === targetUrl) {
             // [修复] 确保在 Handoff 接管期间 Aux Player 保持同步播放，防止画面静止
             // 1. 同步播放状态
             if (timelineStore.isPlaying && transitionVideoB.paused) {
               transitionVideoB.play().catch(() => {})
             } else if (!timelineStore.isPlaying && !transitionVideoB.paused) {
               transitionVideoB.pause()
             }
             
             // 2. 同步时间漂移 (因为在转场结束后 transitionInfo 块不再执行同步逻辑)
             const clipTime = renderTime - videoClip.startTime + videoClip.inPoint
             if (Math.abs(transitionVideoB.currentTime - clipTime) > 0.1) {
               transitionVideoB.currentTime = clipTime
             }
             
             // console.log('[Player] Using Aux Player for smooth handoff')
             renderer.renderFrame(transitionVideoB)
             
             const subtitleTime = timelineStore.isSeeking ? timelineStore.seekingTime : timelineStore.currentTime
             renderPostEffects(subtitleTime)
             return
        }
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
        img.src = material.blobUrl || ''
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
  
  // 渲染字幕（叠加在视频/图片之上）
  const subtitleTime = timelineStore.isSeeking ? timelineStore.seekingTime : timelineStore.currentTime
  renderSubtitles(subtitleTime)
  
  // 处理独立音频轨道
  if (audioClip && audioClip.materialId && audioElement) {
    const material = resourceStore.getMaterial(audioClip.materialId)
    if (material && material.type === 'audio') {
      // 使用片段独立音量（0-100 转为 0-1），如果没有设置则使用默认 40
      // [修复] 限制音量在 0-1 之间，防止超过 100% 时报错
      const finalVolume = ((audioClip.volume ?? 40) / 100) * timelineStore.volume
      audioElement.volume = Math.min(1.0, Math.max(0, finalVolume))
      
      const clipTime = timelineStore.currentTime - audioClip.startTime + audioClip.inPoint
      
      // 检查是否需要加载新的音频源
      if (currentAudioMaterialId !== audioClip.materialId) {
        console.log('[Player] 加载音频素材:', material.name)
        audioElement.src = material.blobUrl || ''
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

// 渲染字幕（使用独立的 2D Canvas 层）
function renderSubtitles(currentTime: number) {
  if (!subtitleCanvasRef.value) return
  
  const ctx = subtitleCanvasRef.value.getContext('2d')
  if (!ctx) return
  
  // 清除字幕层
  ctx.clearRect(0, 0, displaySize.value.width, displaySize.value.height)
  
  // 获取文字轨道片段
  const textClips = timelineStore.getActiveClips(currentTime).filter(clip => {
    const track = timelineStore.tracks.find(t => t.id === clip.trackId)
    return track?.type === 'text'
  })
  
  // 渲染每个字幕
  for (const clip of textClips) {
    if (clip.subtitle) {
      subtitleRenderer.render(clip.subtitle, {
        ctx,
        canvasWidth: displaySize.value.width,
        canvasHeight: displaySize.value.height,
        currentTime,
        clipStartTime: clip.startTime,
        clipDuration: clip.duration
      })
    } else if (clip.text) {
      // 兼容旧格式
      subtitleRenderer.render({
        text: clip.text,
        style: {
          fontFamily: 'Microsoft YaHei, sans-serif',
          fontSize: clip.fontSize ?? 48,
          fontWeight: 'normal',
          fontStyle: 'normal',
          color: clip.fontColor ?? '#ffffff',
          strokeEnabled: true,
          strokeColor: '#000000',
          strokeWidth: 2,
          textAlign: 'center',
          lineHeight: 1.4
        },
        position: { x: 50, y: 85 }
      }, {
        ctx,
        canvasWidth: displaySize.value.width,
        canvasHeight: displaySize.value.height,
        currentTime,
        clipStartTime: clip.startTime,
        clipDuration: clip.duration
      })
    }
  }
}

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
        const videoUrl = material.hlsUrl ?? material.blobUrl ?? ''
        if (videoUrl) loadVideoSource(videoUrl)
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

// ==================== 贴纸交互 ====================
// ==================== Leafer 贴纸交互 ====================
const leaferContainer = ref<HTMLElement | null>(null)
let leaferApp: any = null
const leaferObjects = new Map<string, LeaferImage>()
const isInteracting = ref(false) // 交互锁

onMounted(() => {
  initLeafer()
})

onUnmounted(() => {
  if (leaferApp) {
    leaferApp.destroy()
    leaferApp = null
  }
})

function initLeafer() {
  if (!leaferContainer.value) return

  try {
    leaferApp = new App({
      view: leaferContainer.value,
      editor: { editSize: 'scale' }, // 底层核心：让编辑器修改 scale 而不是 width/height
      fill: 'rgba(0,0,0,0)',
      tree: {}
    })
    
    // 监听变换 (Editor 触发的事件可能不一致，保险起见监听对象事件)
    
    // [临时禁用] 这个全局 pointer.up 可能会干扰正常的事件流程
    // leaferApp.tree.on('pointer.up', () => {
    //     if (isInteracting.value) {
    //         isInteracting.value = false
    //         // 触发一次全量同步
    //         leaferObjects.forEach(obj => syncLeaferToStore(obj))
    //     }
    // })
    
    // 点击选中
    leaferApp.tree.on('tap', (e: any) => {
         // tap event target might be inner content?
         // search up or check target
         const target = e.target
         if (target && target.clipId) {
             timelineStore.selectClip(target.clipId)
         }
    })
  } catch (e) {
    console.error('Leafer init failed:', e)
  }
}

// 监听 Active Clips 同步
watch(() => timelineStore.getActiveClips(timelineStore.currentTime), (clips) => {
    syncStoreToLeafer(clips)
}, { deep: true })

// 监听选中状态，同步 Leafer 选中
watch(() => timelineStore.selectedClipId, (id) => {
    if (!leaferApp) return
    if (id) {
       const obj = leaferObjects.get(id)
       if (obj) {
           leaferApp.editor.select(obj)
       }
    } else {
       leaferApp.editor.cancel()
    }
})

function syncStoreToLeafer(clips: import('@/types').Clip[]) {
    if (!leaferApp) return
    
    // 筛选贴纸类型的片段
    const stickers = clips.filter(c => {
         const m = resourceStore.getMaterial(c.materialId || '')
         return m?.type === 'sticker'
    })
    
    const activeIds = new Set(stickers.map(c => c.id))
    
    // ============ 第一步：清理不再活跃的贴纸 ============
    for (const [id, obj] of leaferObjects) {
        if (!activeIds.has(id)) {
            obj.remove()
            leaferObjects.delete(id)
        }
    }
    
    // ============ 第二步：创建或更新贴纸 ============
    stickers.forEach(clip => {
        const existingObj = leaferObjects.get(clip.id)
        const mat = resourceStore.getMaterial(clip.materialId || '')
        if (!mat) return
        
        // 获取画布尺寸用于坐标转换
        const viewW = leaferContainer.value?.clientWidth || leaferApp!.width || 640
        const viewH = leaferContainer.value?.clientHeight || leaferApp!.height || 360
        
        // 从 Store 读取变换数据（这是唯一的数据源）
        const transform = clip.transform || { x: 50, y: 50, scale: 1, rotation: 0, opacity: 1 }
        
        // 坐标转换：百分比 -> 像素
        const pixelX = (transform.x / 100) * viewW
        const pixelY = (transform.y / 100) * viewH
        
        // 素材尺寸（作为 scale 的基准）
        const baseW = mat.width || 100
        const baseH = mat.height || 100
        
        if (!existingObj) {
            // ============ 创建新贴纸 ============
            // 优先使用 scaleX/scaleY，否则回退到 scale
            const effectiveScaleX = transform.scaleX ?? transform.scale
            const effectiveScaleY = transform.scaleY ?? transform.scale
            
            console.log('[Sticker CREATE]', {
                clipId: clip.id,
                effectiveScaleX, effectiveScaleY,
                baseW, baseH
            })
            
            const newObj = new LeaferImage({
                id: clip.id,
                url: mat.blobUrl || mat.thumbnail,
                width: baseW,
                height: baseH,
                x: pixelX,
                y: pixelY,
                scaleX: effectiveScaleX,
                scaleY: effectiveScaleY,
                rotation: transform.rotation,
                opacity: transform.opacity,
                around: 'center',
                editable: { }, // 移除 aspectRatio: true，允许非等比缩放
                zIndex: 10
            })
            
            // [调试] 验证创建后的实际 scale 值
            console.log('[Sticker CREATED] actual values:', {
                clipId: clip.id,
                'newObj.scaleX': newObj.scaleX,
                'newObj.scaleY': newObj.scaleY,
                'newObj.width': newObj.width,
                'newObj.height': newObj.height,
                'transform.scale input': transform.scale
            })
            
            // [关键修复] 捕获图片加载后 Leafer 可能自动调整尺寸的情况
            const targetScaleX = effectiveScaleX
            const targetScaleY = effectiveScaleY
            const targetWidth = baseW
            const targetHeight = baseH
            newObj.on('load', () => {
                console.log('[Sticker LOAD] image loaded:', {
                    'before width': newObj.width,
                    'before height': newObj.height,
                    'before scaleX': newObj.scaleX,
                    'before scaleY': newObj.scaleY,
                    targetWidth, targetHeight, targetScaleX, targetScaleY
                })
                // 强制恢复到保存的尺寸和 scale 值
                newObj.width = targetWidth
                newObj.height = targetHeight
                newObj.scaleX = targetScaleX
                newObj.scaleY = targetScaleY
                console.log('[Sticker LOAD] after restore:', {
                    'width': newObj.width,
                    'height': newObj.height,
                    'scaleX': newObj.scaleX,
                    'scaleY': newObj.scaleY
                })
            })
            
            // 绑定交互事件
            newObj.on('drag.end', () => syncLeaferToStore(newObj))
            newObj.on('rotate.end', () => syncLeaferToStore(newObj))
            newObj.on('scale.end', () => syncLeaferToStore(newObj))
            
            // 交互锁：防止交互过程中被外部同步覆盖
            newObj.on('drag.start', () => { isInteracting.value = true })
            newObj.on('rotate.start', () => { isInteracting.value = true })
            newObj.on('scale.start', () => { isInteracting.value = true })
            newObj.on('drag.end', () => { isInteracting.value = false })
            newObj.on('rotate.end', () => { isInteracting.value = false })
            newObj.on('scale.end', () => { isInteracting.value = false })
            
            leaferApp!.tree.add(newObj)
            leaferObjects.set(clip.id, newObj)
            
            // 自动选中
            if (timelineStore.selectedClipId === clip.id) {
                leaferApp!.editor.select(newObj)
            }
        } else if (!isInteracting.value) {
            // ============ 更新已存在的贴纸（非交互状态下）============
            // 优先使用 scaleX/scaleY，否则回退到 scale
            const effectiveScaleX = transform.scaleX ?? transform.scale
            const effectiveScaleY = transform.scaleY ?? transform.scale
            
            console.log('[Sticker UPDATE] before:', {
                clipId: clip.id,
                effectiveScaleX, effectiveScaleY,
                'obj.scaleX': existingObj.scaleX,
                'obj.scaleY': existingObj.scaleY,
                'obj.width': existingObj.width,
                'obj.height': existingObj.height
            })
            
            // 直接从 Store 同步所有属性
            existingObj.x = pixelX
            existingObj.y = pixelY
            existingObj.scaleX = effectiveScaleX
            existingObj.scaleY = effectiveScaleY
            existingObj.rotation = transform.rotation
            existingObj.opacity = transform.opacity
            
            console.log('[Sticker UPDATE] after:', {
                'obj.scaleX': existingObj.scaleX,
                'obj.scaleY': existingObj.scaleY,
                'obj.width': existingObj.width,
                'obj.height': existingObj.height
            })
        }
    })
}

/**
 * 将 Leafer 对象的状态同步回 Store
 * 这是交互结束后的唯一回写入口
 */
function syncLeaferToStore(obj: any) {
    if (!leaferApp || !obj?.id) return
    
    // 获取画布尺寸用于坐标归一化
    const viewW = leaferContainer.value?.clientWidth || leaferApp.width || 640
    const viewH = leaferContainer.value?.clientHeight || leaferApp.height || 360
    
    // 坐标归一化：像素 -> 百分比
    const percentX = (obj.x / viewW) * 100
    const percentY = (obj.y / viewH) * 100
    
    // [关键修复] 分别存储 scaleX 和 scaleY，支持非等比缩放
    const scaleX = obj.scaleX
    const scaleY = obj.scaleY
    
    console.log('[Sticker SYNC TO STORE]', {
        clipId: obj.id,
        scaleX, scaleY,
        percentX, percentY
    })
    
    // 更新 Store（单一数据源）
    timelineStore.updateClip(obj.id, {
        transform: {
            x: percentX,
            y: percentY,
            scale: scaleX, // 保持向后兼容
            scaleX: scaleX,
            scaleY: scaleY,
            rotation: obj.rotation || 0,
            opacity: obj.opacity ?? 1
        }
    } as any)
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
      
      <canvas 
        ref="subtitleCanvasRef" 
        :width="displaySize.width"
        :height="displaySize.height"
        class="subtitle-canvas"
      />
          <!-- Leafer 交互层 -->
          <div class="leafer-layer" ref="leaferContainer"></div>
      
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

/* 字幕层 Canvas */
.subtitle-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;  /* 允许点击穿透 */
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
  appearance: none;
  background: var(--bg-secondary);
  border-radius: 2px;
  cursor: pointer;
}

/* Leafer 样式 */
.leafer-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 100;
  z-index: 100;
  /* pointer-events: none;  移除此行，确保 Leafer 接收事件 */
  /* Leafer canvas handles events. But if transparency? */
  /* Actually canvas catches all events. We might block clicking on video underneath? */
  /* It's fine for now. */
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
