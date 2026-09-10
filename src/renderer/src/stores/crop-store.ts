import { create } from 'zustand'
import type { FalBackground } from '../types/api'

interface PendingCropRef {
  id: string
  base64: string
  sourceImageId: string
  name: string
}

export interface ReuseOptions {
  labeledAttachments?: { label: string; images: string[] }[]
  isPrint?: boolean
  printFormat?: import('../../../shared/print-prompt').PrintFormat
  printStyle?: import('../../../shared/print-prompt').PrintStyle
  printMetaPrompt?: string
  background?: FalBackground
  model?: string
  aspectRatio?: string
  resolution?: string
  imageSize?: { width: number; height: number }
  quality?: string
  outputFormat?: 'png' | 'jpeg' | 'webp'
  outputCompression?: number
}

interface PendingReuse extends ReuseOptions {
  prompt: string
  attachmentFilePaths?: string[]  // internal paths or embedded image snapshots
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
