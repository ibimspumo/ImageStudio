export interface GenerateImageResult {
  id: string
  text?: string
  imageBase64?: string
  imageUrl?: string
  cost?: number
  seed?: number
}

export type UpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export type InstallMode = 'restart' | 'open-installer' | 'none'

export interface UpdateStatus {
  state: UpdateState
  currentVersion: string
  version?: string
  releaseNotes?: string
  releaseUrl?: string
  progress?: number
  bytesPerSecond?: number
  transferred?: number
  total?: number
  error?: string
  canInstall: boolean
  installMode: InstallMode
  downloadPath?: string
}

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
    seed?: number
    quality?: string
    imageSize?: { width: number; height: number }
    systemPrompt?: string
    enableWebSearch?: boolean
    thinkingLevel?: 'minimal' | 'high'
    safetyTolerance?: string
    outputFormat?: 'png' | 'jpeg' | 'webp'
    maskUrl?: string
  }): Promise<{
    success: boolean
    results?: Array<{
      status: 'complete' | 'error' | 'cancelled'
      result?: GenerateImageResult
      error?: string
    }>
    error?: string
  }>

  cancelImageGeneration(requestId: string): Promise<{ success: boolean; cancelled?: number }>

  onGenerateProgress(callback: (data: {
    requestId: string
    index: number
    status: 'complete' | 'error' | 'progress'
    message?: string
    result?: GenerateImageResult
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

  /** Upload base64 images to fal.ai storage; returns CDN URLs (cached by content hash) */
  uploadToUrls(images: string[]): Promise<{ success: boolean; urls: string[]; error?: string }>

  readImage(filePath: string): Promise<{ success: boolean; base64DataUrl?: string; error?: string }>
  deleteImage(filePath: string): Promise<{ success: boolean; error?: string }>
  migrate(): Promise<{ success: boolean; error?: string }>

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

  // Updates (GitHub Releases)
  checkForUpdates(): Promise<UpdateStatus>
  downloadUpdate(): Promise<UpdateStatus>
  installUpdate(): Promise<{ success: boolean; error?: string }>
  revealUpdate(): Promise<{ success: boolean; error?: string }>
  getUpdateStatus(): Promise<UpdateStatus>
  onUpdateStatus(callback: (status: UpdateStatus) => void): () => void
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
