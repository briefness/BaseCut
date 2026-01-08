# 纯前端视频编辑器的性能优化实战

> 这是 BaseCut 技术博客系列的第九篇。聊聊在做前端视频编辑器时，我们怎么把"慢到无法使用"优化成"丝滑如原生"。

## 性能是生死线

视频编辑器对性能要求极高。用户拖动时间轴、调整滤镜、预览转场——任何卡顿都会让人抓狂。

一个残酷的事实：

```
1080p 视频 @ 30fps = 每帧 6200 万像素操作
每秒 = 18.6 亿次像素计算
```

如果性能不行，用户拖个进度条就像在玩 PPT。所以性能优化不是"锦上添花"，而是"生死线"。

虽然之前零星的介绍了下性能优化方式，这篇文章会汇总项目里**实际落地**的优化手段。

---

## 一、GPU 加速：WebGL 渲染

### 问题：CPU 扛不住像素级计算

视频滤镜（亮度、对比度、色相）需要对每个像素做数学运算。用 Canvas 2D 的 `getImageData` + 循环，实测：

| 分辨率 | Canvas 2D 帧率 | 体验 |
|--------|--------------|------|
| 480p | 25 fps | 勉强能用 |
| 720p | 12 fps | 明显卡顿 |
| 1080p | 5 fps | 幻灯片 |

### 解决方案：WebGL 着色器

把计算扔给 GPU。GPU 有几千个并行核心，天生适合"对每个像素做同样计算"的场景。

```glsl
// 片段着色器 - 在 GPU 上并行执行
void main() {
  vec4 color = texture2D(u_texture, v_texCoord);
  vec3 rgb = color.rgb;
  
  // 亮度调整
  rgb += u_brightness;
  
  // 对比度调整
  rgb = (rgb - 0.5) * u_contrast + 0.5;
  
  // 色相偏移 (需要 RGB -> HSL -> RGB 转换)
  vec3 hsl = rgb2hsl(rgb);
  hsl.x = mod(hsl.x + u_hue, 1.0);
  hsl.y *= u_saturation;
  rgb = hsl2rgb(hsl);
  
  gl_FragColor = vec4(clamp(rgb, 0.0, 1.0), color.a);
}
```

**优化后实测：**

| 分辨率 | WebGL 帧率 |
|--------|----------|
| 1080p | 60 fps |
| 4K | 45 fps |

性能提升 **10-20 倍**。

### 为什么快？

```
CPU：8-16 个核心，串行处理像素
GPU：几千个核心，并行处理所有像素

1920 x 1080 = 207 万像素
CPU：一个接一个处理 → 慢
GPU：同时处理几千个 → 快
```

---

## 二、视频预加载池：LRU 淘汰策略

### 问题：频繁创建 Video 元素很慢

用户在时间轴切换片段时，如果每次都 `new Video()` + 加载 + 等待 `canplay`，会有明显延迟。

### 解决方案：Video 元素对象池

维护一个固定大小的 Video 元素池，复用已加载的元素：

```typescript
class VideoPool {
  private pool: Map<string, PooledVideo> = new Map()
  private maxSize: number = 6
  
  async preload(materialId: string, url: string) {
    // 1. 已在池中 → 直接返回
    const existing = this.pool.get(materialId)
    if (existing?.ready) {
      existing.lastUsed = Date.now()
      return existing.element
    }
    
    // 2. 池满 → 淘汰最久未使用的
    if (this.pool.size >= this.maxSize) {
      this.evictLRU()
    }
    
    // 3. 加载新视频
    return this.loadVideo(materialId, url)
  }
  
  private evictLRU() {
    let oldest: string | null = null
    let oldestTime = Infinity
    
    for (const [id, video] of this.pool) {
      if (video.lastUsed < oldestTime) {
        oldestTime = video.lastUsed
        oldest = id
      }
    }
    
    if (oldest) {
      const video = this.pool.get(oldest)
      video?.element.pause()
      video!.element.src = ''
      this.pool.delete(oldest)
    }
  }
}
```

### 为什么选 LRU？

**LRU（Least Recently Used）**：淘汰最久未使用的。

视频编辑场景下，用户通常在相邻区域操作。最近用过的素材大概率还会用，不会被淘汰。而很久没访问的素材，继续闲置的概率很高，优先淘汰。

---

## 三、帧提取缓存：避免重复解码

### 问题：时间轴拖动时大量帧提取

时间轴需要显示视频缩略图。用户缩放、拖动时会触发大量帧提取请求。

### 解决方案：多层缓存 + 胶卷预提取

```typescript
class FrameExtractor {
  // 单帧缓存（LRU）
  private cache: Map<string, FrameCacheItem> = new Map()
  private maxCacheSize = 100
  
  // 胶卷缓存：预提取整个视频的关键帧序列
  private filmstrips: Map<string, FilmstripCache> = new Map()
  
  // 正在进行的请求去重
  private pendingRequests: Map<string, Promise<string>> = new Map()
  
  async extractFrame(video, materialId, time) {
    // 1. 缓存命中 → 直接返回
    const cached = this.getFromCache(materialId, time)
    if (cached) return cached
    
    // 2. 防止重复请求
    const cacheKey = this.getCacheKey(materialId, time)
    const pending = this.pendingRequests.get(cacheKey)
    if (pending) return pending
    
    // 3. 发起新请求
    const promise = this.doExtractFrame(video, materialId, time)
    this.pendingRequests.set(cacheKey, promise)
    
    try {
      return await promise
    } finally {
      this.pendingRequests.delete(cacheKey)
    }
  }
}
```

