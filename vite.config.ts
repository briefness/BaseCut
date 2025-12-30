import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': '/src'
    }
  },
  // 配置 SharedArrayBuffer 所需的 headers（FFmpeg WASM 必需）
  server: {
    port: 5180, // 默认 5180
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    },
    // 允许加载外部资源
    cors: true
  },
  // Worker 配置
  worker: {
    format: 'es'
  },
  // 优化配置
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util']
  },
  build: {
    target: 'esnext'
  }
})
