import { create } from 'zustand'
import { nanoid } from 'nanoid'

export interface GalleryImage {
  id: string
  filePath: string             // absolute path on disk (displayed via file:// URL)
  prompt: string
  aspectRatio: string
  resolution: string
  timestamp: number
  isLoading?: boolean
  error?: string
  model: string
  durationMs?: number
  attachments?: string[]       // file paths of reference images
  parentImageId?: string
  chatId?: string
  workspaceId?: string
  cost?: number
}

/** Convert a file path to a displayable URL (handles spaces and special chars) */
export function toDisplayUrl(filePath: string): string {
  if (!filePath) return ''
  if (filePath.startsWith('data:')) return filePath // legacy base64 fallback
  if (filePath.startsWith('file://')) return filePath
  // Encode path components but keep slashes
  const encoded = filePath.split('/').map(part => encodeURIComponent(part)).join('/')
  return `file://${encoded}`
}

interface GalleryStore {
  images: GalleryImage[]
  addPlaceholder: (prompt: string, aspectRatio: string, resolution: string, model: string, attachments?: string[], workspaceId?: string) => string
  completeImage: (id: string, filePath: string, durationMs?: number, cost?: number) => void
  failImage: (id: string, error: string) => void
  removeImage: (id: string) => void
  moveToWorkspace: (imageId: string, workspaceId: string | undefined) => void
  clearAll: () => void
  loadFromDisk: () => Promise<void>
  persistToDisk: () => Promise<void>
}

export const useGalleryStore = create<GalleryStore>((set, get) => ({
  images: [],

  addPlaceholder: (prompt, aspectRatio, resolution, model, attachments, workspaceId) => {
    const id = nanoid()
    set((state) => ({
      images: [
        {
          id,
          filePath: '',
          prompt,
          aspectRatio,
          resolution,
          timestamp: Date.now(),
          isLoading: true,
          model,
          attachments,
          workspaceId,
        },
        ...state.images,
      ],
    }))
    return id
  },

  completeImage: (id, filePath, durationMs, cost) => {
    set((state) => ({
      images: state.images.map((img) =>
        img.id === id ? { ...img, filePath, isLoading: false, durationMs, cost } : img
      ),
    }))
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
    const img = get().images.find((i) => i.id === id)
    if (img?.filePath && !img.filePath.startsWith('data:')) {
      window.api.deleteImage(img.filePath).catch(() => {})
    }
    set((state) => ({
      images: state.images.filter((img) => img.id !== id),
    }))
    setTimeout(() => get().persistToDisk(), 100)
  },

  moveToWorkspace: (imageId, workspaceId) => {
    set((state) => ({
      images: state.images.map((img) =>
        img.id === imageId ? { ...img, workspaceId } : img
      ),
    }))
    setTimeout(() => get().persistToDisk(), 100)
  },

  clearAll: () => {
    const imgs = get().images
    for (const img of imgs) {
      if (img.filePath && !img.filePath.startsWith('data:')) {
        window.api.deleteImage(img.filePath).catch(() => {})
      }
    }
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
          const completed = data.filter((img) => img.filePath && !img.isLoading && !img.error)
          set({ images: completed })
        }
      }
    } catch {
      // silent — first launch
    }
  },

  persistToDisk: async () => {
    const images = get().images.filter((img) => img.filePath && !img.isLoading && !img.error)
    // Only persist metadata + file paths (no base64 in JSON)
    await window.api.saveHistory('gallery', JSON.stringify(images))
  },
}))
