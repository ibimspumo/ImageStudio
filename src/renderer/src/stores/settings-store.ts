import { create } from 'zustand'
import type { AppSettings } from '../types/settings'
import { DEFAULT_MODEL, normalizeModelId } from '../types/api'
import { DEFAULT_VIDEO_MODEL } from '../types/api'

interface SettingsStore extends AppSettings {
  hydrated: boolean
  hydrate: () => Promise<void>
  setFalApiKey: (key: string) => Promise<void>
  setSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>
}

// UI edits and MCP settings mutations share one ordered stream. The main
// process persists synchronously; this queue also keeps renderer acknowledgments
// and subscriptions in invocation order, including when IPC responses are delayed.
let pendingSettingsWrite: Promise<void> = Promise.resolve()
function serializeSettingsWrite(write: () => Promise<void>): Promise<void> {
  const result = pendingSettingsWrite.then(write)
  pendingSettingsWrite = result.catch(() => undefined)
  return result
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  falApiKey: '',
  falBillingApiKey: '',
  defaultModel: DEFAULT_MODEL,
  printPrompt: '',
  defaultPrintFormat: 'a4-portrait',
  defaultPrintStyle: 'auto',
  thumbnailCompositing: true,
  defaultAspectRatio: '1:1',
  defaultResolution: '2K',
  defaultImageCount: 1,
  defaultVideoModel: DEFAULT_VIDEO_MODEL,
  autoCheckUpdates: true,
  antiDetection: true,
  hydrated: false,

  hydrate: async () => {
    try {
      const settings = (await window.api.getSettings()) as unknown as AppSettings
      set({
        ...settings,
        // Guard against model ids stored before the move to fal.ai
        defaultModel: normalizeModelId(settings.defaultModel),
        hydrated: true,
      })
    } catch {
      // Even if loading fails, mark as hydrated so the UI can show the correct state
      set({ hydrated: true })
    }
  },

  setFalApiKey: async (key: string) => {
    await get().setSetting('falApiKey', key)
  },

  setSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => serializeSettingsWrite(async () => {
    const result = await window.api.setSetting(key, value)
    if (!result.success) throw new Error(`Die Einstellung ${key} konnte nicht gespeichert werden. Bitte erneut versuchen.`)
    set({ [key]: value } as Partial<AppSettings>)
  })
}))
