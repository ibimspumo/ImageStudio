import { create } from 'zustand'

interface PendingCropRef {
  id: string
  base64: string
  sourceImageId: string
  name: string
}

interface CropStore {
  pendingRef: PendingCropRef | null
  addPendingRef: (base64: string, sourceImageId: string) => void
  consumePendingRef: () => PendingCropRef | null
}

let cropCounter = 1

export const useCropStore = create<CropStore>((set, get) => ({
  pendingRef: null,

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
}))