### 胶卷策略：预提取 + 切片

对常用素材预提取整个视频的帧序列（比如每 0.5 秒一帧），后续直接切片使用：

```typescript
// 预提取胶卷
const filmstrip = await frameExtractor.getFilmstrip(
  video, materialId, duration,
  { interval: 0.5 }  // 每 0.5 秒一帧
)

// 获取指定范围的帧
const frames = frameExtractor.getFilmstripSlice(
  filmstrip,
  inPoint,    // 2.0s
  outPoint,   // 5.0s
  targetCount // 需要 6 帧
)
```

**优化效果：**

| 场景 | 无缓存 | 有缓存 |
|------|-------|--------|
| 首次加载 | 需要实时提取 | 需要实时提取 |
| 再次访问 | 需要实时提取 | **立即返回** |
| 相邻帧 | 需要 seek + 提取 | **内存直接切片** |

---

## 四、波形渲染优化

### 问题：长音频波形 Canvas 崩溃

音频波形要渲染到 Canvas 上。当音频很长时（比如 10 分钟），放大后需要的 Canvas 宽度可能超过浏览器限制（通常 32767px），导致崩溃或空白。

### 解决方案：多层优化

#### 1. IntersectionObserver 懒加载

只有波形可见时才提取数据：

```typescript
onMounted(() => {
  observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting && waveformPeaks.value.length === 0) {
        extractWaveform()  // 只在可见时加载
      }
    },
    { threshold: 0.1 }
  )
  
  if (containerRef.value) {
    observer.observe(containerRef.value)
  }
})
```

#### 2. 波形缓存 + LRU

提取一次，缓存复用：

```typescript
class WaveformExtractor {
  private cache: Map<string, WaveformCacheItem> = new Map()
  private maxCacheSize = 50
  
  async extractWaveform(audioUrl, materialId, options) {
    // 缓存命中
    const cached = this.getFromCache(materialId, samplesPerSecond)
    if (cached) return cached
    
    // 防止并发重复请求
    const pending = this.pendingRequests.get(cacheKey)
    if (pending) return pending
    
    // 提取 + 缓存
    const peaks = await this.doExtractWaveform(...)
    this.saveToCache(materialId, samplesPerSecond, peaks, duration)
    return peaks
  }
}
```

#### 3. 防抖更新

裁剪拖动时高频触发更新，用防抖避免卡顿：

```typescript
let debounceTimer: number | null = null

watch(
  () => [props.clip.inPoint, props.clip.outPoint, clipWidth.value],
  () => {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = window.setTimeout(() => {
      updateDisplayWaveform()
    }, 300)  // 300ms 防抖
  }
)
```

---

## 五、Worker 线程池：不阻塞主线程

### 问题：重计算阻塞 UI

某些操作（帧批量提取、音频解码）很耗时，如果在主线程做会卡住界面。

### 解决方案：Web Worker 线程池

```typescript
class WorkerManager {
  private workers: Worker[] = []
  private taskQueue: WorkerTask[] = []
  private busyWorkers: Set<Worker> = new Set()
  private maxWorkers: number
  
  constructor(workerUrl: string, maxWorkers?: number) {
    // 默认使用 CPU 核心数的一半
    this.maxWorkers = maxWorkers ?? Math.max(1, 
      Math.floor(navigator.hardwareConcurrency / 2)
    )
  }
  
  async execute<T>(type: string, payload: unknown): Promise<T> {
    const task = { id: crypto.randomUUID(), type, payload, ... }
    this.taskQueue.push(task)
    this.processQueue()  // 尝试分发任务
    return new Promise(...)
  }
  
  private processQueue() {
    while (this.taskQueue.length > 0) {
      const worker = this.getAvailableWorker()
      if (!worker) break  // 所有 Worker 都忙
      
      const task = this.taskQueue.shift()
      this.busyWorkers.add(worker)
      worker.postMessage({ type: task.type, payload: task.payload, id: task.id })
    }
  }
}
```

### 关键设计：

1. **自动容量**：根据 `navigator.hardwareConcurrency` 决定 Worker 数量
2. **任务队列**：Worker 都忙时，任务排队等待
3. **错误恢复**：Worker 崩溃时自动重建

---

## 六、特效管理：Ping-Pong 渲染

### 问题：多特效叠加的中间结果

用户可能同时开启多个特效：闪光 + 抖动 + 色差。每个特效的输出是下一个的输入。

### 解决方案：Ping-Pong 帧缓冲

