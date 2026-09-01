import { create } from 'zustand'
import { nanoid } from 'nanoid'
import { debounce } from '../lib/debounce'
import { logger } from '../lib/logger'

/**
 * User-defined meta prompts for thumbnail mode. Each one is a reusable rule
 * block (e.g. a channel format) that rides along below the built-in system
 * prompt and above the user's own prompt. The active selection persists across
 * restarts — a format is usually chosen once per channel, not per image.
 */
export interface ThumbnailMetaPrompt {
  id: string
  name: string
  text: string
  createdAt: number
}

interface PersistedState {
  prompts: ThumbnailMetaPrompt[]
  activeId: string | null
}

interface ThumbnailMetaPromptsStore extends PersistedState {
  setActive: (id: string | null) => void
  addPrompt: (name: string, text: string) => string
  updatePrompt: (id: string, updates: Partial<Pick<ThumbnailMetaPrompt, 'name' | 'text'>>) => void
  removePrompt: (id: string) => void
  /** Text of the active meta prompt, or undefined when none is selected. */
  getActiveText: () => string | undefined
  loadFromDisk: () => Promise<void>
  persistToDisk: () => Promise<void>
}

const STORAGE_KEY = 'thumbnail-meta-prompts'

const debouncedPersist = debounce((persist: () => Promise<void>) => {
  persist().catch((err) => logger.error('ThumbnailMetaPromptsStore', 'Persist failed', err))
}, 500)

export const useThumbnailMetaPromptsStore = create<ThumbnailMetaPromptsStore>((set, get) => ({
  prompts: [],
  activeId: null,

  setActive: (activeId) => {
    set({ activeId })
    debouncedPersist(get().persistToDisk)
  },

  addPrompt: (name, text) => {
    const id = nanoid()
    set((state) => ({
      prompts: [...state.prompts, { id, name, text, createdAt: Date.now() }],
      activeId: id,
    }))
    debouncedPersist(get().persistToDisk)
    return id
  },

  updatePrompt: (id, updates) => {
    set((state) => ({
      prompts: state.prompts.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    }))
    debouncedPersist(get().persistToDisk)
  },

  removePrompt: (id) => {
    set((state) => ({
      prompts: state.prompts.filter((p) => p.id !== id),
      activeId: state.activeId === id ? null : state.activeId,
    }))
    debouncedPersist(get().persistToDisk)
  },

  getActiveText: () => {
    const { prompts, activeId } = get()
    const active = activeId ? prompts.find((p) => p.id === activeId) : undefined
    const text = active?.text.trim()
    return text ? text : undefined
  },

  loadFromDisk: async () => {
    try {
      const result = await window.api.listHistory()
      if (result.success && result.sessions) {
        const session = result.sessions.find((s) => s.id === STORAGE_KEY)
        if (session) {
          const data = JSON.parse(session.data) as PersistedState
          set({
            prompts: Array.isArray(data.prompts) ? data.prompts : [],
            activeId: typeof data.activeId === 'string' ? data.activeId : null,
          })
        }
      }
    } catch (err) {
      logger.warn('ThumbnailMetaPromptsStore', 'Failed to load meta prompts from disk', err)
    }
  },

  persistToDisk: async () => {
    const { prompts, activeId } = get()
    await window.api.saveHistory(STORAGE_KEY, JSON.stringify({ prompts, activeId }))
  },
}))
