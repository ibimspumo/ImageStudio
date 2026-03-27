import { useState, useRef, useCallback, useEffect } from 'react'
import { Plus, Wand2, MinusCircle } from 'lucide-react'
import { useImageGeneration } from '../../hooks/useImageGeneration'
import { useSettingsStore } from '../../stores/settings-store'
import { useCollectionsStore, type AssetCollection } from '../../stores/collections-store'
import type { AspectRatio, Resolution, ImageRef } from '../../types/api'
import { cn } from '../../lib/utils'
import { logger } from '../../lib/logger'
import { nanoid } from 'nanoid'
import { prepareCollectionImages, compressImage } from '../../lib/image-utils'
import { useCropStore } from '../../stores/crop-store'
import { toDisplayUrl } from '../../stores/gallery-store'
import { AttachmentStrip, type CollectionRef } from './AttachmentStrip'
import { MentionPopup, type MentionItem } from './MentionPopup'
import { ControlsRow } from './ControlsRow'
import { usePresetsStore } from '../../stores/presets-store'

export interface InpaintContext {
  imageId: string
  filePath: string
  sourcePrompt: string
  getOverlayBase64: () => string | null
  onClose: () => void
}

export interface CanvasContext {
  getCanvasBase64: () => string | null
  onClose: () => void
}

interface PromptBarProps {
  onSettingsClick?: () => void
  onCollectionsClick?: () => void
  onPresetsManage?: () => void
  onQueueClick?: () => void
  queuePendingCount?: number
  inpaintContext?: InpaintContext
  canvasContext?: CanvasContext
  initialModels?: string[]
  onCanvasClick?: () => void
}