```typescript
class EffectManager {
  // 两个帧缓冲来回切换
  private framebuffers: WebGLFramebuffer[] = []
  private textures: WebGLTexture[] = []
  
  initFramebuffers() {
    // 创建两个 FBO + Texture
    for (let i = 0; i < 2; i++) {
      this.framebuffers[i] = gl.createFramebuffer()
      this.textures[i] = gl.createTexture()
      // 绑定纹理到 FBO...
    }
  }
  
  applyEffects(inputTexture, effects, timeInClip) {
    let srcTexture = inputTexture
    let srcIndex = 0
    
    for (const effect of activeEffects) {
      // 渲染到另一个 FBO
      const dstIndex = (srcIndex + 1) % 2
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[dstIndex])
      
      // 应用当前特效
      this.applyEffect(srcTexture, effect)
      
      // Ping-Pong 切换
      srcTexture = this.textures[dstIndex]
      srcIndex = dstIndex
    }
    
    // 最终渲染到屏幕
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    this.renderToScreen(srcTexture)
  }
}
```

### 为什么用 Ping-Pong？

```
传统方法：每个特效都读写同一张纹理
→ 需要复制纹理 → 慢

Ping-Pong：两张纹理交替读写
特效1: 读 A → 写 B
特效2: 读 B → 写 A
特效3: 读 A → 写 B
→ 不需要复制 → 快
```

---

## 七、纯函数 + 无状态设计

### 问题：状态污染难调试

动画引擎需要在任意时刻计算某帧的变换矩阵。如果依赖内部状态，渲染和导出可能结果不一致。

### 解决方案：纯函数设计

```typescript
// AnimationEngine - 完全无状态
export const AnimationEngine = {
  // 给定输入，输出确定
  getAnimatedTransform(
    animation: ClipAnimation | null,
    timeInClip: number
  ): AnimatedTransform {
    if (!animation) {
      return { 
        x: 0, y: 0, 
        scaleX: 1, scaleY: 1, 
        rotation: 0, 
        opacity: 1 
      }
    }
    
    return {
      x: getPropertyValue(animation.tracks, 'x', timeInClip),
      y: getPropertyValue(animation.tracks, 'y', timeInClip),
      scaleX: getPropertyValue(animation.tracks, 'scaleX', timeInClip),
      // ...
    }
  },
  
  // 纯数学计算，无副作用
  createTransformMatrix(transform: AnimatedTransform): Float32Array {
    // 4x4 矩阵生成，无状态
  }
}
```

### 好处：

1. **预览和导出一致**：相同输入 → 相同输出
2. **易测试**：不需要 mock 状态
3. **可并行**：无状态 = 线程安全

---

## 八、着色器程序懒加载

### 问题：特效着色器编译耗时

WebGL 着色器需要编译，10 个特效就是 10 次编译。

### 解决方案：按需编译 + 缓存

```typescript
class EffectManager {
  private programCache: Map<VideoEffectType, CompiledEffectProgram> = new Map()
  
  getOrCreateProgram(type: VideoEffectType) {
    // 1. 缓存命中
    const cached = this.programCache.get(type)
    if (cached) return cached
    
    // 2. 按需编译
    const shaders = getEffectShaders(type)
    const program = this.renderContext!.createProgram(
      shaders.vertex, 
      shaders.fragment
    )
    
    // 3. 缓存程序
    const compiled = { 
      program, 
      uniforms: this.extractUniforms(program, type),
      attributes: this.extractAttributes(program)
    }
    this.programCache.set(type, compiled)
    
    return compiled
  }
}
```

**优化效果：**

| 场景 | 编译时机 |
|------|---------|
| 闪光特效首次使用 | 编译 1 次 |
| 闪光特效再次使用 | 缓存命中，0 次编译 |
| 抖动特效首次使用 | 编译 1 次 |

---

## 小结

| 优化手段 | 解决的问题 | 核心技术 |
|---------|-----------|---------|
| WebGL 渲染 | 滤镜计算慢 | GPU 并行着色器 |
| Video 对象池 | 视频加载延迟 | LRU 淘汰策略 |
| 帧提取缓存 | 缩略图重复提取 | 多层缓存 + 胶卷预提取 |
| 波形懒加载 | 长音频 Canvas 崩溃 | IntersectionObserver + 防抖 |
| Worker 线程池 | 重计算阻塞 UI | 多线程 + 任务队列 |
| Ping-Pong FBO | 多特效叠加 | 双缓冲交替渲染 |
| 纯函数设计 | 状态污染 | 无副作用 + 确定性输出 |
| 着色器懒编译 | 特效初始化慢 | 按需编译 + 程序缓存 |

性能优化没有银弹，关键是**找到瓶颈**，**对症下药**。

---

**系列目录**

1. [x] [技术选型与项目结构](./01-architecture.md)
2. [x] [时间轴数据模型](./02-timeline-state.md)
3. [x] [WebGL 渲染与滤镜](./03-webgl-rendering.md)
4. [x] [转场动画实现](./04-transitions.md)
5. [x] [WebCodecs 视频导出](./05-webcodecs-export.md)
6. [x] [LeaferJS 贴纸系统](./06-leaferjs-sticker.md)
7. [x] [特效系统](./07-effect-system.md)
8. [x] [关键帧动画](./08-keyframe-animation.md)
9. [x] 性能优化实战（本文）
