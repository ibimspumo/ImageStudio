import { contextBridge, ipcRenderer } from 'electron'

const api = {
  generateImage: (request: {
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
    background?: 'auto' | 'transparent' | 'opaque'
    inputFidelity?: 'low' | 'high'
    imageSize?: { width: number; height: number }
    systemPrompt?: string
    enableWebSearch?: boolean
    thinkingLevel?: 'minimal' | 'high'
    safetyTolerance?: string
    outputFormat?: 'png' | 'jpeg' | 'webp'
    maskUrl?: string
  }) => ipcRenderer.invoke('image:generate', request),

  cancelImageGeneration: (requestId: string) =>
    ipcRenderer.invoke('image:generate-cancel', { requestId }),

  onGenerateProgress: (callback: (data: unknown) => void) => {
    const handler = (_event: unknown, data: unknown): void => callback(data)
    ipcRenderer.on('image:generate-progress', handler)
    return () => {
      ipcRenderer.removeListener('image:generate-progress', handler)
    }
  },

  saveImage: (base64DataUrl: string, filename: string) =>
    ipcRenderer.invoke('image:save', { base64DataUrl, filename }),

  exportImage: (base64DataUrl: string, defaultName: string) =>
    ipcRenderer.invoke('image:export', { base64DataUrl, defaultName }),

  startDrag: (filePath: string) => ipcRenderer.send('image:start-drag', filePath),

  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSetting: (key: string, value: unknown) =>
    ipcRenderer.invoke('settings:set', { key, value }),

  listHistory: () => ipcRenderer.invoke('history:list'),
  saveHistory: (id: string, data: string) =>
    ipcRenderer.invoke('history:save', { id, data }),
  deleteHistory: (id: string) => ipcRenderer.invoke('history:delete', { id }),

  /** Upload base64 images to fal.ai storage; returns CDN URLs (cached by content) */
  uploadToUrls: (images: string[]) =>
    ipcRenderer.invoke('image:upload-urls', { images }),

  readImage: (filePath: string) => ipcRenderer.invoke('image:read', { filePath }),
  deleteImage: (filePath: string) => ipcRenderer.invoke('image:delete', { filePath }),
  migrate: () => ipcRenderer.invoke('migrate:run'),

  exportImageWithMetadata: (base64DataUrl: string, defaultName: string, metadata?: Record<string, string>) =>
    ipcRenderer.invoke('image:export-metadata', { base64DataUrl, defaultName, metadata }),

  // Video generation (fal.ai)
  generateVideo: (request: {
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
  }) => ipcRenderer.invoke('video:generate', request),

  exportVideo: (filePath: string, defaultName: string) =>
    ipcRenderer.invoke('video:export', { filePath, defaultName }),

  onVideoProgress: (callback: (data: { requestId: string; status: string; progress?: number }) => void) => {
    const handler = (_event: unknown, data: { requestId: string; status: string; progress?: number }): void =>
      callback(data)
    ipcRenderer.on('video:generate-progress', handler)
    return () => {
      ipcRenderer.removeListener('video:generate-progress', handler)
    }
  },

  // Updates (GitHub Releases)
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  revealUpdate: () => ipcRenderer.invoke('update:reveal'),
  getUpdateStatus: () => ipcRenderer.invoke('update:status'),

  onUpdateStatus: (callback: (status: unknown) => void) => {
    const handler = (_event: unknown, status: unknown): void => callback(status)
    ipcRenderer.on('update:status', handler)
    return () => {
      ipcRenderer.removeListener('update:status', handler)
    }
  },
}

contextBridge.exposeInMainWorld('api', api)
