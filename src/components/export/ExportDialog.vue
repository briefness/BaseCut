<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { ffmpegCore, type ExportClip, type ExportOptions } from '@/engine/FFmpegCore'
import { WebCodecsExporter, webCodecsExporter, type WebCodecsExportClip } from '@/engine/WebCodecsExporter'
import { useTimelineStore } from '@/stores/timeline'
import { useResourceStore } from '@/stores/resource'
import { useProjectStore } from '@/stores/project'

// Props
interface Props {
  visible: boolean
}

const props = defineProps<Props>()

// Emits
const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'close'): void
}>()

// Stores
const timelineStore = useTimelineStore()
const resourceStore = useResourceStore()
const projectStore = useProjectStore()

// 编码器状态
const webCodecsSupported = ref(false)
const useWebCodecs = ref(true)  // 优先使用 WebCodecs
const currentEncoder = ref<'webcodecs' | 'ffmpeg'>('ffmpeg')

// 导出状态
const isExporting = ref(false)
const exportProgress = ref(0)
const exportError = ref<string | null>(null)
const exportSuccess = ref(false)

// 导出设置
const outputFormat = ref<'mp4' | 'webm'>('mp4')
const resolution = ref('project') // 'project' | '1080p' | '720p' | '4k'
const videoBitrate = ref('5M')
const audioBitrate = ref('192k')
const useCustomBitrate = ref(false)

// 分辨率预设
const resolutionPresets = [
  { name: '项目设置', value: 'project' },
  { name: '1080p (1920×1080)', value: '1080p' },
  { name: '720p (1280×720)', value: '720p' },
  { name: '4K (3840×2160)', value: '4k' },
]

// 码率预设
const bitratePresets = [
  { name: '低 (2M)', value: '2M', bps: 2_000_000 },
  { name: '中 (5M)', value: '5M', bps: 5_000_000 },
  { name: '高 (10M)', value: '10M', bps: 10_000_000 },
  { name: '极高 (20M)', value: '20M', bps: 20_000_000 },
]

// 检测 WebCodecs 支持
onMounted(async () => {
  webCodecsSupported.value = WebCodecsExporter.isSupported()
  if (webCodecsSupported.value) {
    const codec = await WebCodecsExporter.getSupportedCodec()
    webCodecsSupported.value = !!codec
    console.log('[ExportDialog] WebCodecs 支持:', webCodecsSupported.value)
  }
})

// 计算导出分辨率
const exportResolution = computed(() => {
  switch (resolution.value) {
    case '1080p': return { width: 1920, height: 1080 }
    case '720p': return { width: 1280, height: 720 }
    case '4k': return { width: 3840, height: 2160 }
    default: return { 
      width: projectStore.canvasWidth, 
      height: projectStore.canvasHeight 
    }
  }
})

// 获取码率数值
const videoBitrateBps = computed(() => {
  const preset = bitratePresets.find(p => p.value === videoBitrate.value)
  return preset?.bps ?? 5_000_000
})

// 获取可导出的片段 (FFmpeg 格式)
const exportableClips = computed(() => {
  const clips: ExportClip[] = []
  
  for (const track of timelineStore.videoTracks) {
    for (const clip of track.clips) {
      if (!clip.materialId) continue
      
      const material = resourceStore.getMaterial(clip.materialId)
      if (!material || material.type !== 'video') continue
      
      // 需要有本地文件才能导出
      if (!material.file) {
        console.warn('[ExportDialog] 跳过无本地文件的片段:', clip.id)
        continue
      }
      
      clips.push({
        file: material.file,
        startTime: clip.startTime,
        duration: clip.duration,
        inPoint: clip.inPoint,
        outPoint: clip.outPoint
      })
    }
  }
  
  return clips.sort((a, b) => a.startTime - b.startTime)
})

// 获取可导出的字幕（用于 WebCodecs 导出）
const exportableSubtitles = computed(() => {
  const subtitles: { subtitle: import('@/types').Subtitle; startTime: number; duration: number }[] = []
  
  // 遍历所有 text 类型轨道
  for (const track of timelineStore.tracks) {
    if (track.type !== 'text') continue
    
    for (const clip of track.clips) {
      if (!clip.subtitle) continue
      
      subtitles.push({
        subtitle: clip.subtitle,
        startTime: clip.startTime,
        duration: clip.duration
      })
    }
  }
  
  return subtitles.sort((a, b) => a.startTime - b.startTime)
})

