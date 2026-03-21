import { ipcMain, app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { IPC_CHANNELS } from '../lib/constants'
import { registerImageGenerationHandlers } from './image-generation'
import { registerFileOperationHandlers } from './file-operations'
import { loadHistory, saveSession, deleteSession } from '../services/image-store'
import { uploadImagesToUrls } from '../services/image-upload'

function getSettingsPath(): string {
  return join(app.getPath('userData'), 'imagestudio-settings.json')
}

function loadSettings(): Record<string, unknown> {
  const defaults: Record<string, unknown> = {
    apiKey: '',
    defaultModel: 'google/gemini-3-pro-image-preview',
    defaultAspectRatio: '1:1',
    defaultResolution: '2K',
    defaultImageCount: 1,
    useImageUrls: false
  }
  const path = getSettingsPath()
  if (existsSync(path)) {
    try {
      const data = JSON.parse(readFileSync(path, 'utf-8'))
      return { ...defaults, ...data }
    } catch {
      return defaults
    }
  }
  return defaults
}

function persistSettings(settings: Record<string, unknown>): void {
  writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2), 'utf-8')
}

export function registerAllHandlers(): void {
  registerImageGenerationHandlers()
  registerFileOperationHandlers()

  let settings = loadSettings()

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, () => {
    return settings
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, (_event, { key, value }: { key: string; value: unknown }) => {
    settings = { ...settings, [key]: value }
    persistSettings(settings)
    return { success: true }
  })

  // History handlers
  ipcMain.handle(IPC_CHANNELS.HISTORY_LIST, async () => {
    try {
      const sessions = await loadHistory()
      return { success: true, sessions }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to load history' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.HISTORY_SAVE, async (_event, { id, data }: { id: string; data: string }) => {
    try {
      await saveSession(id, data)
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to save' }
    }
  })

  // Upload base64 images to temp host, return URLs (with caching)
  ipcMain.handle(
    IPC_CHANNELS.IMAGE_UPLOAD_URLS,
    async (_event, { images }: { images: string[] }) => {
      try {
        const urls = await uploadImagesToUrls(images)
        return { success: true, urls }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Upload failed' }
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.HISTORY_DELETE, async (_event, { id }: { id: string }) => {
    try {
      await deleteSession(id)
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to delete' }
    }
  })
}