export function PromptBar({ onSettingsClick, onCollectionsClick, onPresetsManage, onQueueClick, queuePendingCount, inpaintContext, canvasContext, initialModels, onCanvasClick }: PromptBarProps = {}) {
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1')
  const [customRatio, setCustomRatio] = useState<string>('4:3')
  const [resolution, setResolution] = useState<Resolution>('2K')
  const [imageCount, setImageCount] = useState(1)
  const [selectedModels, setSelectedModels] = useState<string[]>(initialModels || ['google/gemini-3-pro-image-preview'])
  const [imageRefs, setImageRefs] = useState<ImageRef[]>([])
  const [collectionRefs, setCollectionRefs] = useState<CollectionRef[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [showMentionPopup, setShowMentionPopup] = useState(false)
  const [mentionFilter, setMentionFilter] = useState('')
  const [negativePrompt, setNegativePrompt] = useState('')
  const [showNegativePrompt, setShowNegativePrompt] = useState(false)
  const [seed, setSeed] = useState<number | undefined>(undefined)
  const [activePresetId, setActivePresetId] = useState<string | null>(null)
  const [isEnhancing, setIsEnhancing] = useState(false)

  const editorRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragCountRef = useRef(0)
  const nextImageNum = useRef(1)

  const { generate } = useImageGeneration()
  const apiKey = useSettingsStore((s) => s.apiKey)
  const hydrated = useSettingsStore((s) => s.hydrated)
  const collections = useCollectionsStore((s) => s.collections)
  const presets = usePresetsStore((s) => s.presets)

  // ── Image ref management ──────────────────────────────────────────

  const addImageRef = useCallback((base64: string, customName?: string): ImageRef => {
    const existing = imageRefs.find((r) => r.base64 === base64)
    if (existing) return existing
    const name = customName || `Image ${nextImageNum.current++}`
    const ref: ImageRef = { id: crypto.randomUUID(), name, base64 }
    setImageRefs((prev) => [...prev, ref])
    return ref
  }, [imageRefs])

  // Consume pending crop references from the crop store
  const pendingCropRef = useCropStore((s) => s.pendingRef)
  const consumePendingRef = useCropStore((s) => s.consumePendingRef)

  useEffect(() => {
    if (pendingCropRef) {
      const ref = consumePendingRef()
      if (ref) addImageRef(ref.base64, ref.name)
    }
  }, [pendingCropRef, consumePendingRef, addImageRef])

  // Consume pending reuse (from "Reuse Prompt" in lightbox)
  const pendingReuse = useCropStore((s) => s.pendingReuse)
  const consumePendingReuse = useCropStore((s) => s.consumePendingReuse)

  useEffect(() => {
    if (pendingReuse) {
      const reuse = consumePendingReuse()
      if (!reuse) return

      setImageRefs([])
      setCollectionRefs([])
      if (editorRef.current) editorRef.current.innerHTML = ''

      const collectionMentionRegex = /\[@([^\]]+)\]/g
      const imageMentionRegex = /\[([^@\]][^\]]*)\]/g
      const matchedCollections: AssetCollection[] = []
      let match: RegExpExecArray | null

      while ((match = collectionMentionRegex.exec(reuse.prompt)) !== null) {
        const col = collections.find((c) => c.name === match![1])
        if (col) matchedCollections.push(col)
      }

      let individualImageCount = 0
      while ((match = imageMentionRegex.exec(reuse.prompt)) !== null) {
        individualImageCount++
      }

      if (editorRef.current) {
        let html = ''
        let lastIndex = 0
        const allMentionRegex = /\[@([^\]]+)\]|\[([^@\]][^\]]*)\]/g

        while ((match = allMentionRegex.exec(reuse.prompt)) !== null) {
          const textBefore = reuse.prompt.substring(lastIndex, match.index)
          if (textBefore) html += textBefore.replace(/\n/g, '<br>')

          if (match[1]) {
            const col = collections.find((c) => c.name === match![1])
            if (col) {
              const cRef: CollectionRef = {
                id: crypto.randomUUID(),
                collectionId: col.id,
                name: col.name,
                thumbnail: col.images[0] || '',
                images: col.images,
              }
              setCollectionRefs((prev) => [...prev, cRef])
              const thumbnailHtml = cRef.thumbnail
                ? `<img src="${toDisplayUrl(cRef.thumbnail)}" class="w-4 h-4 rounded object-cover inline-block align-middle" />`
                : '<span class="inline-flex w-4 h-4 items-center justify-center"><svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg></span>'
              html += `<span contenteditable="false" data-collection-ref-id="${cRef.id}" class="inline-flex items-center gap-1 align-middle mx-0.5 px-1.5 py-0.5 rounded-md bg-accent-dim border border-accent-main/30 text-[12px] font-medium text-text-primary cursor-default select-none">${thumbnailHtml}<span class="align-middle">@${col.name}</span></span>\u00A0`
            } else {
              html += match[0]
            }
          } else if (match[2]) {
            html += match[0]
          }
          lastIndex = match.index + match[0].length
        }

        const remaining = reuse.prompt.substring(lastIndex)
        if (remaining) html += remaining.replace(/\n/g, '<br>')

        editorRef.current.innerHTML = html

        const range = document.createRange()
        range.selectNodeContents(editorRef.current)
        range.collapse(false)
        const sel = window.getSelection()
        sel?.removeAllRanges()
        sel?.addRange(range)
      }

      // Restore negative prompt and seed if available
      if (reuse.negativePrompt) {
        setNegativePrompt(reuse.negativePrompt)
        setShowNegativePrompt(true)
      }
      if (reuse.seed != null) {
        setSeed(reuse.seed)
      }

      if (reuse.attachmentFilePaths && reuse.attachmentFilePaths.length > 0) {
        const individualPaths = reuse.attachmentFilePaths.slice(0, individualImageCount)
        ;(async () => {
          for (const fp of individualPaths) {
            try {
              const result = await window.api.readImage(fp)
              if (result.success) {
                const compressed = await compressImage(result.base64DataUrl)
                addImageRef(compressed)
              }
            } catch (err) {
              logger.error('PromptBar', 'Failed to load reuse attachment', err)
            }
          }
        })()
      }
    }
  }, [pendingReuse, consumePendingReuse, addImageRef, collections])

  const removeImageRef = useCallback((id: string) => {
    setImageRefs((prev) => prev.filter((r) => r.id !== id))
    const editor = editorRef.current
    if (editor) {
      const chips = editor.querySelectorAll(`[data-image-ref-id="${id}"]`)
      chips.forEach((chip) => chip.remove())
    }
  }, [])

  const removeCollectionRef = useCallback((id: string) => {
    setCollectionRefs((prev) => prev.filter((r) => r.id !== id))
    const editor = editorRef.current
    if (editor) {
      const chips = editor.querySelectorAll(`[data-collection-ref-id="${id}"]`)
      chips.forEach((chip) => chip.remove())
    }
  }, [])

  // ── Chip insertion ────────────────────────────────────────────────

  const insertChipAtCursor = useCallback((ref: ImageRef) => {
    const editor = editorRef.current
    if (!editor) return
    editor.focus()
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    const textNode = range.startContainer
    if (textNode.nodeType === Node.TEXT_NODE) {
      const text = textNode.textContent || ''
      const cursorPos = range.startOffset
      const atIdx = text.lastIndexOf('@', cursorPos - 1)
      if (atIdx >= 0) {
        const before = text.substring(0, atIdx)
        const after = text.substring(cursorPos)
        textNode.textContent = before + after
        range.setStart(textNode, atIdx)
        range.setEnd(textNode, atIdx)
      }
    }
    const chip = document.createElement('span')
    chip.contentEditable = 'false'
    chip.dataset.imageRefId = ref.id
    chip.className = 'inline-flex items-center gap-1 align-middle mx-0.5 px-1.5 py-0.5 rounded-md bg-surface-3 border border-border-base text-[12px] font-medium text-text-primary cursor-default select-none'
    chip.innerHTML = `<img src="${ref.base64}" class="w-4 h-4 rounded object-cover inline-block align-middle" /><span class="align-middle">${ref.name}</span>`
    range.deleteContents()
    range.insertNode(chip)
    const space = document.createTextNode('\u00A0')
    chip.after(space)
    range.setStartAfter(space)
    range.setEndAfter(space)
    sel.removeAllRanges()
    sel.addRange(range)
    setShowMentionPopup(false)
    setMentionFilter('')
  }, [])

  const insertCollectionChipAtCursor = useCallback((collection: AssetCollection) => {
    const editor = editorRef.current
    if (!editor) return
    editor.focus()
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    const textNode = range.startContainer
    if (textNode.nodeType === Node.TEXT_NODE) {
      const text = textNode.textContent || ''
      const cursorPos = range.startOffset
      const atIdx = text.lastIndexOf('@', cursorPos - 1)
      if (atIdx >= 0) {
        const before = text.substring(0, atIdx)
        const after = text.substring(cursorPos)
        textNode.textContent = before + after
        range.setStart(textNode, atIdx)
        range.setEnd(textNode, atIdx)
      }
    }
    const cRef: CollectionRef = {
      id: crypto.randomUUID(),
      collectionId: collection.id,
      name: collection.name,
      thumbnail: collection.images[0] || '',
      images: collection.images,
    }
    setCollectionRefs((prev) => [...prev, cRef])
    const chip = document.createElement('span')
    chip.contentEditable = 'false'
    chip.dataset.collectionRefId = cRef.id
    chip.className = 'inline-flex items-center gap-1 align-middle mx-0.5 px-1.5 py-0.5 rounded-md bg-accent-dim border border-accent-main/30 text-[12px] font-medium text-text-primary cursor-default select-none'
    const thumbnailHtml = cRef.thumbnail
      ? `<img src="${toDisplayUrl(cRef.thumbnail)}" class="w-4 h-4 rounded object-cover inline-block align-middle" />`
      : '<span class="inline-flex w-4 h-4 items-center justify-center"><svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg></span>'
    chip.innerHTML = `${thumbnailHtml}<span class="align-middle">@${collection.name}</span>`
    range.deleteContents()
    range.insertNode(chip)
    const space = document.createTextNode('\u00A0')
    chip.after(space)
    range.setStartAfter(space)
    range.setEndAfter(space)
    sel.removeAllRanges()
    sel.addRange(range)
    setShowMentionPopup(false)
    setMentionFilter('')
  }, [])

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

  // ── Submit ────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    const text = getPromptText()
    if (!text || !apiKey) return

    const attachments: string[] = []
    const labeledAttachments: { label: string; images: string[] }[] = []

    for (const ref of imageRefs) {
      attachments.push(ref.base64)
      labeledAttachments.push({ label: ref.name, images: [ref.base64] })
    }

    for (const cRef of collectionRefs) {
      const processed = await prepareCollectionImages(cRef.images)
      attachments.push(...processed)

      if (cRef.images.length <= 5) {
        labeledAttachments.push({
          label: `Collection "${cRef.name}" (${cRef.images.length} images)`,
          images: processed,
        })
      } else {
        const imagesPerGrid = 4
        for (let i = 0; i < processed.length; i++) {
          const startIdx = i * imagesPerGrid + 1
          const endIdx = Math.min(startIdx + imagesPerGrid - 1, cRef.images.length)
          labeledAttachments.push({
            label: `Collection "${cRef.name}" — grid composite ${i + 1}/${processed.length} (images ${startIdx}–${endIdx} of ${cRef.images.length})`,
            images: [processed[i]],
          })
        }
      }
    }

    // Inject inpaint context if present
    if (inpaintContext) {
      const overlayBase64 = inpaintContext.getOverlayBase64()
      if (!overlayBase64) return // no mask drawn

      try {
        const readResult = await window.api.readImage(inpaintContext.filePath)
        if (!readResult.success || !readResult.base64DataUrl) return

        const compressedOriginal = await compressImage(readResult.base64DataUrl as string, 2048, 0.85)
        const compressedOverlay = await compressImage(overlayBase64, 2048, 0.85)

        // Prepend inpaint attachments
        attachments.unshift(compressedOverlay, compressedOriginal)
        labeledAttachments.unshift(
          { label: 'Image with green highlight showing the region to edit — replace ONLY the green area', images: [compressedOverlay] },
          { label: 'Original image (clean, high quality reference) — preserve everything outside the highlighted region exactly', images: [compressedOriginal] },
        )
      } catch (err) {
        console.error('Failed to prepare inpaint images', err)
        return
      }
    }

    // Inject canvas context if present
    let canvasSketchPath: string | undefined
    if (canvasContext) {
      const canvasBase64 = canvasContext.getCanvasBase64()
      if (!canvasBase64) return // empty canvas

      try {
        const compressedCanvas = await compressImage(canvasBase64, 2048, 0.85)

        // Save sketch to disk for compare functionality
        const sketchFilename = `canvas-sketch-${nanoid()}.png`
        const saveResult = await window.api.saveImage(canvasBase64, sketchFilename)
        if (saveResult.success && saveResult.filePath) {
          canvasSketchPath = saveResult.filePath
        }

        attachments.unshift(compressedCanvas)
        labeledAttachments.unshift(
          { label: 'Reference sketch drawn by the user — generate a detailed image based on this sketch, following its composition, layout, and color placement', images: [compressedCanvas] },
        )
      } catch (err) {
        console.error('Failed to prepare canvas image', err)
        return
      }
    }

    // Apply active preset suffix
    const activePreset = activePresetId ? presets.find(p => p.id === activePresetId) : null
    const finalPrompt = activePreset ? `${text}, ${activePreset.suffix}` : text

    // Build separate API prompt for inpaint mode
    let apiPromptText: string | undefined
    if (inpaintContext) {
      const hasUserRefs = imageRefs.length > 0 || collectionRefs.length > 0
      const refNote = hasUserRefs
        ? ' The user has also attached additional reference images — use them as visual guidance for what should appear in the edited region.'
        : ''
      apiPromptText = `Edit this image. The green-highlighted region should be replaced with: ${finalPrompt}. Keep everything outside the green highlight exactly the same — same composition, lighting, colors, and details.${refNote} Original description of the source image: "${inpaintContext.sourcePrompt}"`
    }

    // Build separate API prompt for canvas mode
    if (canvasContext) {
      const hasUserRefs = imageRefs.length > 0 || collectionRefs.length > 0
      const refNote = hasUserRefs
        ? ' The user has also attached additional reference images — use them as visual guidance.'
        : ''
      apiPromptText = `Generate an image based on the attached sketch. The sketch shows the composition, shapes, and color layout. Create a detailed, high-quality image that matches the sketch's layout: ${finalPrompt}${refNote}`
    }

    const resolvedAspectRatio = aspectRatio === 'custom' ? customRatio : aspectRatio
    generate({
      prompt: inpaintContext ? `Inpaint: ${text}` : canvasContext ? `Canvas: ${text}` : finalPrompt,
      apiPrompt: apiPromptText || undefined,
      aspectRatio: resolvedAspectRatio,
      resolution,
      imageCount,
      attachments: attachments.length > 0 ? attachments : undefined,
      labeledAttachments: labeledAttachments.length > 0 ? labeledAttachments : undefined,
      models: selectedModels,
      negativePrompt: negativePrompt || undefined,
      seed,
      inpaintSourceId: inpaintContext?.imageId,
      canvasSketchPath,
    })

    // Close inpaint modal after generating
    if (inpaintContext) {
      inpaintContext.onClose()
    }

    // Close canvas modal after generating
    if (canvasContext) {
      canvasContext.onClose()
    }
  }, [getPromptText, apiKey, imageRefs, collectionRefs, generate, aspectRatio, customRatio, resolution, imageCount, selectedModels, negativePrompt, seed, activePresetId, presets, inpaintContext, canvasContext])

  // ── Mention items ─────────────────────────────────────────────────

  const mentionItems: MentionItem[] = [
    ...imageRefs
      .filter((r) => r.name.toLowerCase().includes(mentionFilter.toLowerCase()))
      .map((ref): MentionItem => ({ type: 'image', ref })),
    ...collections
      .filter((c) => c.name.toLowerCase().includes(mentionFilter.toLowerCase()))
      .map((collection): MentionItem => ({ type: 'collection', collection })),
  ]

  // ── Editor keyboard handling ──────────────────────────────────────

  const handleEditorKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSubmit()
      return
    }
    if (showMentionPopup) {
      if (e.key === 'Escape') { e.preventDefault(); setShowMentionPopup(false); return }
      if (e.key === 'Enter' && mentionItems.length > 0) {
        e.preventDefault()
        const first = mentionItems[0]
        if (first.type === 'image') insertChipAtCursor(first.ref)
        else insertCollectionChipAtCursor(first.collection)
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault()
      document.execCommand('insertLineBreak')
    }
  }, [handleSubmit, showMentionPopup, mentionItems, insertChipAtCursor, insertCollectionChipAtCursor])

  const handleEditorInput = useCallback(() => {
    const editor = editorRef.current
    if (editor) {
      const existingCollectionChipIds = new Set(
        Array.from(editor.querySelectorAll('[data-collection-ref-id]'))
          .map((el) => (el as HTMLElement).dataset.collectionRefId)
      )
      setCollectionRefs((prev) => {
        const filtered = prev.filter((r) => existingCollectionChipIds.has(r.id))
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
    const hasImageRefs = imageRefs.length > 0
    const hasCollections = collections.length > 0
    if (atIdx >= 0 && (hasImageRefs || hasCollections)) {
      const charBefore = atIdx > 0 ? text[atIdx - 1] : ' '
      if (charBefore === ' ' || charBefore === '\u00A0' || atIdx === 0) {
        setMentionFilter(text.substring(atIdx + 1, cursorPos).toLowerCase())
        setShowMentionPopup(true)
        return
      }
    }
    if (showMentionPopup) setShowMentionPopup(false)
  }, [imageRefs, collections, showMentionPopup])

  // ── File handling ─────────────────────────────────────────────────

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue
      try {
        const raw = await new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.readAsDataURL(file)
        })
        const compressed = await compressImage(raw)
        addImageRef(compressed)
      } catch (err) {
        logger.error('PromptBar', 'Failed to read/compress file', err)
      }
    }
    e.target.value = ''
  }, [addImageRef])

  // ── Drag & drop ───────────────────────────────────────────────────

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy' }, [])
  const handleDragEnter = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); dragCountRef.current++; setIsDragOver(true) }, [])
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); dragCountRef.current--; if (dragCountRef.current === 0) setIsDragOver(false) }, [])
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    dragCountRef.current = 0
    const internalData = e.dataTransfer.getData('application/x-imagestudio')
    if (internalData) {
      try {
        const result = await window.api.readImage(internalData)
        if (result.success) {
          const compressed = await compressImage(result.base64DataUrl)
          addImageRef(compressed)
        }
      } catch (err) {
        logger.error('PromptBar', 'Failed to load internal drag image', err)
      }
      return
    }
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'))
    for (const file of files) {
      try {
        const raw = await new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.readAsDataURL(file)
        })
        const compressed = await compressImage(raw)
        addImageRef(compressed)
      } catch (err) {
        logger.error('PromptBar', 'Failed to read/compress dropped file', err)
      }
    }
  }, [addImageRef])

  // Prevent browser default drag behavior (opening files)
  useEffect(() => {
    const handler = (e: DragEvent) => e.preventDefault()
    document.addEventListener('dragover', handler)
    document.addEventListener('drop', handler)
    return () => {
      document.removeEventListener('dragover', handler)
      document.removeEventListener('drop', handler)
    }
  }, [])

  // ── Clear ─────────────────────────────────────────────────────────

  const clearPrompt = useCallback(() => {
    setImageRefs([])
    setCollectionRefs([])
    if (editorRef.current) editorRef.current.innerHTML = ''
    setNegativePrompt('')
    setShowNegativePrompt(false)
    setSeed(undefined)
  }, [])

  const handleEnhancePrompt = useCallback(async () => {
    const text = getPromptText()
    if (!text || !apiKey || isEnhancing) return
    setIsEnhancing(true)
    try {
      const result = await window.api.enhancePrompt({ prompt: text, apiKey })
      if (result.success && result.enhanced && editorRef.current) {
        editorRef.current.textContent = result.enhanced
      }
    } catch (err) {
      logger.error('PromptBar', 'Prompt enhancement failed', err)
    } finally {
      setIsEnhancing(false)
    }
  }, [getPromptText, apiKey, isEnhancing])

  // ── Render ────────────────────────────────────────────────────────

  const promptText = getPromptText()
  const hasContent = promptText || imageRefs.length > 0 || collectionRefs.length > 0
  const canSend = !!promptText && !!apiKey
  const isInpaintMode = !!inpaintContext
  const isCanvasMode = !!canvasContext
  const isEmbeddedMode = isInpaintMode || isCanvasMode

  return (
    <div className={cn("shrink-0 flex flex-col items-center", isEmbeddedMode ? "px-6 pb-4 pt-3" : "px-6 pb-6 pt-3")}>
      <div className="w-full max-w-[800px] relative">
        <div
          className={cn(
            'prompt-card grain relative border rounded-2xl transition-all',
            isDragOver ? 'border-accent-main/60 glow-accent-strong' : 'border-border-base'
          )}
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Top luminous edge */}
          <div className="absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />

          {/* Drag overlay */}
          {isDragOver && (
            <div className="absolute inset-0 z-10 rounded-2xl bg-accent-main/8 backdrop-blur-sm flex items-center justify-center pointer-events-none border-2 border-dashed border-accent-main/40">
              <div className="flex flex-col items-center gap-2">
                <Plus className="w-6 h-6 text-accent-main" />
                <span className="text-[13px] font-medium text-accent-main">Drop as reference</span>
              </div>
            </div>
          )}

          {/* Attachments */}
          <AttachmentStrip
            imageRefs={imageRefs}
            collectionRefs={collectionRefs}
            onRemoveImage={removeImageRef}
            onRemoveCollection={removeCollectionRef}
            onAddMore={() => fileInputRef.current?.click()}
          />

          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileSelect} />

          {/* ContentEditable editor */}
          <div className={cn('flex items-start gap-2 pb-3', imageRefs.length > 0 ? 'px-5 pt-3' : 'px-4 pt-4')}>
            {imageRefs.length === 0 && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="no-drag shrink-0 mt-0.5 w-8 h-8 rounded-full flex items-center justify-center border border-border-base text-text-secondary hover:text-text-primary hover:bg-surface-4 hover:border-border-bright transition-all"
                title="Attach images"
              >
                <Plus className="w-4 h-4" />
              </button>
            )}
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={handleEditorInput}
              onKeyDown={handleEditorKeyDown}
              data-placeholder={isInpaintMode ? "Describe what should appear in the masked area..." : isCanvasMode ? "Describe what to generate from your sketch..." : "Describe your image..."}
              className="prompt-editor flex-1 min-h-[44px] max-h-[140px] overflow-y-auto text-[14px] text-text-primary leading-relaxed outline-none pt-1"
            />
            <button
              onClick={handleEnhancePrompt}
              disabled={isEnhancing || !getPromptText()}
              className={cn(
                'no-drag shrink-0 mt-1 w-7 h-7 rounded-lg flex items-center justify-center transition-all',
                isEnhancing
                  ? 'text-accent-main animate-pulse'
                  : getPromptText()
                    ? 'text-text-muted hover:text-accent-main hover:bg-surface-3'
                    : 'text-text-muted/30 cursor-not-allowed'
              )}
              title="Enhance prompt"
            >
              <Wand2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Negative prompt (collapsible) */}
          {showNegativePrompt && (
            <div className="px-5 pb-3">
              <textarea
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                placeholder="Negative prompt — what to avoid..."
                className="w-full min-h-[36px] max-h-[80px] bg-surface-3 border border-border-dim rounded-lg px-3 py-2 text-[13px] text-text-secondary leading-relaxed outline-none resize-none placeholder:text-text-muted/50 focus:border-border-base transition-colors"
                rows={1}
              />
            </div>
          )}

          {/* Separator */}
          <div className="mx-4 h-px bg-border-dim/60" />

          {/* @-mention popup */}
          {showMentionPopup && (
            <MentionPopup
              items={mentionItems}
              onSelectImage={insertChipAtCursor}
              onSelectCollection={insertCollectionChipAtCursor}
            />
          )}

          {/* Controls */}
          <ControlsRow
            selectedModels={selectedModels}
            onModelsChange={setSelectedModels}
            aspectRatio={aspectRatio}
            onAspectRatioChange={setAspectRatio}
            customRatio={customRatio}
            onCustomRatioChange={setCustomRatio}
            resolution={resolution}
            onResolutionChange={setResolution}
            imageCount={imageCount}
            onImageCountChange={setImageCount}
            canSend={canSend}
            hasContent={!!hasContent}
            onSubmit={handleSubmit}
            onClear={clearPrompt}
            onSettingsClick={isEmbeddedMode ? undefined : onSettingsClick}
            onCollectionsClick={isEmbeddedMode ? undefined : onCollectionsClick}
            negativePromptActive={showNegativePrompt}
            onNegativePromptToggle={() => setShowNegativePrompt(!showNegativePrompt)}
            seed={seed}
            onSeedChange={setSeed}
            activePresetId={activePresetId}
            onPresetChange={setActivePresetId}
            onPresetsManage={isEmbeddedMode ? undefined : onPresetsManage}
            onQueueClick={isEmbeddedMode ? undefined : onQueueClick}
            queuePendingCount={isEmbeddedMode ? undefined : queuePendingCount}
            onCanvasClick={isEmbeddedMode ? undefined : onCanvasClick}
          />
        </div>

        {/* Hint - only show when not in embedded mode */}
        {!isEmbeddedMode && (
          <div className="flex justify-center mt-2.5">
            <p className="text-[11px] text-text-muted/70">
              {hydrated && !apiKey ? (
                <button onClick={onSettingsClick} className="text-danger/80 hover:text-danger transition-colors cursor-pointer">
                  API key missing — click to open Settings
                </button>
              ) : (
                <>
                  <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-surface-2 text-text-muted border border-border-dim text-[10px] mr-0.5">&#x2318;</kbd>
                  <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-surface-2 text-text-muted border border-border-dim text-[10px] mx-0.5">&#x23CE;</kbd>
                  {(imageRefs.length > 0 || collections.length > 0) && (
                    <>
                      {'  \u00B7  '}
                      <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-surface-2 text-text-muted border border-border-dim text-[10px] mx-0.5">@</kbd>
                      {' references'}
                    </>
                  )}
                </>
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
