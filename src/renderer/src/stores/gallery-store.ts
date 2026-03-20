import { create } from 'zustand'
import { nanoid } from 'nanoid'

export interface GalleryImage {
  id: string
  base64DataUrl: string
  filePath?: string
  prompt: string
  aspectRatio: string
  resolution: string
  timestamp: number
  isLoading?: boolean
  error?: string
  model: string
  durationMs?: number
  attachments?: string[]
  parentImageId?: string
}

interface GalleryStore {
  images: GalleryImage[]
  addPlaceholder: (prompt: string, aspectRatio: string, resolution: string, model: string, attachments?: string[]) => string
  completeImage: (id: string, base64DataUrl: string, durationMs?: number) => void
  failImage: (id: string, error: string) => void
  removeImage: (id: string) => void
  clearAll: () => void
  loadFromDisk: () => Promise<void>
  persistToDisk: () => Promise<void>
}

export const useGalleryStore = create<GalleryStore>((set, get) => ({
  images: [],

  addPlaceholder: (prompt, aspectRatio, resolution, model, attachments) => {
    const id = nanoid()
    set((state) => ({
      images: [
        {
          id,
          base64DataUrl: '',
          prompt,
          aspectRatio,
          resolution,
          timestamp: Date.now(),
          isLoading: true,
          model,
          attachments,
        },
        ...state.images,
      ],
    }))
    return id
  },

  completeImage: (id, base64DataUrl, durationMs) => {
    set((state) => ({
      images: state.images.map((img) =>
        img.id === id ? { ...img, base64DataUrl, isLoading: false, durationMs } : img
      ),
    }))
    // Persist after completion
    setTimeout(() => get().persistToDisk(), 100)
  },

  failImage: (id, error) => {
    set((state) => ({
      images: state.images.map((img) =>
        img.id === id ? { ...img, isLoading: false, error } : img
      ),
    }))
  },

  removeImage: (id) => {
    set((state) => ({
      images: state.images.filter((img) => img.id !== id),
    }))
    setTimeout(() => get().persistToDisk(), 100)
  },

  clearAll: () => {
    set({ images: [] })
    get().persistToDisk()
  },

  loadFromDisk: async () => {
    try {
      const result = await window.api.listHistory()
      if (result.success && result.sessions) {
        const gallerySession = result.sessions.find((s) => s.id === 'gallery')
        if (gallerySession) {
          const data = JSON.parse(gallerySession.data) as GalleryImage[]
          // Only load completed images (not loading/error ones)
          const completed = data.filter((img) => img.base64DataUrl && !img.isLoading && !img.error)
          set({ images: completed })
        }
      }
    } catch {
      // silent — first launch
    }
  },

  persistToDisk: async () => {
    const images = get().images.filter((img) => img.base64DataUrl && !img.isLoading && !img.error)
    // Only persist metadata + base64 for completed images
    await window.api.saveHistory('gallery', JSON.stringify(images))
  },
}))
