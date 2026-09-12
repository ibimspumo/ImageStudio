import type { AutomationStatus, AutomationRequest, AutomationReply } from '../shared/automation'

export interface GenerateImageResult {
  filePath?: string
  previewPath?: string
  width?: number
  height?: number
  hasAlpha?: boolean
  mimeType?: string
  id: string
  text?: string
  imageBase64?: string
  imageUrl?: string
  cost?: number
  seed?: number
  generationRequest?: { endpoint: string; input: Record<string, unknown> }
}

export type UpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'error'

export type InstallMode = 'restart' | 'replace-app' | 'open-installer' | 'none'

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
  installReason?: string
}

export interface ElectronAPI {
  getAutomationStatus(): Promise<AutomationStatus>
  configureAutomation(config: { enabled?: boolean; port?: number }): Promise<AutomationStatus>
  rotateAutomationToken(): Promise<AutomationStatus>
  onAutomationRequest(callback: (request: AutomationRequest) => void): () => void
  automationReply(reply: AutomationReply): void
  automationReady(): void
  automationImportMedia(options: { source: string; name?: string }): Promise<{ success: true; filePath: string; kind: 'image' | 'video'; mimeType: string; size: number; width?: number; height?: number; name: string }>
  automationExportMedia(options: { filePath: string; destination: string; overwrite?: boolean; metadata?: Record<string, string> }): Promise<{ success: true; filePath: string; size: number }>
  automationReadMedia(options: { filePath: string }): Promise<{ success: true; filePath: string; uri: string; mimeType: string; kind: 'image' | 'video'; size: number }>

  refreshBilling(requests: import('../shared/billing').BillingRequest[]): Promise<import('../shared/billing').BillingResult>
  prepareImageFileExport(request: { filePath: string; format: 'png' | 'jpeg' | 'webp'; quality: number }): Promise<{ filePath: string; sizeBytes: number; format: 'png' | 'jpeg' | 'webp'; mimeType: string }>
  exportImageFile(filePath: string, defaultName: string, metadata?: Record<string, string>): Promise<{ success: boolean; cancelled?: boolean; filePath?: string; error?: string }>
  inspectProcessingImage(filePath: string): Promise<{ width: number; height: number; hasAlpha: boolean; mimeType: string; sizeBytes: number }>
  generateImage(request: {
    prompt: string
    model: string
    apiKey: string
    aspectRatio: string
    resolution: string
    count: number
    requestId: string
    imageProcessing?: import('../shared/image-processing').ImageProcessingRequest
    attachments?: string[]
    labeledAttachments?: { label: string; images: string[] }[]
    seed?: number
    quality?: string
    background?: 'auto' | 'transparent' | 'opaque'
    inputFidelity?: 'low' | 'high'
    imageSize?: { width: number; height: number }
    systemPrompt?: string
    enableWebSearch?: boolean
    thinkingLevel?: 'minimal' | 'high'
    safetyTolerance?: string
    outputFormat?: 'png' | 'jpeg' | 'webp'
    outputCompression?: number
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
    falRequestId?: string
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
    requestId?: string
    generationRequest?: { endpoint: string; input: Record<string, unknown> }
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
