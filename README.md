# BaseCut - Web 视频剪辑工具

BaseCut 是一款基于 Vue 3 和 WebGL 技术构建的高性能 Web 端视频剪辑工具。它利用现代浏览器技术，实现了离线资源管理、实时视频渲染和高效的媒体处理。

## 🚀 技术栈

- **框架**: [Vue 3](https://vuejs.org/) (Composition API)
- **构建工具**: [Vite](https://vitejs.dev/)
- **状态管理**: [Pinia](https://pinia.vuejs.org/)
- **渲染引擎**: WebGL (自定义渲染器)
- **媒体处理**: [FFmpeg.js](https://ffmpegwasm.netlify.app/) (@ffmpeg/ffmpeg)
- **视频播放**: [hls.js](https://github.com/video-dev/hls.js/)
- **数据持久化**: [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) (使用 `idb` 库)
- **开发语言**: TypeScript

## ✨ 核心功能

- **多轨道编辑**: 支持视频、音频、图片等多种素材的多轨道混合排版与剪辑。
- **WebGL 实时渲染**: 采用自定义 WebGL 渲染引擎，支持视频的实时缩放、裁剪和特效处理。
- **离线资源管理**: 基于 IndexedDB 实现素材的本地存储，确保大文件秒级加载且不丢失。
- **高性能解码**: 集成专属视频解码器与 Worker 管理，平衡 UI 性能与渲染负载。
- **导出与转码**: 利用 FFmpeg.js 在浏览器端直接完成视频的合成与导出。
- **交互式时间轴**: 流畅的缩放、拖拽和切片操作，提供原生般的剪辑体验。

## 📂 项目结构

```text
.
├── public/              # 静态资源
│   ├── ffmpeg/         # FFmpeg Wasm 核心文件 (js/wasm)
│   └── vite.svg        # 网站图标
├── src/                 # 源代码
│   ├── assets/         # 全局样式与静态资源
│   ├── components/     # UI 组件
│   │   ├── layout/     # 整体布局 (MainLayout)
│   │   ├── player/     # 视频渲染与播放控制 (Player)
│   │   ├── property/   # 轨道与素材属性编辑 (PropertyPanel)
│   │   ├── timeline/   # 可视化时间轴 (Timeline)
│   │   └── upload/     # 素材上传与库管理 (MaterialUpload)
│   ├── db/             # 数据持久化层
│   │   └── IndexedDBManager.ts # IndexedDB 操作封装
│   ├── engine/         # 核心渲染与处理引擎
│   │   ├── FFmpegCore.ts    # FFmpeg 命令执行与任务管理
│   │   ├── HLSPlayer.ts     # HLS 流处理与播放
│   │   ├── VideoDecoder.ts  # 视频帧提取与 WebCodecs 集成
│   │   ├── WebGLRenderer.ts # 基于 WebGL 的视频帧渲染
│   │   └── WorkerManager.ts # Web Worker 任务分发与协调
│   ├── stores/         # Pinia 状态管理
│   │   ├── project.ts  # 工程全局配置与序列化
│   │   ├── resource.ts # 媒体资源列表与状态
│   │   └── timeline.ts # 轨道数据与播放指针状态
│   ├── types/          # 全局 TypeScript 类型声明
│   ├── App.vue         # 根组件
│   └── main.ts         # 应用入口与插件初始化
├── index.html           # 页面模板
├── package.json         # 项目依赖与脚本
├── tsconfig.json        # TypeScript 配置
└── vite.config.ts       # Vite 构建配置
```

## 🛠️ 快速开始

### 安装依赖

```bash
pnpm install
```

### 本地开发

```bash
pnpm dev
```

### 打包构建

```bash
pnpm build
```

## 📝 TODO

- [ ] 支持更多视频转场库
- [ ] 增加多轨道音频混合与音效处理
- [ ] 优化 4K 视频的预览性能
- [ ] 导出配置自定义（码率、分辨率等）

---

BaseCut 旨在通过 Web 技术降低视频剪辑的门槛，同时保持专业级的性能表现。
