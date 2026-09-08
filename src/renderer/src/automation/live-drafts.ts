import { useLayoutEffect, useRef } from 'react'
import type { GptImageQuality, ThumbnailStyle, LogoStyle, FalBackground, FalInputFidelity } from '../types/api'

export type DraftMode = 'image' | 'thumbnail' | 'logo' | 'video' | 'inpaint' | 'canvas' | 'chat'
export interface DraftPatch {
  prompt?: string
  models?: string[]
  aspectRatio?: string
  resolution?: string
  imageCount?: number
  quality?: GptImageQuality
  seed?: number
  clearSeed?: boolean
  thumbnailStyle?: ThumbnailStyle
  logoStyle?: LogoStyle
  background?: FalBackground
  inputFidelity?: FalInputFidelity
  references?: string[]
  collectionIds?: string[]
  model?: string
  duration?: number
  generateAudio?: boolean
  cameraFixed?: boolean
  startFrame?: string
  clearStartFrame?: boolean
}
export interface LiveDraft {
  mode: DraftMode
  read: () => Record<string, unknown>
  update: (patch: DraftPatch) => Promise<void>
  submit: () => unknown | Promise<unknown>
  readReference: (id: string) => string | undefined | Promise<string | undefined>
}
const drafts = new Map<DraftMode, LiveDraft[]>()

/** A mounted editor owns its state; automation invokes exactly its UI actions. */
export function useLiveDraft(draft: LiveDraft): void {
  const current = useRef(draft)
  useLayoutEffect(() => { current.current = draft })
  useLayoutEffect(() => {
    const proxy: LiveDraft = {
      mode: draft.mode,
      read: () => current.current.read(),
      update: patch => current.current.update(patch),
      submit: () => current.current.submit(),
      readReference: id => current.current.readReference(id),
    }
    const entries = drafts.get(draft.mode) ?? []
    drafts.set(draft.mode, [...entries, proxy])
    return () => {
      const remaining = (drafts.get(draft.mode) ?? []).filter(entry => entry !== proxy)
      if (remaining.length) drafts.set(draft.mode, remaining)
      else drafts.delete(draft.mode)
    }
  }, [draft.mode])
}
export function mountedDraftModes(): DraftMode[] { return [...drafts.keys()] }
export function getLiveDraft(mode: DraftMode): LiveDraft {
  const draft = drafts.get(mode)?.at(-1)
  if (!draft) throw new Error(`The ${mode} editor is not mounted. Use navigate to open its app area first; inpaint/canvas require their editor to be opened.`)
  return draft
}