// 音频片段信息（用于准备 AudioBuffer）
interface AudioClipInfo {
  materialId: string
  file?: File
  url?: string
  startTime: number
  duration: number
  inPoint: number
  outPoint: number
  volume: number
}

// 获取可导出的音频片段信息
const exportableAudioInfo = computed(() => {
  const audioInfos: AudioClipInfo[] = []
  
  // 遍历所有 audio 类型轨道
  for (const track of timelineStore.tracks) {
    if (track.type !== 'audio') continue
    
    for (const clip of track.clips) {
      if (!clip.materialId) continue
      
      const material = resourceStore.getMaterial(clip.materialId)
      if (!material || material.type !== 'audio') continue
      
      audioInfos.push({
        materialId: clip.materialId,
        file: material.file,
        url: material.blobUrl,  // 使用 blobUrl
        startTime: clip.startTime,
        duration: clip.duration,
        inPoint: clip.inPoint,
        outPoint: clip.outPoint,
        volume: clip.volume ?? 0.4  // 默认音量 0.4
      })
    }
  }
  
  return audioInfos.sort((a, b) => a.startTime - b.startTime)
})

// 检查是否可以导出
const canExport = computed(() => {
  return exportableClips.value.length > 0 && !isExporting.value
})

// 实际使用的编码器
const actualEncoder = computed(() => {
  if (useWebCodecs.value && webCodecsSupported.value && outputFormat.value === 'mp4') {
    return 'webcodecs'
  }
  return 'ffmpeg'
})

// 编码器描述
const encoderDescription = computed(() => {
  if (actualEncoder.value === 'webcodecs') {
    return '⚡ WebCodecs (硬件加速)'
  }
  return '🔧 FFmpeg WASM (软件编码)'
})

// 关闭对话框
function closeDialog() {
  if (isExporting.value) return
  emit('update:visible', false)
  emit('close')
}

// 重置状态
function reset() {
  exportProgress.value = 0
  exportError.value = null
  exportSuccess.value = false
}

// 使用 WebCodecs 导出
async function exportWithWebCodecs(): Promise<Blob> {
  // 准备视频元素
  const webCodecsClips: WebCodecsExportClip[] = []
  
  for (const clip of exportableClips.value) {
    const videoElement = await WebCodecsExporter.createVideoElement(
      URL.createObjectURL(clip.file)
    )
    
    webCodecsClips.push({
      videoElement,
      startTime: clip.startTime,
      duration: clip.duration,
      inPoint: clip.inPoint,
      outPoint: clip.outPoint
    })
  }
  
  // 准备音频片段（解码为 AudioBuffer）
  const audioClips: import('@/engine/WebCodecsExporter').WebCodecsAudioClip[] = []
  const audioContext = new AudioContext()
  
  for (const audioInfo of exportableAudioInfo.value) {
    try {
      let audioBuffer: AudioBuffer | null = null
      
      // 优先使用 File，其次使用 blobUrl
      if (audioInfo.file) {
        const arrayBuffer = await audioInfo.file.arrayBuffer()
        audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
      } else if (audioInfo.url) {
        const response = await fetch(audioInfo.url)
        const arrayBuffer = await response.arrayBuffer()
        audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
      }
      
      if (audioBuffer) {
        audioClips.push({
          audioBuffer,
          startTime: audioInfo.startTime,
          duration: audioInfo.duration,
          inPoint: audioInfo.inPoint,
          outPoint: audioInfo.outPoint,
          volume: audioInfo.volume
        })
        console.log(`[ExportDialog] 音频解码成功: ${audioInfo.materialId}`)
      }
    } catch (e) {
      console.warn(`[ExportDialog] 音频解码失败: ${audioInfo.materialId}`, e)
    }
  }
  
  await audioContext.close()
  
  // 设置进度回调
  webCodecsExporter.onProgress((progress) => {
    exportProgress.value = Math.round(progress * 100)
  })
  
  // 导出视频（包含字幕和音频）
  return webCodecsExporter.export({
    clips: webCodecsClips,
    subtitleClips: exportableSubtitles.value,
    audioClips: audioClips.length > 0 ? audioClips : undefined,
    width: exportResolution.value.width,
    height: exportResolution.value.height,
    frameRate: projectStore.frameRate,
    videoBitrate: useCustomBitrate.value ? videoBitrateBps.value : undefined
  })
}

