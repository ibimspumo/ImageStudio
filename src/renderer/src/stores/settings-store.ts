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

export const useSettingsStore = create<SettingsStore>((set) => ({
  falApiKey: '',
  defaultModel: DEFAULT_MODEL,
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
    await window.api.setSetting('falApiKey', key)
    set({ falApiKey: key })
  },

  setSetting: async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    await window.api.setSetting(key, value)
    set({ [key]: value } as Partial<AppSettings>)
  }
}))
