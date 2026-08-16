import { ipcMain, app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { IPC_CHANNELS } from '../lib/constants'
import { registerImageGenerationHandlers } from './image-generation'
import { registerVideoGenerationHandlers } from './video-generation'
import { registerFileOperationHandlers } from './file-operations'
import { loadHistory, saveSession, deleteSession } from '../services/image-store'
import { uploadImagesToUrls, clearUploadCache } from '../services/image-upload'
import { checkForUpdates, downloadUpdate, installUpdate, getUpdateStatus, revealUpdate } from '../services/updater'
import { DEFAULT_MODEL, normalizeModelId } from '../../shared/image-models'

/** Valid settings keys — rejects unknown keys from renderer */
const VALID_SETTINGS_KEYS = new Set([
  'falApiKey',
  'defaultModel',
  'defaultAspectRatio',
  'defaultResolution',
  'defaultImageCount',
  'defaultVideoModel',
  'autoCheckUpdates',
  'antiDetection',
])

interface AppSettings {
  falApiKey: string
  defaultModel: string
  defaultAspectRatio: string
  defaultResolution: string
  defaultImageCount: number
  defaultVideoModel: string
  autoCheckUpdates: boolean
  antiDetection: boolean
}

const DEFAULTS: AppSettings = {
  falApiKey: '',
  defaultModel: DEFAULT_MODEL,
  defaultAspectRatio: '1:1',
  defaultResolution: '2K',
  defaultImageCount: 1,
  defaultVideoModel: 'fal-ai/bytedance/seedance/v1.5/pro/image-to-video',
  autoCheckUpdates: true,
  antiDetection: true,
}

function getSettingsPath(): string {
  return join(app.getPath('userData'), 'imagestudio-settings.json')
}

function loadSettings(): AppSettings {
  const path = getSettingsPath()
  if (!existsSync(path)) return { ...DEFAULTS }

  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'))
    return {
      falApiKey: typeof raw.falApiKey === 'string' ? raw.falApiKey : DEFAULTS.falApiKey,
      // Settings written before the move to fal.ai hold OpenRouter model ids.
      defaultModel: normalizeModelId(raw.defaultModel),
      defaultAspectRatio: typeof raw.defaultAspectRatio === 'string' ? raw.defaultAspectRatio : DEFAULTS.defaultAspectRatio,
      defaultResolution: typeof raw.defaultResolution === 'string' ? raw.defaultResolution : DEFAULTS.defaultResolution,
      defaultImageCount: typeof raw.defaultImageCount === 'number' ? raw.defaultImageCount : DEFAULTS.defaultImageCount,
      defaultVideoModel: typeof raw.defaultVideoModel === 'string' ? raw.defaultVideoModel : DEFAULTS.defaultVideoModel,
      autoCheckUpdates: typeof raw.autoCheckUpdates === 'boolean' ? raw.autoCheckUpdates : DEFAULTS.autoCheckUpdates,
      antiDetection: typeof raw.antiDetection === 'boolean' ? raw.antiDetection : DEFAULTS.antiDetection,
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
    // Uploaded references live under the old key's account — drop them.
    if (key === 'falApiKey' && value !== settings.falApiKey) clearUploadCache()
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

  // Upload base64 images to fal.ai storage, return CDN URLs (content-hash cached)
  ipcMain.handle(
    IPC_CHANNELS.IMAGE_UPLOAD_URLS,
    async (_event, { images }: { images: string[] }) => {
      try {
        const urls = await uploadImagesToUrls(images, settings.falApiKey)
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

  // Updates (GitHub Releases)
  ipcMain.handle(IPC_CHANNELS.UPDATE_CHECK, async () => checkForUpdates())
  ipcMain.handle(IPC_CHANNELS.UPDATE_DOWNLOAD, async () => downloadUpdate())
  ipcMain.handle(IPC_CHANNELS.UPDATE_INSTALL, async () => installUpdate())
  ipcMain.handle(IPC_CHANNELS.UPDATE_REVEAL, () => revealUpdate())
  ipcMain.handle(IPC_CHANNELS.UPDATE_STATUS, () => getUpdateStatus())

  return
}

/** Whether the app should check for updates without being asked. */
export function shouldAutoCheckUpdates(): boolean {
  return loadSettings().autoCheckUpdates
}