// 使用 FFmpeg 导出
async function exportWithFFmpeg(): Promise<Blob> {
  ffmpegCore.onProgress((progress) => {
    exportProgress.value = Math.round(progress * 100)
  })
  
  const options: ExportOptions = {
    clips: exportableClips.value,
    outputFormat: outputFormat.value,
    width: exportResolution.value.width,
    height: exportResolution.value.height,
    videoBitrate: useCustomBitrate.value ? videoBitrate.value : undefined,
    audioBitrate: useCustomBitrate.value ? audioBitrate.value : undefined,
    frameRate: projectStore.frameRate
  }
  
  return ffmpegCore.exportVideo(options)
}

// 开始导出
async function startExport() {
  if (!canExport.value) return
  
  reset()
  
  const filename = `${projectStore.projectName || '导出视频'}.${outputFormat.value}`
  console.log(`[ExportDialog] 准备保存文件: ${filename}`)
  
  // 【重要】在用户手势上下文中立即获取文件句柄
  // showSaveFilePicker 必须在用户点击事件的同步上下文中调用
  let fileHandle: FileSystemFileHandle | null = null
  if ('showSaveFilePicker' in window) {
    try {
      fileHandle = await (window as any).showSaveFilePicker({
        suggestedName: filename,
        types: [{
          description: outputFormat.value === 'mp4' ? 'MP4 视频' : 'WebM 视频',
          accept: {
            [outputFormat.value === 'mp4' ? 'video/mp4' : 'video/webm']: [`.${outputFormat.value}`]
          }
        }]
      })
      console.log('[ExportDialog] 已获取文件句柄 (File System Access API)')
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('[ExportDialog] 用户取消保存')
        return
      }
      console.warn('[ExportDialog] File System Access API 不可用，将使用传统下载方式:', err.message)
      fileHandle = null
    }
  }
  
  isExporting.value = true
  currentEncoder.value = actualEncoder.value
  
  const startTime = Date.now()
  
  try {
    let blob: Blob
    
    if (actualEncoder.value === 'webcodecs') {
      console.log('[ExportDialog] 使用 WebCodecs 导出')
      blob = await exportWithWebCodecs()
    } else {
      console.log('[ExportDialog] 使用 FFmpeg WASM 导出')
      blob = await exportWithFFmpeg()
    }
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`[ExportDialog] 导出完成, 耗时 ${elapsed}s, 文件大小: ${(blob.size / 1024 / 1024).toFixed(2)} MB`)
    
    // 使用之前获取的文件句柄写入文件
    if (fileHandle) {
      try {
        const writable = await fileHandle.createWritable()
        await writable.write(blob)
        await writable.close()
        console.log('[ExportDialog] 文件保存成功 (File System Access API)')
        exportSuccess.value = true
        return
      } catch (err: any) {
        console.error('[ExportDialog] 写入文件失败:', err)
        // 写入失败，回退到传统方式
      }
    }
    
    // 回退：传统下载方式
    const url = URL.createObjectURL(blob)
    console.log('[ExportDialog] 准备下载文件: ', url)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    // 延迟释放 URL，确保下载有足够时间开始
    setTimeout(() => URL.revokeObjectURL(url), 60000)
    console.log('[ExportDialog] 文件下载已触发 (传统方式)')
    
    exportSuccess.value = true
  } catch (error) {
    console.error('[ExportDialog] 导出失败:', error)
    exportError.value = error instanceof Error ? error.message : '导出失败'
  } finally {
    isExporting.value = false
  }
}

