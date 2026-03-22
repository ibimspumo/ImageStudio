import { create } from 'zustand'

interface PendingCropRef {
  id: string
  base64: string
  sourceImageId: string
  name: string
}

interface PendingReuse {
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
  setPendingReuse: (prompt: string, attachmentFilePaths?: string[], negativePrompt?: string, seed?: number) => void
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

  setPendingReuse: (prompt, attachmentFilePaths, negativePrompt, seed) => {
    set({ pendingReuse: { prompt, attachmentFilePaths, negativePrompt, seed } })
  },

  consumePendingReuse: () => {
    const reuse = get().pendingReuse
    if (reuse) set({ pendingReuse: null })
    return reuse
  },
}))
