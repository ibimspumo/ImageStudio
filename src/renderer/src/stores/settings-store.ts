import { create } from 'zustand'
import type { AppSettings } from '../types/settings'

interface SettingsStore extends AppSettings {
  hydrated: boolean
  hydrate: () => Promise<void>
  setApiKey: (key: string) => Promise<void>
  setSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  apiKey: '',
  defaultModel: 'google/gemini-3-pro-image-preview',
  defaultAspectRatio: '1:1',
  defaultResolution: '2K',
  defaultImageCount: 1,
  useImageUrls: false,
  hydrated: false,

  hydrate: async () => {
    try {
      const settings = await window.api.getSettings()
      set({ ...(settings as AppSettings), hydrated: true })
    } catch {
      // Even if loading fails, mark as hydrated so the UI can show the correct state
      set({ hydrated: true })
    }
  },

  setApiKey: async (key: string) => {
    await window.api.setSetting('apiKey', key)
    set({ apiKey: key })
  },

  setSetting: async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    await window.api.setSetting(key, value)
    set({ [key]: value } as Partial<AppSettings>)
  }
}))
