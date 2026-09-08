import { useCallback, useEffect, useRef, useState } from 'react'
import { useCollectionsStore, type AssetCollection } from '../stores/collections-store'
import { collectionMention, imageMention, collectionReferenceLabel } from '../../../shared/reference-mentions'
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
 * `image_urls` order. Human paste and MCP draft edits use the same resolver.
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
      const chip = referenceChip(ref, false)
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
      const chip = referenceChip(cRef, true)
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
          if (ref) text += imageMention(ref.name)
        } else if (node.dataset.collectionRefId) {
          const cRef = collectionRefs.find((r) => r.id === node.dataset.collectionRefId)
          if (cRef) text += collectionMention(cRef.name)
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

  /** Shared live draft edits preserve real reference chips, including subsequent human typing. */
  const setDraftContent = useCallback((patch: { prompt?: string; images?: ImageRef[]; collections?: CollectionRef[] }) => {
    const editor = editorRef.current
    if (!editor) throw new Error('Prompt editor is not mounted')
    const text = patch.prompt ?? getPromptText()
    const nextImages = patch.images ?? imageRefs
    const nextCollections = patch.collections ?? resolvePromptCollections(text, collectionRefs, collections)
    if (patch.images) setImageRefs(nextImages)
    setCollectionRefs(nextCollections)
    editor.replaceChildren(promptFragment(text, nextImages, nextCollections))
    for (const collection of nextCollections) {
      if (editor.querySelector(`[data-collection-ref-id="${collection.id}"]`)) continue
      editor.append(document.createTextNode(' '), referenceChip(collection, true))
    }
    setPromptText(Array.from(editor.childNodes).map(node => {
      if (node instanceof HTMLElement && node.dataset.collectionRefId) {
        const ref = nextCollections.find(item => item.id === node.dataset.collectionRefId)
        return ref ? collectionMention(ref.name) : ''
      }
      if (node instanceof HTMLElement && node.dataset.imageRefId) {
        const ref = nextImages.find(item => item.id === node.dataset.imageRefId)
        return ref ? imageMention(ref.name) : ''
      }
      return node.textContent ?? ''
    }).join('').trim())
  }, [getPromptText, imageRefs, collectionRefs, collections])

  /** Insert plain clipboard text at the selection, restoring known reference chips. */
  const handleEditorPaste = useCallback((event: React.ClipboardEvent<HTMLDivElement>) => {
    const text = event.clipboardData.getData('text/plain')
    if (!text) return
    const editor = editorRef.current
    const selection = window.getSelection()
    if (!editor || !selection?.rangeCount) return
    const range = selection.getRangeAt(0)
    if (!editor.contains(range.commonAncestorContainer)) return
    event.preventDefault()
    const nextCollections = resolvePromptCollections(text, collectionRefs, collections)
    const fragment = promptFragment(text, imageRefs, nextCollections)
    const end = document.createTextNode('')
    fragment.append(end)
    range.deleteContents()
    range.insertNode(fragment)
    range.setStartAfter(end)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
    // Replacing a selection can remove the last occurrence of an existing chip.
    const liveIds = new Set(Array.from(editor.querySelectorAll<HTMLElement>('[data-collection-ref-id]')).map(chip => chip.dataset.collectionRefId))
    setCollectionRefs(nextCollections.filter(ref => liveIds.has(ref.id)))
    setShowMentionPopup(false)
    setMentionFilter('')
    syncPromptText()
  }, [imageRefs, collectionRefs, collections, syncPromptText])

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
        label: collectionReferenceLabel(cRef.name, images.length),
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
    setDraftContent,
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
    handleEditorPaste,
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

/** Exact, unambiguous names only; unknown markers remain editable text. */
function resolvePromptCollections(text: string, attached: CollectionRef[], available: AssetCollection[]): CollectionRef[] {
  const result = [...attached]
  for (const match of text.matchAll(/\[@([^\]\r\n]+)\]/g)) {
    const name = match[1]
    if (result.some(ref => ref.name === name)) continue
    const matches = available.filter(collection => collection.name === name)
    if (matches.length !== 1) continue
    const collection = matches[0]
    result.push({ id: crypto.randomUUID(), collectionId: collection.id, name, thumbnail: collection.images[0] || '', images: collection.images })
  }
  return result
}

function referenceChip(ref: CollectionRef | ImageRef, collection: boolean): HTMLSpanElement {
  const chip = document.createElement('span')
  chip.contentEditable = 'false'
  if (collection) chip.dataset.collectionRefId = ref.id
  else chip.dataset.imageRefId = ref.id
  chip.className = `inline-flex items-center gap-1 align-middle mx-0.5 px-1.5 py-0.5 rounded-md border text-[12px] font-medium cursor-default select-none ${collection ? 'bg-accent-dim border-accent-main/30 text-accent-main' : 'bg-surface-3 border-border-base text-text-primary'}`
  const source = collection ? (ref as CollectionRef).thumbnail : (ref as ImageRef).base64
  if (source) {
    const image = document.createElement('img')
    image.src = toDisplayUrl(source)
    image.className = 'w-4 h-4 rounded object-cover'
    image.alt = ''
    chip.append(image)
  }
  const label = document.createElement('span')
  label.textContent = `${collection ? '@' : ''}${ref.name}`
  chip.append(label)
  return chip
}

function promptFragment(text: string, images: ImageRef[], collections: CollectionRef[]): DocumentFragment {
  const fragment = document.createDocumentFragment()
  const markers = /\[@([^\]\r\n]+)\]|\[([^@\]\r\n][^\]\r\n]*)\]/g
  let last = 0
  for (const match of text.matchAll(markers)) {
    fragment.append(document.createTextNode(text.slice(last, match.index)))
    const collection = match[1] ? collections.find(ref => ref.name === match[1]) : undefined
    const image = match[2] ? images.find(ref => ref.name === match[2]) : undefined
    fragment.append(collection ? referenceChip(collection, true) : image ? referenceChip(image, false) : document.createTextNode(match[0]))
    last = match.index! + match[0].length
  }
  fragment.append(document.createTextNode(text.slice(last)))
  return fragment
}
