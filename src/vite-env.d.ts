/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

// WebCodecs API 类型扩展
interface VideoFrame {
  readonly codedWidth: number
  readonly codedHeight: number
  readonly displayWidth: number
  readonly displayHeight: number
  readonly timestamp: number
  readonly duration: number | null
  close(): void
}

interface VideoDecoder {
  readonly state: 'unconfigured' | 'configured' | 'closed'
  readonly decodeQueueSize: number
  configure(config: VideoDecoderConfig): void
  decode(chunk: EncodedVideoChunk): void
  flush(): Promise<void>
  reset(): void
  close(): void
}

interface VideoDecoderConfig {
  codec: string
  codedWidth?: number
  codedHeight?: number
  hardwareAcceleration?: 'no-preference' | 'prefer-hardware' | 'prefer-software'
}

interface EncodedVideoChunk {
  readonly type: 'key' | 'delta'
  readonly timestamp: number
  readonly duration: number | null
  readonly byteLength: number
  copyTo(destination: ArrayBufferView): void
}

declare var VideoDecoder: {
  prototype: VideoDecoder
  new(init: VideoDecoderInit): VideoDecoder
  isConfigSupported(config: VideoDecoderConfig): Promise<VideoDecoderSupport>
}

interface VideoDecoderInit {
  output: (frame: VideoFrame) => void
  error: (error: DOMException) => void
}

interface VideoDecoderSupport {
  supported: boolean
  config: VideoDecoderConfig
}
