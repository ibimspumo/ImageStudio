import { useCallback, useEffect, useRef, useState } from 'react'
import { useCollectionsStore, type AssetCollection } from '../stores/collections-store'
import { toDisplayUrl } from '../stores/gallery-store'
import { collectionImagesAsBase64, compressImage } from '../lib/image-utils'
import { logger } from '../lib/logger'
import type { CollectionRef } from '../components/input/AttachmentStrip'
import type { MentionItem } from '../components/input/MentionPopup'
import type { ImageRef, LabeledAttachment } from '../types/api'

/**
 * The contenteditable prompt editor with `@`-mentions.
 *
 * Attached images and collections live as non-editable chips inside the editor;
 * `getPromptText()` turns them back into the `[Image 1]` / `[@Collection]`
 * markers that `buildReferencePreamble()` on the main side resolves against the
 * `image_urls` order. Shared by the main prompt bar and the chat view so both
 * produce byte-identical prompts — anything else would make a mention mean one
 * thing in the gallery and another in a chat.
 */
export function useMentionEditor() {
  const editorRef = useRef<HTMLDivElement>(null)
  const [imageRefs, setImageRefs] = useState<ImageRef[]>([])
  const [collectionRefs, setCollectionRefs] = useState<CollectionRef[]>([])
  const [showMentionPopup, setShowMentionPopup] = useState(false)
  const [mentionFilter, setMentionFilter] = useState('')
  const collections = useCollectionsStore((s) => s.collections)
  const nextImageNum = useRef(1)

  // ── Reference management ──────────────────────────────────────────

  const addImageRef = useCallback((base64: string, customName?: string): ImageRef => {
    let result: ImageRef | undefined
    setImageRefs((prev) => {
      const existing = prev.find((r) => r.base64 === base64)
      if (existing) {
        result = existing
        return prev
      }
      const ref: ImageRef = {
        id: crypto.randomUUID(),
        name: customName || `Image ${nextImageNum.current++}`,
        base64,
      }
      result = ref
      return [...prev, ref]
    })
    return result!
  }, [])

  const removeImageRef = useCallback((id: string) => {
    setImageRefs((prev) => prev.filter((r) => r.id !== id))
    editorRef.current?.querySelectorAll(`[data-image-ref-id="${id}"]`).forEach((chip) => chip.remove())
  }, [])

  const removeCollectionRef = useCallback((id: string) => {
    setCollectionRefs((prev) => prev.filter((r) => r.id !== id))
    editorRef.current
      ?.querySelectorAll(`[data-collection-ref-id="${id}"]`)
      .forEach((chip) => chip.remove())
  }, [])

  const clearRefs = useCallback(() => {
    setImageRefs([])
    setCollectionRefs([])
    if (editorRef.current) editorRef.current.innerHTML = ''
  }, [])

  // ── Chip insertion ────────────────────────────────────────────────

  /** Drop the `@filter` the user typed and leave the cursor where it was. */
  const consumeMentionQuery = useCallback((): Range | null => {
    const editor = editorRef.current
    if (!editor) return null
    editor.focus()
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return null
    const range = sel.getRangeAt(0)
    const textNode = range.startContainer
    if (textNode.nodeType === Node.TEXT_NODE) {
      const text = textNode.textContent || ''
      const cursorPos = range.startOffset
      const atIdx = text.lastIndexOf('@', cursorPos - 1)
      if (atIdx >= 0) {
        textNode.textContent = text.substring(0, atIdx) + text.substring(cursorPos)
        range.setStart(textNode, atIdx)
        range.setEnd(textNode, atIdx)
      }
    }
    return range
  }, [])

  const placeChip = useCallback((range: Range, chip: HTMLElement) => {
    range.deleteContents()
    range.insertNode(chip)
    const space = document.createTextNode(' ')
    chip.after(space)
    range.setStartAfter(space)
    range.setEndAfter(space)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
    setShowMentionPopup(false)
    setMentionFilter('')
  }, [])

  const insertChipAtCursor = useCallback(
    (ref: ImageRef) => {
      const range = consumeMentionQuery()
      if (!range) return
      const chip = document.createElement('span')
      chip.contentEditable = 'false'
      chip.dataset.imageRefId = ref.id
      chip.className =
        'inline-flex items-center gap-1 align-middle mx-0.5 px-1.5 py-0.5 rounded-md bg-surface-3 border border-border-base text-[12px] font-medium text-text-primary cursor-default select-none'
      chip.innerHTML = `<img src="${ref.base64}" class="w-4 h-4 rounded object-cover inline-block align-middle" /><span class="align-middle">${ref.name}</span>`
      placeChip(range, chip)
    },
    [consumeMentionQuery, placeChip]
  )

  const insertCollectionChipAtCursor = useCallback(
    (collection: AssetCollection) => {
      const range = consumeMentionQuery()
      if (!range) return
      // Mentioning an already-attached collection reuses its ref — the chip
      // points at the same id, so the images upload once however often the
      // prompt refers to them, and the ref only dies with its last chip.
      const existing = collectionRefs.find((r) => r.collectionId === collection.id)
      const cRef: CollectionRef = existing ?? {
        id: crypto.randomUUID(),
        collectionId: collection.id,
        name: collection.name,
        thumbnail: collection.images[0] || '',
        images: collection.images,
      }
      if (!existing) setCollectionRefs((prev) => [...prev, cRef])
      const chip = document.createElement('span')
      chip.contentEditable = 'false'
      chip.dataset.collectionRefId = cRef.id
      chip.className =
        'inline-flex items-center gap-1 align-middle mx-0.5 px-1.5 py-0.5 rounded-md bg-accent-dim border border-accent-main/30 text-[12px] font-medium text-text-primary cursor-default select-none'
      chip.innerHTML = `${collectionChipThumbnail(cRef.thumbnail)}<span class="align-middle">@${collection.name}</span>`
      placeChip(range, chip)
    },
    [consumeMentionQuery, placeChip, collectionRefs]
  )

  // ── Prompt text extraction ────────────────────────────────────────

  const getPromptText = useCallback((): string => {
    const editor = editorRef.current
    if (!editor) return ''
    let text = ''
    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent || ''
      } else if (node instanceof HTMLElement) {
        if (node.dataset.imageRefId) {
          const ref = imageRefs.find((r) => r.id === node.dataset.imageRefId)
          if (ref) text += `[${ref.name}]`
        } else if (node.dataset.collectionRefId) {
          const cRef = collectionRefs.find((r) => r.id === node.dataset.collectionRefId)
          if (cRef) text += `[@${cRef.name}]`
        } else if (node.tagName === 'BR') {
          text += '\n'
        } else {
          for (const child of node.childNodes) walk(child)
        }
      }
    }
    for (const child of editor.childNodes) walk(child)
    return text.trim()
  }, [imageRefs, collectionRefs])

  /**
   * The editor is a contenteditable, so its text lives in the DOM, not in
   * React state — typing on its own triggers no re-render, which used to leave
   * anything derived from the prompt (the Generate button above all) stale
   * until some unrelated update happened to re-render the bar. Mirroring the
   * text into state on every input is what keeps those in sync.
   */
  const [promptText, setPromptText] = useState('')

  const syncPromptText = useCallback(() => setPromptText(getPromptText()), [getPromptText])

  // `getPromptText` changes identity whenever a chip is added or removed, so
  // this also covers chip edits, which happen after their state update lands.
  useEffect(() => {
    syncPromptText()
  }, [syncPromptText])

  /**
   * Turn the attached references into the flat + labelled arrays the request
   * takes. Collections go out whole; fitting them into a model's reference
   * limit happens per model in `packReferencesForModel()`.
   */
  const buildAttachments = useCallback(async (): Promise<{
    attachments: string[]
    labeledAttachments: LabeledAttachment[]
  }> => {
    const attachments: string[] = []
    const labeledAttachments: LabeledAttachment[] = []

    for (const ref of imageRefs) {
      attachments.push(ref.base64)
      labeledAttachments.push({ label: ref.name, images: [ref.base64] })
    }

    // Belt and braces: a second ref to the same collection must never double
    // the upload, wherever it came from.
    const seenCollections = new Set<string>()
    for (const cRef of collectionRefs) {
      if (seenCollections.has(cRef.collectionId)) continue
      seenCollections.add(cRef.collectionId)
      const images = await collectionImagesAsBase64(cRef.images)
      attachments.push(...images)
      labeledAttachments.push({
        label: `Collection "@${cRef.name}" (${images.length} image${images.length === 1 ? '' : 's'})`,
        images,
      })
    }

    return { attachments, labeledAttachments }
  }, [imageRefs, collectionRefs])

  // ── Mention popup ─────────────────────────────────────────────────

  const mentionItems: MentionItem[] = [
    ...imageRefs
      .filter((r) => r.name.toLowerCase().includes(mentionFilter.toLowerCase()))
      .map((ref): MentionItem => ({ type: 'image', ref })),
    ...collections
      .filter((c) => c.name.toLowerCase().includes(mentionFilter.toLowerCase()))
      .map((collection): MentionItem => ({ type: 'collection', collection })),
  ]

  /**
   * Mention-related keys only. Returns true when the key was consumed, so the
   * caller can keep its own Enter/⌘Enter handling in one place.
   */
  const handleMentionKeyDown = useCallback(
    (e: React.KeyboardEvent): boolean => {
      if (!showMentionPopup) return false
      if (e.key === 'Escape') {
        e.preventDefault()
        setShowMentionPopup(false)
        return true
      }
      if (e.key === 'Enter' && mentionItems.length > 0) {
        e.preventDefault()
        const first = mentionItems[0]
        if (first.type === 'image') insertChipAtCursor(first.ref)
        else insertCollectionChipAtCursor(first.collection)
        return true
      }
      return false
    },
    [showMentionPopup, mentionItems, insertChipAtCursor, insertCollectionChipAtCursor]
  )

  const handleEditorInput = useCallback(() => {
    syncPromptText()

    // A chip the user deleted with backspace leaves no event of its own — the
    // DOM is the source of truth for which collections are still attached.
    const editor = editorRef.current
    if (editor) {
      const liveChipIds = new Set(
        Array.from(editor.querySelectorAll('[data-collection-ref-id]')).map(
          (el) => (el as HTMLElement).dataset.collectionRefId
        )
      )
      setCollectionRefs((prev) => {
        const filtered = prev.filter((r) => liveChipIds.has(r.id))
        return filtered.length !== prev.length ? filtered : prev
      })
    }

    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    const textNode = range.startContainer
    if (textNode.nodeType !== Node.TEXT_NODE) {
      if (showMentionPopup) setShowMentionPopup(false)
      return
    }
    const text = textNode.textContent || ''
    const cursorPos = range.startOffset
    const atIdx = text.lastIndexOf('@', cursorPos - 1)
    if (atIdx >= 0 && (imageRefs.length > 0 || collections.length > 0)) {
      const charBefore = atIdx > 0 ? text[atIdx - 1] : ' '
      if (charBefore === ' ' || charBefore === ' ' || atIdx === 0) {
        setMentionFilter(text.substring(atIdx + 1, cursorPos).toLowerCase())
        setShowMentionPopup(true)
        return
      }
    }
    if (showMentionPopup) setShowMentionPopup(false)
  }, [imageRefs, collections, showMentionPopup, syncPromptText])

  // ── File input & drag/drop ────────────────────────────────────────

  const fileInputRef = useRef<HTMLInputElement>(null)

  const readAsDataUrl = (file: File) =>
    new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.readAsDataURL(file)
    })

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (!files) return
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue
        try {
          addImageRef(await compressImage(await readAsDataUrl(file)))
        } catch (err) {
          logger.error('useMentionEditor', 'Failed to read/compress file', err)
        }
      }
      e.target.value = ''
    },
    [addImageRef]
  )

  const handleImageDrop = useCallback(
    async (e: React.DragEvent) => {
      const internalData = e.dataTransfer.getData('application/x-imagestudio')
      if (internalData) {
        try {
          const result = await window.api.readImage(internalData)
          if (result.success && result.base64DataUrl) {
            addImageRef(await compressImage(result.base64DataUrl))
          }
        } catch (err) {
          logger.error('useMentionEditor', 'Failed to load internal drag image', err)
        }
        return
      }
      for (const file of Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'))) {
        try {
          addImageRef(await compressImage(await readAsDataUrl(file)))
        } catch (err) {
          logger.error('useMentionEditor', 'Failed to read/compress dropped file', err)
        }
      }
    },
    [addImageRef]
  )

  return {
    editorRef,
    fileInputRef,
    imageRefs,
    collectionRefs,
    setCollectionRefs,
    collections,
    promptText,
    syncPromptText,
    addImageRef,
    removeImageRef,
    removeCollectionRef,
    clearRefs,
    insertChipAtCursor,
    insertCollectionChipAtCursor,
    getPromptText,
    buildAttachments,
    mentionItems,
    showMentionPopup,
    handleMentionKeyDown,
    handleEditorInput,
    handleFileSelect,
    handleImageDrop,
  }
}

/** Chip thumbnail markup — an image when the collection has one, else a folder. */
export function collectionChipThumbnail(thumbnail: string): string {
  return thumbnail
    ? `<img src="${toDisplayUrl(thumbnail)}" class="w-4 h-4 rounded object-cover inline-block align-middle" />`
    : '<span class="inline-flex w-4 h-4 items-center justify-center"><svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg></span>'
}
