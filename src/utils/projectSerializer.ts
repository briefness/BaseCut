import { toRaw } from 'vue'
import type { Project, Track, Clip, Effect } from '@/types'

/**
 * 深度移除 Vue 响应式并清理数据
 * 确保数据可以被 Structured Clone (IndexedDB 需要)
 */
export function sanitizeProject(project: Project): Project {
  // 获取原始对象，移除顶层响应式
  const rawProject = toRaw(project)
  
  return {
    id: rawProject.id,
    name: rawProject.name,
    width: rawProject.width,
    height: rawProject.height,
    frameRate: rawProject.frameRate,
    duration: rawProject.duration,
    createdAt: rawProject.createdAt,
    updatedAt: rawProject.updatedAt,
    tracks: rawProject.tracks.map(track => sanitizeTrack(track))
  }
}

function sanitizeTrack(track: Track): Track {
  const rawTrack = toRaw(track)
  
  return {
    id: rawTrack.id,
    type: rawTrack.type,
    name: rawTrack.name,
    muted: rawTrack.muted,
    locked: rawTrack.locked,
    clips: rawTrack.clips.map(clip => sanitizeClip(clip))
  }
}

function sanitizeClip(clip: Clip): Clip {
  const rawClip = toRaw(clip)
  
  const cleanClip: Clip = {
    id: rawClip.id,
    trackId: rawClip.trackId,
    startTime: rawClip.startTime,
    duration: rawClip.duration,
    inPoint: rawClip.inPoint,
    outPoint: rawClip.outPoint,
    effects: rawClip.effects ? rawClip.effects.map(effect => sanitizeEffect(effect)) : []
  }
  
  // 可选属性处理
  if (rawClip.materialId !== undefined) {
    cleanClip.materialId = rawClip.materialId
  }
  
  if (rawClip.transform) {
    cleanClip.transform = toRaw(rawClip.transform)
  }
  
  if (rawClip.volume !== undefined) {
    cleanClip.volume = rawClip.volume
  }
  
  if (rawClip.subtitle) {
    // 深度解包 subtitle
    const rawSubtitle = toRaw(rawClip.subtitle)
    cleanClip.subtitle = {
      text: rawSubtitle.text,
      style: toRaw(rawSubtitle.style),
      position: toRaw(rawSubtitle.position),
    }
    
    if (rawSubtitle.enterAnimation) {
      cleanClip.subtitle.enterAnimation = toRaw(rawSubtitle.enterAnimation)
    }
    
    if (rawSubtitle.exitAnimation) {
      cleanClip.subtitle.exitAnimation = toRaw(rawSubtitle.exitAnimation)
    }
  }
  
  // 以前的废弃字段，如果还在就保留（或者可以在这里清理掉）
  // 为了兼容性暂时保留，但最好是清理掉
  
  return cleanClip
}

function sanitizeEffect(effect: Effect): Effect {
  const rawEffect = toRaw(effect)
  return {
    id: rawEffect.id,
    type: rawEffect.type,
    name: rawEffect.name,
    // params 可能包含各种基本类型，直接深拷贝一个纯对象
    params: JSON.parse(JSON.stringify(toRaw(rawEffect.params)))
  }
}
