import { create } from 'zustand'
import type { FalBackground } from '../types/api'

interface PendingCropRef {
  id: string
  base64: string
  sourceImageId: string
  name: string
}

export interface ReuseOptions {
  background?: FalBackground
  model?: string
  aspectRatio?: string
  resolution?: string
}

interface PendingReuse extends ReuseOptions {
  prompt: string
  attachmentFilePaths?: string[]  // file paths to load as references
  negativePrompt?: string
  seed?: number
}

interface CropStore {
  pendingRef: PendingCropRef | null
  pendingReuse: PendingReuse | null
  addPendingRef: (base64: string, sourceImageId: string) => void
  consumePendingRef: () => PendingCropRef | null
  setPendingReuse: (prompt: string, attachmentFilePaths?: string[], negativePrompt?: string, seed?: number, options?: ReuseOptions) => void
  consumePendingReuse: () => PendingReuse | null
}

export const useCropStore = create<CropStore>((set, get) => ({
  pendingRef: null,
  pendingReuse: null,

  addPendingRef: (base64, sourceImageId) => {
    const ts = Date.now().toString(36).slice(-4)
    set({
      pendingRef: {
        id: crypto.randomUUID(),
        base64,
        sourceImageId,
        name: `Crop ${ts}`,
      },
    })
  },

  consumePendingRef: () => {
    const ref = get().pendingRef
    if (ref) set({ pendingRef: null })
    return ref
  },

  setPendingReuse: (prompt, attachmentFilePaths, negativePrompt, seed, options) => {
    set({ pendingReuse: { prompt, attachmentFilePaths, negativePrompt, seed, ...options } })
  },

  consumePendingReuse: () => {
    const reuse = get().pendingReuse
    if (reuse) set({ pendingReuse: null })
    return reuse
  },
}))
