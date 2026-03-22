import { create } from 'zustand'
import { nanoid } from 'nanoid'
import { debounce } from '../lib/debounce'
import { logger } from '../lib/logger'

export interface StylePreset {
  id: string
  name: string
  suffix: string
  isBuiltIn: boolean
  icon?: string
  createdAt: number
}

const BUILT_IN_PRESETS: Omit<StylePreset, 'id' | 'createdAt'>[] = [
  { name: 'Cinematic', suffix: 'cinematic lighting, film grain, anamorphic lens, dramatic shadows, 35mm film', isBuiltIn: true, icon: '🎬' },
  { name: 'Anime', suffix: 'anime style, cel shading, vibrant colors, detailed linework, studio quality', isBuiltIn: true, icon: '🎌' },
  { name: 'Photorealistic', suffix: 'hyperrealistic, 8K photograph, natural lighting, DSLR, sharp focus', isBuiltIn: true, icon: '📸' },
  { name: 'Oil Painting', suffix: 'oil painting style, visible brushstrokes, rich textures, classical composition', isBuiltIn: true, icon: '🎨' },
  { name: 'Minimalist', suffix: 'minimalist design, clean lines, negative space, simple composition', isBuiltIn: true, icon: '◻️' },
  { name: 'Watercolor', suffix: 'watercolor painting, soft washes, flowing pigment, paper texture', isBuiltIn: true, icon: '💧' },
  { name: '3D Render', suffix: '3D render, octane render, ray tracing, volumetric lighting', isBuiltIn: true, icon: '🧊' },
]

interface PresetsStore {
  presets: StylePreset[]
  activePresetId: string | null

  setActivePreset: (id: string | null) => void
  addPreset: (name: string, suffix: string, icon?: string) => string
  updatePreset: (id: string, updates: Partial<Pick<StylePreset, 'name' | 'suffix' | 'icon'>>) => void
  removePreset: (id: string) => void
  loadFromDisk: () => Promise<void>
  persistToDisk: () => Promise<void>
}

const debouncedPersist = debounce((persist: () => Promise<void>) => {
  persist().catch((err) => logger.error('PresetsStore', 'Persist failed', err))
}, 500)

export const usePresetsStore = create<PresetsStore>((set, get) => ({
  presets: [],
  activePresetId: null,

  setActivePreset: (activePresetId) => set({ activePresetId }),

  addPreset: (name, suffix, icon) => {
    const id = nanoid()
    set((state) => ({
      presets: [...state.presets, { id, name, suffix, isBuiltIn: false, icon, createdAt: Date.now() }],
    }))
    debouncedPersist(get().persistToDisk)
    return id
  },

  updatePreset: (id, updates) => {
    set((state) => ({
      presets: state.presets.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    }))
    debouncedPersist(get().persistToDisk)
  },

  removePreset: (id) => {
    set((state) => ({
      presets: state.presets.filter((p) => p.id !== id),
      activePresetId: state.activePresetId === id ? null : state.activePresetId,
    }))
    debouncedPersist(get().persistToDisk)
  },

  loadFromDisk: async () => {
    try {
      const result = await window.api.listHistory()
      if (result.success && result.sessions) {
        const session = result.sessions.find((s) => s.id === 'presets')
        if (session) {
          const data = JSON.parse(session.data) as StylePreset[]
          set({ presets: data })
          return
        }
      }
    } catch (err) {
      logger.warn('PresetsStore', 'Failed to load presets from disk', err)
    }
    // Seed with built-in presets on first load
    const seeded = BUILT_IN_PRESETS.map((p) => ({
      ...p,
      id: nanoid(),
      createdAt: Date.now(),
    }))
    set({ presets: seeded })
    get().persistToDisk()
  },

  persistToDisk: async () => {
    const presets = get().presets
    await window.api.saveHistory('presets', JSON.stringify(presets))
  },
}))
