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
  }) => ipcRenderer.invoke('image:generate', request),

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

  compressImage: (base64DataUrl: string, maxWidth?: number) =>
    ipcRenderer.invoke('image:compress', { base64DataUrl, maxWidth }),

  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSetting: (key: string, value: unknown) =>
    ipcRenderer.invoke('settings:set', { key, value }),

  listHistory: () => ipcRenderer.invoke('history:list'),
  saveHistory: (id: string, data: string) =>
    ipcRenderer.invoke('history:save', { id, data }),
  deleteHistory: (id: string) => ipcRenderer.invoke('history:delete', { id })
}

contextBridge.exposeInMainWorld('api', api)