// 监听 visible 变化，重置状态
watch(() => props.visible, (visible) => {
  if (visible) {
    reset()
  }
})
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="props.visible" class="dialog-overlay" @click.self="closeDialog">
        <div class="dialog">
          <!-- 头部 -->
          <div class="dialog-header">
            <h2>导出视频</h2>
            <button class="close-btn" @click="closeDialog" :disabled="isExporting">
              ✕
            </button>
          </div>
          
          <!-- 内容 -->
          <div class="dialog-body">
            <!-- 导出信息 -->
            <div class="export-info">
              <div class="info-item">
                <span class="label">片段数量</span>
                <span class="value">{{ exportableClips.length }}</span>
              </div>
              <div class="info-item">
                <span class="label">总时长</span>
                <span class="value">{{ timelineStore.duration.toFixed(1) }} 秒</span>
              </div>
              <div class="info-item encoder-info">
                <span class="label">编码器</span>
                <span class="value" :class="{ accelerated: actualEncoder === 'webcodecs' }">
                  {{ encoderDescription }}
                </span>
              </div>
            </div>
            
            <!-- 无可导出内容提示 -->
            <div v-if="exportableClips.length === 0" class="no-clips-warning">
              <span class="warning-icon">⚠️</span>
              <p>时间线上没有可导出的视频片段</p>
              <p class="hint">请先将视频素材添加到时间线</p>
            </div>
            
            <!-- 导出设置 -->
            <div v-else class="export-settings">
              <!-- 输出格式 -->
              <div class="setting-group">
                <label>输出格式</label>
                <div class="radio-group">
                  <label class="radio-item" :class="{ active: outputFormat === 'mp4' }">
                    <input type="radio" v-model="outputFormat" value="mp4" :disabled="isExporting">
                    <span>MP4</span>
                  </label>
                  <label class="radio-item" :class="{ active: outputFormat === 'webm' }">
                    <input type="radio" v-model="outputFormat" value="webm" :disabled="isExporting">
                    <span>WebM</span>
                  </label>
                </div>
              </div>
              
              <!-- 分辨率 -->
              <div class="setting-group">
                <label>分辨率</label>
                <select v-model="resolution" class="select" :disabled="isExporting">
                  <option 
                    v-for="preset in resolutionPresets" 
                    :key="preset.value" 
                    :value="preset.value"
                  >
                    {{ preset.name }}
                  </option>
                </select>
                <span class="resolution-hint">
                  {{ exportResolution.width }} × {{ exportResolution.height }}
                </span>
              </div>
              
              <!-- 自定义码率 -->
              <div class="setting-group">
                <label class="checkbox-label">
                  <input type="checkbox" v-model="useCustomBitrate" :disabled="isExporting">
                  <span>自定义码率</span>
                </label>
              </div>
              
              <div v-if="useCustomBitrate" class="setting-group indent">
                <label>视频码率</label>
                <select v-model="videoBitrate" class="select" :disabled="isExporting">
                  <option 
                    v-for="preset in bitratePresets" 
                    :key="preset.value" 
                    :value="preset.value"
                  >
                    {{ preset.name }}
                  </option>
                </select>
              </div>
              
              <div v-if="useCustomBitrate" class="setting-group indent">
                <label>音频码率</label>
                <select v-model="audioBitrate" class="select" :disabled="isExporting">
                  <option value="128k">128 kbps</option>
                  <option value="192k">192 kbps</option>
                  <option value="256k">256 kbps</option>
                  <option value="320k">320 kbps</option>
                </select>
              </div>
            </div>
            
            <!-- 导出进度 -->
            <div v-if="isExporting" class="export-progress">
              <div class="progress-label">
                <span>正在导出...</span>
                <span>{{ exportProgress }}%</span>
              </div>
              <div class="progress-bar">
                <div class="progress-fill" :style="{ width: exportProgress + '%' }"></div>
              </div>
              <p class="progress-hint">请勿关闭窗口，导出过程可能需要几分钟</p>
            </div>
            
            <!-- 导出结果 -->
            <div v-if="exportSuccess" class="export-result success">
              <span class="result-icon">✓</span>
              <span>导出成功！文件已开始下载</span>
            </div>
            
            <div v-if="exportError" class="export-result error">
              <span class="result-icon">✕</span>
              <span>{{ exportError }}</span>
            </div>
          </div>
          
          <!-- 底部按钮 -->
          <div class="dialog-footer">
            <button class="btn btn-ghost" @click="closeDialog" :disabled="isExporting">
              取消
            </button>
            <button 
              class="btn btn-primary" 
              @click="startExport" 
              :disabled="!canExport"
            >
              <span v-if="isExporting" class="loading-spinner"></span>
              <span v-else>开始导出</span>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog {
  background: var(--bg-secondary);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-secondary);
  width: 480px;
  max-width: 90vw;
  max-height: 85vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-secondary);
}

