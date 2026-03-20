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
}

interface CropStore {
  pendingRef: PendingCropRef | null
  pendingReuse: PendingReuse | null
  addPendingRef: (base64: string, sourceImageId: string) => void
  consumePendingRef: () => PendingCropRef | null
  setPendingReuse: (prompt: string, attachmentFilePaths?: string[]) => void
  consumePendingReuse: () => PendingReuse | null
}

let cropCounter = 1

export const useCropStore = create<CropStore>((set, get) => ({
  pendingRef: null,
  pendingReuse: null,

  addPendingRef: (base64, sourceImageId) => {
    set({
      pendingRef: {
        id: crypto.randomUUID(),
        base64,
        sourceImageId,
        name: `Crop ${cropCounter++}`,
      },
    })
  },

  consumePendingRef: () => {
    const ref = get().pendingRef
    if (ref) set({ pendingRef: null })
    return ref
  },

  setPendingReuse: (prompt, attachmentFilePaths) => {
    set({ pendingReuse: { prompt, attachmentFilePaths } })
  },

  consumePendingReuse: () => {
    const reuse = get().pendingReuse
    if (reuse) set({ pendingReuse: null })
    return reuse
  },
}))
