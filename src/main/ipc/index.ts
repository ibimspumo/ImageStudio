import { ipcMain, app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { IPC_CHANNELS } from '../lib/constants'
import { registerImageGenerationHandlers } from './image-generation'
import { registerVideoGenerationHandlers } from './video-generation'
import { registerFileOperationHandlers } from './file-operations'
import { loadHistory, saveSession, deleteSession } from '../services/image-store'
import { uploadImagesToUrls } from '../services/image-upload'
import { enhancePrompt } from '../services/openrouter'

/** Valid settings keys — rejects unknown keys from renderer */
const VALID_SETTINGS_KEYS = new Set([
  'apiKey',
  'defaultModel',
  'defaultAspectRatio',
  'defaultResolution',
  'defaultImageCount',
  'useImageUrls',
  'promptEnhancerModel',
  'falApiKey',
  'defaultVideoModel',
])

interface AppSettings {
  apiKey: string
  defaultModel: string
  defaultAspectRatio: string
  defaultResolution: string
  defaultImageCount: number
  useImageUrls: boolean
  promptEnhancerModel: string
  falApiKey: string
  defaultVideoModel: string
}

const DEFAULTS: AppSettings = {
  apiKey: '',
  defaultModel: 'google/gemini-3.1-flash-image-preview',
  defaultAspectRatio: '1:1',
  defaultResolution: '2K',
  defaultImageCount: 1,
  useImageUrls: false,
  promptEnhancerModel: 'google/gemini-2.0-flash-001',
  falApiKey: '',
  defaultVideoModel: 'fal-ai/kling-video/v3/standard/image-to-video',
}

function getSettingsPath(): string {
  return join(app.getPath('userData'), 'imagestudio-settings.json')
}

function loadSettings(): AppSettings {
  const path = getSettingsPath()
  if (!existsSync(path)) return { ...DEFAULTS }

  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'))
    // Validate each field — only accept known keys with correct types
    return {
      apiKey: typeof raw.apiKey === 'string' ? raw.apiKey : DEFAULTS.apiKey,
      defaultModel: typeof raw.defaultModel === 'string' ? raw.defaultModel : DEFAULTS.defaultModel,
      defaultAspectRatio: typeof raw.defaultAspectRatio === 'string' ? raw.defaultAspectRatio : DEFAULTS.defaultAspectRatio,
      defaultResolution: typeof raw.defaultResolution === 'string' ? raw.defaultResolution : DEFAULTS.defaultResolution,
      defaultImageCount: typeof raw.defaultImageCount === 'number' ? raw.defaultImageCount : DEFAULTS.defaultImageCount,
      useImageUrls: typeof raw.useImageUrls === 'boolean' ? raw.useImageUrls : DEFAULTS.useImageUrls,
      promptEnhancerModel: typeof raw.promptEnhancerModel === 'string' ? raw.promptEnhancerModel : DEFAULTS.promptEnhancerModel,
      falApiKey: typeof raw.falApiKey === 'string' ? raw.falApiKey : DEFAULTS.falApiKey,
      defaultVideoModel: typeof raw.defaultVideoModel === 'string' ? raw.defaultVideoModel : DEFAULTS.defaultVideoModel,
    }
  } catch {
    console.error('[Settings] Failed to parse settings file, using defaults')
    return { ...DEFAULTS }
  }
}

function persistSettings(settings: AppSettings): void {
  writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2), 'utf-8')
}

export function registerAllHandlers(): void {
  registerImageGenerationHandlers()
  registerVideoGenerationHandlers()
  registerFileOperationHandlers()

  let settings = loadSettings()

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, () => {
    return settings
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, (_event, { key, value }: { key: string; value: unknown }) => {
    if (!VALID_SETTINGS_KEYS.has(key)) {
      return { success: false, error: `Unknown setting: ${key}` }
    }
    settings = { ...settings, [key]: value } as AppSettings
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

  // C8: Prompt enhancer
  ipcMain.handle('prompt:enhance', async (_event, request: { prompt: string; apiKey: string; model?: string }) => {
    try {
      const result = await enhancePrompt(request)
      return { success: true, enhanced: result.enhanced, error: result.error }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Enhancement failed' }
    }
  })
}