.dialog-header h2 {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.close-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: var(--radius-md);
  font-size: 16px;
  transition: all var(--transition-fast);
}

.close-btn:hover:not(:disabled) {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.close-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.dialog-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

.export-info {
  display: flex;
  gap: 24px;
  padding: 12px 16px;
  background: var(--bg-tertiary);
  border-radius: var(--radius-md);
  margin-bottom: 20px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-item .label {
  font-size: 12px;
  color: var(--text-tertiary);
}

.info-item .value {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.info-item .value.accelerated {
  color: #22c55e;
}

.encoder-info {
  flex: 1;
  text-align: right;
}

.encoder-info .value {
  font-size: 13px;
  font-weight: 500;
}

.no-clips-warning {
  text-align: center;
  padding: 32px 16px;
  background: rgba(234, 179, 8, 0.1);
  border-radius: var(--radius-md);
  border: 1px solid rgba(234, 179, 8, 0.2);
}

.warning-icon {
  font-size: 32px;
  display: block;
  margin-bottom: 12px;
}

.no-clips-warning p {
  margin: 0;
  color: var(--text-secondary);
}

.no-clips-warning .hint {
  font-size: 13px;
  color: var(--text-tertiary);
  margin-top: 8px;
}

.export-settings {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.setting-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.setting-group.indent {
  margin-left: 24px;
}

.setting-group > label:first-child {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}

.radio-group {
  display: flex;
  gap: 12px;
}

.radio-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: var(--bg-tertiary);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
  border: 1px solid transparent;
}

.radio-item:hover {
  background: var(--bg-hover);
}

.radio-item.active {
  background: var(--primary-light);
  border-color: var(--primary);
}

.radio-item input {
  display: none;
}

.radio-item span {
  font-size: 14px;
  color: var(--text-primary);
}

.select {
  padding: 8px 12px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 14px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.select:hover:not(:disabled) {
  border-color: var(--primary);
}

.select:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 2px var(--primary-light);
}

.select:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.resolution-hint {
  font-size: 12px;
  color: var(--text-tertiary);
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.checkbox-label input {
  width: 16px;
  height: 16px;
  accent-color: var(--primary);
}

.checkbox-label span {
  font-size: 14px;
  color: var(--text-primary);
}

.export-progress {
  margin-top: 20px;
  padding: 16px;
  background: var(--bg-tertiary);
  border-radius: var(--radius-md);
}

.progress-label {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--text-secondary);
}

.progress-bar {
  height: 8px;
  background: var(--bg-primary);
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--primary), #a855f7);
  border-radius: 4px;
  transition: width 0.3s ease;
}

.progress-hint {
  margin: 12px 0 0;
  font-size: 12px;
  color: var(--text-tertiary);
  text-align: center;
}

.export-result {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
  padding: 12px 16px;
  border-radius: var(--radius-md);
}

.export-result.success {
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.3);
  color: #22c55e;
}

.export-result.error {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #ef4444;
}

.result-icon {
  font-size: 16px;
  font-weight: bold;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid var(--border-secondary);
}

.btn {
  padding: 10px 20px;
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-ghost {
  background: transparent;
  border: 1px solid var(--border-primary);
  color: var(--text-secondary);
}

.btn-ghost:hover:not(:disabled) {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.btn-primary {
  background: linear-gradient(135deg, var(--primary), #a855f7);
  border: none;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
  transform: translateY(-1px);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
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

/* 过渡动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-active .dialog,
.fade-leave-active .dialog {
  transition: transform 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.fade-enter-from .dialog,
.fade-leave-to .dialog {
  transform: scale(0.95);
}
</style>
