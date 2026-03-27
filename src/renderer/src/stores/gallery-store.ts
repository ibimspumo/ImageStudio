import { create } from 'zustand'
import { nanoid } from 'nanoid'
import { debounce } from '../lib/debounce'
import { logger } from '../lib/logger'
import { getResolutionLabel } from '../lib/image-utils'

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
  statusText?: string           // shown on loading skeleton (e.g. "Uploading images...")
  isFavorite?: boolean          // A1: favorites
  negativePrompt?: string       // A2: negative prompts
  seed?: number                 // A3: seed control
  tags?: string[]               // A4: tags
  inpaintSourceId?: string      // D12: inpainting source
  canvasSketchPath?: string     // file path of the canvas sketch used to generate this image
  type?: 'image' | 'video'     // default 'image' for backwards compat
  videoDuration?: number        // video length in seconds
  videoThumbnailPath?: string   // path to extracted first-frame JPEG
  falRequestId?: string         // fal.ai queue tracking
}

/** Convert a file path to a displayable URL (handles spaces, special chars, and Windows backslashes) */
export function toDisplayUrl(filePath: string): string {
  if (!filePath) return ''
  if (filePath.startsWith('data:')) return filePath // legacy base64 fallback
  if (filePath.startsWith('file://')) return filePath
  // Normalize backslashes to forward slashes (Windows paths)
  const normalized = filePath.replace(/\\/g, '/')
  // Encode path components but keep slashes and drive colon (C:)
  const encoded = normalized.split('/').map(part => encodeURIComponent(part)).join('/')
    .replace(/^([A-Za-z])%3A/, '$1:') // restore drive letter colon (C%3A → C:)
  // file:///C:/... requires triple slash for absolute paths
  const prefix = encoded.match(/^[A-Za-z]:/) ? 'file:///' : 'file://'
  return `${prefix}${encoded}`
}

interface GalleryStore {
  images: GalleryImage[]
  addPlaceholder: (prompt: string, aspectRatio: string, resolution: string, model: string, attachments?: string[], workspaceId?: string, extra?: { negativePrompt?: string; seed?: number; inpaintSourceId?: string; canvasSketchPath?: string }) => string
  addVideoPlaceholder: (prompt: string, aspectRatio: string, model: string, attachments?: string[], workspaceId?: string) => string
  completeImage: (id: string, filePath: string, durationMs?: number, cost?: number) => void
  completeVideo: (id: string, filePath: string, durationMs: number, videoDuration: number, thumbnailPath?: string, cost?: number) => void
  updateStatus: (id: string, statusText: string | undefined) => void
  failImage: (id: string, error: string) => void
  removeImage: (id: string) => void
  moveToWorkspace: (imageId: string, workspaceId: string | undefined) => void
  toggleFavorite: (id: string) => void
  updateTags: (id: string, tags: string[]) => void
  updateResolution: (id: string, resolution: string) => void
  clearAll: () => void
  loadFromDisk: () => Promise<void>
  persistToDisk: () => Promise<void>
}

const debouncedPersist = debounce((persist: () => Promise<void>) => {
  persist().catch((err) => logger.error('GalleryStore', 'Persist failed', err))
}, 500)

export const useGalleryStore = create<GalleryStore>((set, get) => ({
  images: [],

  addPlaceholder: (prompt, aspectRatio, resolution, model, attachments, workspaceId, extra) => {
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
          negativePrompt: extra?.negativePrompt,
          seed: extra?.seed,
          inpaintSourceId: extra?.inpaintSourceId,
          canvasSketchPath: extra?.canvasSketchPath,
        },
        ...state.images,
      ],
    }))
    return id
  },

  addVideoPlaceholder: (prompt, aspectRatio, model, attachments, workspaceId) => {
    const id = nanoid()
    set((state) => ({
      images: [
        {
          id,
          filePath: '',
          prompt,
          aspectRatio,
          resolution: '720p',
          timestamp: Date.now(),
          isLoading: true,
          model,
          attachments,
          workspaceId,
          type: 'video',
          statusText: 'Queued...',
        },
        ...state.images,
      ],
    }))
    return id
  },

  completeVideo: (id, filePath, durationMs, videoDuration, thumbnailPath, cost) => {
    set((state) => ({
      images: state.images.map((img) =>
        img.id === id
          ? { ...img, filePath, isLoading: false, durationMs, videoDuration, videoThumbnailPath: thumbnailPath, statusText: undefined, ...(cost != null ? { cost } : {}) }
          : img
      ),
    }))
    debouncedPersist(get().persistToDisk)
  },

  updateStatus: (id, statusText) => {
    set((state) => ({
      images: state.images.map((img) =>
        img.id === id ? { ...img, statusText } : img
      ),
    }))
  },

  completeImage: (id, filePath, durationMs, cost) => {
    set((state) => ({
      images: state.images.map((img) =>
        img.id === id ? { ...img, filePath, isLoading: false, durationMs, cost } : img
      ),
    }))
    debouncedPersist(get().persistToDisk)
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
      window.api.deleteImage(img.filePath).catch((err) =>
        logger.error('GalleryStore', 'Failed to delete image file', err)
      )
    }
    set((state) => ({
      images: state.images.filter((img) => img.id !== id),
    }))
    debouncedPersist(get().persistToDisk)
  },

  moveToWorkspace: (imageId, workspaceId) => {
    set((state) => ({
      images: state.images.map((img) =>
        img.id === imageId ? { ...img, workspaceId } : img
      ),
    }))
    debouncedPersist(get().persistToDisk)
  },

  toggleFavorite: (id) => {
    set((state) => ({
      images: state.images.map((img) =>
        img.id === id ? { ...img, isFavorite: !img.isFavorite } : img
      ),
    }))
    debouncedPersist(get().persistToDisk)
  },

  updateTags: (id, tags) => {
    set((state) => ({
      images: state.images.map((img) =>
        img.id === id ? { ...img, tags } : img
      ),
    }))
    debouncedPersist(get().persistToDisk)
  },

  updateResolution: (id, resolution) => {
    set((state) => ({
      images: state.images.map((img) =>
        img.id === id ? { ...img, resolution } : img
      ),
    }))
    debouncedPersist(get().persistToDisk)
  },

  clearAll: () => {
    const imgs = get().images
    for (const img of imgs) {
      if (img.filePath && !img.filePath.startsWith('data:')) {
        window.api.deleteImage(img.filePath).catch((err) =>
          logger.error('GalleryStore', 'Failed to delete image file', err)
        )
      }
    }
    set({ images: [] })
    get().persistToDisk().catch((err) =>
      logger.error('GalleryStore', 'Persist failed after clearAll', err)
    )
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

          // Background migration: fix resolution labels based on actual image dimensions
          setTimeout(() => {
            const { images, updateResolution } = get()
            for (const img of images) {
              if (!img.filePath || img.filePath.startsWith('data:')) continue
              const imgEl = new window.Image()
              imgEl.onload = () => {
                const actualRes = getResolutionLabel(imgEl.naturalWidth, imgEl.naturalHeight)
                if (actualRes !== img.resolution) {
                  updateResolution(img.id, actualRes)
                }
              }
              imgEl.src = toDisplayUrl(img.filePath)
            }
          }, 2000) // Delay to not block initial render
        }
      }
    } catch (err) {
      logger.warn('GalleryStore', 'Failed to load gallery from disk (may be first launch)', err)
    }
  },

  persistToDisk: async () => {
    const images = get().images.filter((img) => img.filePath && !img.isLoading && !img.error)
    await window.api.saveHistory('gallery', JSON.stringify(images))
  },
}))
