export interface ElectronAPI {
  generateImage(request: {
    prompt: string
    model: string
    apiKey: string
    aspectRatio: string
    resolution: string
    count: number
    requestId: string
    attachments?: string[]
    labeledAttachments?: { label: string; images: string[] }[]
    negativePrompt?: string
    seed?: number
  }): Promise<{
    success: boolean
    results?: Array<{
      status: 'complete' | 'error' | 'cancelled'
      result?: { id: string; text?: string; imageBase64?: string }
      error?: string
    }>
    error?: string
  }>

  onGenerateProgress(callback: (data: {
    requestId: string
    index: number
    status: 'complete' | 'error'
    result?: { id: string; text?: string; imageBase64?: string }
    error?: string
  }) => void): () => void

  saveImage(base64DataUrl: string, filename: string): Promise<{ success: boolean; filePath?: string; error?: string }>
  exportImage(base64DataUrl: string, defaultName: string): Promise<{ success: boolean; filePath?: string; cancelled?: boolean; error?: string }>
  startDrag(filePath: string): void
  compressImage(base64DataUrl: string, maxWidth?: number): Promise<{ success: boolean; base64DataUrl?: string; error?: string }>

  getSettings(): Promise<Record<string, unknown>>
  setSetting(key: string, value: unknown): Promise<{ success: boolean }>

  listHistory(): Promise<{ success: boolean; sessions?: Array<{ id: string; data: string }>; error?: string }>
  saveHistory(id: string, data: string): Promise<{ success: boolean; error?: string }>
  deleteHistory(id: string): Promise<{ success: boolean; error?: string }>

  readImage(filePath: string): Promise<{ success: boolean; base64DataUrl?: string; error?: string }>
  deleteImage(filePath: string): Promise<{ success: boolean; error?: string }>
  migrate(): Promise<{ success: boolean; error?: string }>

  enhancePrompt(request: { prompt: string; apiKey: string; model?: string }): Promise<{ success: boolean; enhanced?: string; error?: string }>
  exportImageWithMetadata(base64DataUrl: string, defaultName: string, metadata?: Record<string, string>): Promise<{ success: boolean; filePath?: string; cancelled?: boolean; error?: string }>

  // Video generation (fal.ai)
  generateVideo(request: {
    model: string
    prompt: string
    imageUrl: string
    duration: number
    aspectRatio?: string
    resolution?: string
    negativePrompt?: string
    generateAudio?: boolean
    cameraFixed?: boolean
    seed?: number
    apiKey: string
    requestId: string
  }): Promise<{
    success: boolean
    filePath?: string
    duration?: number
    seed?: number
    error?: string
  }>

  exportVideo(filePath: string, defaultName: string): Promise<{ success: boolean; filePath?: string; cancelled?: boolean; error?: string }>

  onVideoProgress(callback: (data: {
    requestId: string
    status: string
    progress?: number
  }) => void): () => void
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
