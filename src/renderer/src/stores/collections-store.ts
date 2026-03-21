import { create } from 'zustand'
import { nanoid } from 'nanoid'
import { debounce } from '../lib/debounce'
import { logger } from '../lib/logger'

export interface AssetCollection {
  id: string
  name: string
  images: string[] // base64 data URLs
  createdAt: number
}

interface CollectionsStore {
  collections: AssetCollection[]
  loadFromDisk: () => Promise<void>
  persistToDisk: () => Promise<void>
  addCollection: (name: string, images: string[]) => string
  updateCollection: (id: string, updates: Partial<Pick<AssetCollection, 'name' | 'images'>>) => void
  removeCollection: (id: string) => void
  addImagesToCollection: (id: string, images: string[]) => void
  removeImageFromCollection: (id: string, imageIndex: number) => void
}

const debouncedPersist = debounce((persist: () => Promise<void>) => {
  persist().catch((err) => logger.error('CollectionsStore', 'Persist failed', err))
}, 500)

export const useCollectionsStore = create<CollectionsStore>((set, get) => ({
  collections: [],

  loadFromDisk: async () => {
    try {
      const result = await window.api.listHistory()
      if (result.success && result.sessions) {
        const session = result.sessions.find((s) => s.id === 'collections')
        if (session) {
          const data = JSON.parse(session.data) as AssetCollection[]
          set({ collections: data })
        }
      }
    } catch (err) {
      logger.warn('CollectionsStore', 'Failed to load from disk (may be first launch)', err)
    }
  },

  persistToDisk: async () => {
    const { collections } = get()
    await window.api.saveHistory('collections', JSON.stringify(collections))
  },

  addCollection: (name, images) => {
    const id = nanoid()
    set((state) => ({
      collections: [
        ...state.collections,
        { id, name, images, createdAt: Date.now() },
      ],
    }))
    debouncedPersist(get().persistToDisk)
    return id
  },

  updateCollection: (id, updates) => {
    set((state) => ({
      collections: state.collections.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
    }))
    debouncedPersist(get().persistToDisk)
  },

  removeCollection: (id) => {
    set((state) => ({
      collections: state.collections.filter((c) => c.id !== id),
    }))
    debouncedPersist(get().persistToDisk)
  },

  addImagesToCollection: (id, images) => {
    set((state) => ({
      collections: state.collections.map((c) =>
        c.id === id ? { ...c, images: [...c.images, ...images] } : c
      ),
    }))
    debouncedPersist(get().persistToDisk)
  },

  removeImageFromCollection: (id, imageIndex) => {
    set((state) => ({
      collections: state.collections.map((c) =>
        c.id === id
          ? { ...c, images: c.images.filter((_, i) => i !== imageIndex) }
          : c
      ),
    }))
    debouncedPersist(get().persistToDisk)
  },
}))
