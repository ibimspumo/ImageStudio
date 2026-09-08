import { prepareInpaintReferences, buildInpaintPrompt } from '../../lib/image-editing'
import { useState, useRef, useCallback, useEffect } from 'react'
import { Plus, Send } from 'lucide-react'
import { useImageGeneration } from '../../hooks/useImageGeneration'
import { useMentionEditor, collectionChipThumbnail } from '../../hooks/useMentionEditor'
import { useSettingsStore } from '../../stores/settings-store'
import { type AssetCollection } from '../../stores/collections-store'
import type {
  AspectRatio,
  Resolution,
  GptImageQuality,
  ThumbnailStyle,
  LogoStyle,
  FalBackground,
  FalInputFidelity,
} from '../../types/api'
import {
  DEFAULT_MODEL,
  DEFAULT_THUMBNAIL_MODEL,
  DEFAULT_LOGO_MODEL,
  getCombinedCapabilities,
  getModelName,
  normalizeModelId,
  isThumbnailModel,
  isLogoModel,
  buildThumbnailSystemPrompt,
  buildLogoSystemPrompt,
  THUMBNAIL_ASPECT_RATIO,
  THUMBNAIL_RESOLUTION,
  THUMBNAIL_GPT_IMAGE_SIZE,
  LOGO_BACKGROUND,
  LOGO_OUTPUT_FORMAT,
  LOGO_DEFAULT_ASPECT_RATIO,
  LOGO_ASPECT_RATIOS,
} from '../../types/api'
import { CostEstimate } from './CostEstimate'
import { ThumbnailControls } from '../thumbnail/ThumbnailControls'
import { LogoControls } from '../logo/LogoControls'
import { useThumbnailProjectsStore } from '../../stores/thumbnail-projects-store'
import { useThumbnailMetaPromptsStore } from '../../stores/thumbnail-meta-prompts-store'
import { cn } from '../../lib/utils'
import { logger } from '../../lib/logger'
import { useLiveDraft } from '../../automation/live-drafts'
import { rejectDraftFields, resolveDraftReference } from '../../automation/draft-tools'
import { prepareCanvasSketch, buildCanvasPrompt, CANVAS_SKETCH_REFERENCE_LABEL } from '../../lib/canvas-generation'
import { compressImage } from '../../lib/image-utils'
import { useCropStore } from '../../stores/crop-store'
import { AttachmentStrip, type CollectionRef } from './AttachmentStrip'
import { MentionPopup } from './MentionPopup'
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
  inpaintContext?: InpaintContext
  canvasContext?: CanvasContext
  initialModels?: string[]
  onCanvasClick?: () => void
  /**
   * Thumbnail mode: format is locked to 16:9 / 2K, the model list is filtered,
   * and the thumbnail system prompt rides along with every request. Everything
   * else — references, @-mentions, drag & drop, collections — stays identical.
   */
  thumbnailMode?: boolean
  /**
   * Logo mode: the model list is filtered to the ones with a `background`
   * field, the background is transparent and the output format is PNG, and the
   * logo rules ride along with every request. References, @-mentions, drag &
   * drop and collections stay identical.
   */
  logoMode?: boolean
}

export function PromptBar({ onSettingsClick, onCollectionsClick, onPresetsManage, onQueueClick, inpaintContext, canvasContext, initialModels, onCanvasClick, thumbnailMode, logoMode }: PromptBarProps = {}) {
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(
    thumbnailMode ? '16:9' : logoMode ? (LOGO_DEFAULT_ASPECT_RATIO as AspectRatio) : useSettingsStore.getState().defaultAspectRatio as AspectRatio
  )
  const [customRatio, setCustomRatio] = useState<string>('4:3')
  const [resolution, setResolution] = useState<Resolution>(useSettingsStore.getState().defaultResolution as Resolution)
  const [imageCount, setImageCount] = useState(useSettingsStore.getState().defaultImageCount)
  const [selectedModels, setSelectedModels] = useState<string[]>(() => {
    const fallback = thumbnailMode
      ? DEFAULT_THUMBNAIL_MODEL
      : logoMode
        ? DEFAULT_LOGO_MODEL
        : useSettingsStore.getState().defaultModel || DEFAULT_MODEL
    const requested = (initialModels ?? [fallback]).map(normalizeModelId)
    if (thumbnailMode) {
      // A model that cannot do 2K has no place here — fall back rather than fail.
      const usable = requested.filter(isThumbnailModel)
      return usable.length > 0 ? usable : [DEFAULT_THUMBNAIL_MODEL]
    }
    if (logoMode) {
      // Without a `background` field there is no transparency, and without
      // transparency there is no logo mode.
      const usable = requested.filter(isLogoModel)
      return usable.length > 0 ? usable : [DEFAULT_LOGO_MODEL]
    }
    return requested
  })
  const [thumbnailStyle, setThumbnailStyle] = useState<ThumbnailStyle>('auto')
  const [logoStyle, setLogoStyle] = useState<LogoStyle>('auto')
  const [background, setBackground] = useState<FalBackground>(
    logoMode ? LOGO_BACKGROUND : 'auto'
  )
  const [inputFidelity, setInputFidelity] = useState<FalInputFidelity>('high')
  const [isDragOver, setIsDragOver] = useState(false)
  const [quality, setQuality] = useState<GptImageQuality>('high')
  const [seed, setSeed] = useState<number | undefined>(undefined)

  const {
    editorRef,
    fileInputRef,
    imageRefs,
    collectionRefs,
    setCollectionRefs,
    collections,
    addImageRef,
    removeImageRef,
    removeCollectionRef,
    clearRefs,
    insertChipAtCursor,
    insertCollectionChipAtCursor,
    getPromptText,
    promptText,
    syncPromptText,
    setDraftContent,
    buildAttachments,
    mentionItems,
    showMentionPopup,
    handleMentionKeyDown,
    handleEditorInput,
    handleFileSelect,
    handleImageDrop,
  } = useMentionEditor()

  const dragCountRef = useRef(0)

  // ── Collapse ──────────────────────────────────────────────────────
  // The bar shrinks to a single summary row when the focus is elsewhere and
  // expands on click — the gallery gets its height back between prompts. The
  // editor stays mounted throughout (its text lives in the DOM), only hidden
  // behind an animated 0fr grid row.
  const [expanded, setExpanded] = useState(true)
  const cardWrapRef = useRef<HTMLDivElement>(null)

  const expandAndFocus = useCallback(() => {
    setExpanded(true)
    requestAnimationFrame(() => editorRef.current?.focus())
  }, [editorRef])

  useEffect(() => {
    if (inpaintContext || canvasContext) return
    const onPointerDown = (e: PointerEvent) => {
      if (!cardWrapRef.current) return
      if (!cardWrapRef.current.contains(e.target as Node)) setExpanded(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [inpaintContext, canvasContext])

  // Popovers escape the card upwards — the content wrapper may only clip
  // while the collapse animation runs, never in the resting expanded state.
  const [contentOverflow, setContentOverflow] = useState<'hidden' | 'visible'>('visible')
  const collapsedNow = !expanded && !inpaintContext && !canvasContext && !isDragOver
  useEffect(() => {
    if (collapsedNow) {
      setContentOverflow('hidden')
      return
    }
    // transitionend restores this sooner; the timer covers reduced motion,
    // where the transition (and its event) never happens.
    const t = setTimeout(() => setContentOverflow('visible'), 400)
    return () => clearTimeout(t)
  }, [collapsedNow])

  const { generate } = useImageGeneration()
  const falApiKey = useSettingsStore((s) => s.falApiKey)
  const hydrated = useSettingsStore((s) => s.hydrated)
  const defaultsHydrated = useRef(useSettingsStore.getState().hydrated)
  useEffect(() => {
    if (!hydrated || defaultsHydrated.current) return
    defaultsHydrated.current = true
    const settings = useSettingsStore.getState()
    setImageCount(settings.defaultImageCount)
    if (!thumbnailMode && !logoMode) {
      setAspectRatio(settings.defaultAspectRatio as AspectRatio)
      setResolution(settings.defaultResolution as Resolution)
      if (!initialModels?.length) setSelectedModels([normalizeModelId(settings.defaultModel)])
    }
  }, [hydrated, thumbnailMode, logoMode, initialModels])
  const presets = usePresetsStore((s) => s.presets)
  // The active preset lives in its store — the selector writes it there, and
  // reading it here is what actually applies the suffix on submit.
  const activePresetId = usePresetsStore((s) => s.activePresetId)
  const activeProjectId = useThumbnailProjectsStore((s) => s.activeProjectId)
  const projects = useThumbnailProjectsStore((s) => s.projects)
  const activeProject = thumbnailMode && activeProjectId
    ? projects.find((p) => p.id === activeProjectId) ?? null
    : null

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

      clearRefs()

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
        // A collection mentioned twice in the reused prompt still gets ONE ref
        // \u2014 both chips point at it, mirroring the live editor's dedupe.
        const reusedRefs = new Map<string, CollectionRef>()

        while ((match = allMentionRegex.exec(reuse.prompt)) !== null) {
          const textBefore = reuse.prompt.substring(lastIndex, match.index)
          if (textBefore) html += textBefore.replace(/\n/g, '<br>')

          if (match[1]) {
            const col = collections.find((c) => c.name === match![1])
            if (col) {
              let cRef = reusedRefs.get(col.id)
              if (!cRef) {
                cRef = {
                  id: crypto.randomUUID(),
                  collectionId: col.id,
                  name: col.name,
                  thumbnail: col.images[0] || '',
                  images: col.images,
                }
                reusedRefs.set(col.id, cRef)
                setCollectionRefs((prev) => [...prev, cRef!])
              }
              html += `<span contenteditable="false" data-collection-ref-id="${cRef.id}" class="inline-flex items-center gap-1 align-middle mx-0.5 px-1.5 py-0.5 rounded-md bg-accent-dim border border-accent-main/30 text-[12px] font-medium text-text-primary cursor-default select-none">${collectionChipThumbnail(cRef.thumbnail)}<span class="align-middle">@${col.name}</span></span>\u00A0`
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
        syncPromptText()

        const range = document.createRange()
        range.selectNodeContents(editorRef.current)
        range.collapse(false)
        const sel = window.getSelection()
        sel?.removeAllRanges()
        sel?.addRange(range)
      }

      // Restore negative prompt and seed if available
      if (reuse.seed != null) {
        setSeed(reuse.seed)
      }

      if (reuse.attachmentFilePaths && reuse.attachmentFilePaths.length > 0) {
        const individualPaths = reuse.attachmentFilePaths.slice(0, individualImageCount)
        ;(async () => {
          for (const fp of individualPaths) {
            try {
              const result = await window.api.readImage(fp)
              if (result.success && result.base64DataUrl) {
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
  }, [pendingReuse, consumePendingReuse, addImageRef, collections, clearRefs, setCollectionRefs, syncPromptText])

  // ── Submit ────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    const text = getPromptText()
    if (!text || !falApiKey) return

    const { attachments, labeledAttachments } = await buildAttachments()

    // Inject inpaint context if present
    if (inpaintContext) {
      const overlayBase64 = inpaintContext.getOverlayBase64()
      if (!overlayBase64) return // no mask drawn

      try {
        const readResult = await window.api.readImage(inpaintContext.filePath)
        if (!readResult.success || !readResult.base64DataUrl) return

        const groups = await prepareInpaintReferences(readResult.base64DataUrl, overlayBase64)
        attachments.unshift(...groups.flatMap((group) => group.images))
        labeledAttachments.unshift(...groups)
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
        const preparedSketch = await prepareCanvasSketch(canvasBase64)
        const compressedCanvas = preparedSketch.compressedCanvas
        canvasSketchPath = preparedSketch.canvasSketchPath

        attachments.unshift(compressedCanvas)
        labeledAttachments.unshift(
          { label: CANVAS_SKETCH_REFERENCE_LABEL, images: [compressedCanvas] },
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
      apiPromptText = buildInpaintPrompt(finalPrompt, inpaintContext.sourcePrompt, hasUserRefs)
    }

    // Build separate API prompt for canvas mode
    if (canvasContext) {
      const hasUserRefs = imageRefs.length > 0 || collectionRefs.length > 0
      apiPromptText = buildCanvasPrompt(finalPrompt, hasUserRefs)
    }

    const resolvedAspectRatio = aspectRatio === 'custom' ? customRatio : aspectRatio

    // Thumbnail mode adds the rules the user should not have to retype, and
    // pins the format YouTube needs.
    const project = thumbnailMode ? useThumbnailProjectsStore.getState().getActiveProject() : null
    const hasRefs = imageRefs.length > 0 || collectionRefs.length > 0
    const thumbnailSystemPrompt = thumbnailMode
      ? buildThumbnailSystemPrompt({
          style: thumbnailStyle,
          // Rides along automatically — identity preservation whenever references exist.
          faceFidelity: hasRefs,
          videoTitle: project?.title,
          videoAngle: project?.angle,
          customMetaPrompt: useThumbnailMetaPromptsStore.getState().getActiveText(),
        })
      : undefined

    // Logo mode does the same for its own rules, and pins the two fields that
    // make an actual logo file: a transparent background and a PNG to hold it.
    const logoSystemPrompt = logoMode
      ? buildLogoSystemPrompt({
          style: logoStyle,
          transparent: background === 'transparent',
          hasReferences: hasRefs,
        })
      : undefined

    const jobIds = generate({
      prompt: inpaintContext ? `Inpaint: ${text}` : canvasContext ? `Canvas: ${text}` : finalPrompt,
      apiPrompt: apiPromptText || undefined,
      aspectRatio: thumbnailMode ? THUMBNAIL_ASPECT_RATIO : resolvedAspectRatio,
      resolution: thumbnailMode ? THUMBNAIL_RESOLUTION : logoMode ? '1K' : resolution,
      imageCount,
      attachments: attachments.length > 0 ? attachments : undefined,
      labeledAttachments: labeledAttachments.length > 0 ? labeledAttachments : undefined,
      models: selectedModels,
      seed,
      quality,
      inpaintSourceId: inpaintContext?.imageId,
      canvasSketchPath,
      systemPrompt: thumbnailSystemPrompt ?? logoSystemPrompt,
      imageSize: thumbnailMode ? { ...THUMBNAIL_GPT_IMAGE_SIZE } : undefined,
      projectId: thumbnailMode ? (project?.id ?? undefined) : undefined,
      thumbnailStyle: thumbnailMode ? thumbnailStyle : undefined,
      faceFidelity: thumbnailMode ? hasRefs : undefined,
      background,
      // Transparency only survives in a format that has an alpha channel.
      outputFormat: logoMode || background === 'transparent' ? LOGO_OUTPUT_FORMAT : undefined,
      inputFidelity,
      isLogo: logoMode || undefined,
      logoStyle: logoMode ? logoStyle : undefined,
    })

    // Close inpaint modal after generating
    if (inpaintContext) {
      inpaintContext.onClose()
    }

    // Close canvas modal after generating
    if (canvasContext) {
      canvasContext.onClose()
    }
    return jobIds
  }, [getPromptText, falApiKey, buildAttachments, imageRefs, collectionRefs, generate, aspectRatio, customRatio, resolution, imageCount, selectedModels, quality, seed, activePresetId, presets, inpaintContext, canvasContext, thumbnailMode, thumbnailStyle, logoMode, logoStyle, background, inputFidelity])

  useLiveDraft({
    mode: inpaintContext ? 'inpaint' : canvasContext ? 'canvas' : thumbnailMode ? 'thumbnail' : logoMode ? 'logo' : 'image',
    read: () => {
      const project = thumbnailMode ? useThumbnailProjectsStore.getState().getActiveProject() : null
      const hasRefs = imageRefs.length > 0 || collectionRefs.length > 0
      const text = getPromptText()
      const preset = usePresetsStore.getState().presets.find(p => p.id === usePresetsStore.getState().activePresetId)
      return {
        mode: inpaintContext ? 'inpaint' : canvasContext ? 'canvas' : thumbnailMode ? 'thumbnail' : logoMode ? 'logo' : 'image',
        prompt: text, models: selectedModels, aspectRatio: thumbnailMode ? '16:9' : aspectRatio === 'custom' ? customRatio : aspectRatio,
        resolution: thumbnailMode ? '2K' : logoMode ? '1K' : resolution, imageCount, quality, seed: seed ?? null,
        background, inputFidelity, thumbnailStyle: thumbnailMode ? thumbnailStyle : undefined, logoStyle: logoMode ? logoStyle : undefined,
        references: imageRefs.map(ref => ({ id: ref.id, name: ref.name, mimeType: /^data:([^;]+)/.exec(ref.base64)?.[1] })),
        collections: collectionRefs.map(ref => ({ id: ref.id, collectionId: ref.collectionId, name: ref.name, imageCount: ref.images.length })),
        activePresetId: usePresetsStore.getState().activePresetId, finalPrompt: preset ? `${text}, ${preset.suffix}` : text,
        project, activeMetaPromptId: thumbnailMode ? useThumbnailMetaPromptsStore.getState().activeId : undefined,
        systemPrompt: thumbnailMode ? buildThumbnailSystemPrompt({ style: thumbnailStyle, faceFidelity: hasRefs, videoTitle: project?.title, videoAngle: project?.angle, customMetaPrompt: useThumbnailMetaPromptsStore.getState().getActiveText() })
          : logoMode ? buildLogoSystemPrompt({ style: logoStyle, transparent: background === 'transparent', hasReferences: hasRefs }) : undefined,
        capabilities: getCombinedCapabilities(selectedModels),
        ready: !!text && !!useSettingsStore.getState().falApiKey,
        inpaintSourceId: inpaintContext?.imageId,
        contextRequirement: inpaintContext ? 'Draw a mask before submitting' : canvasContext ? 'Canvas must contain a sketch' : undefined,
      }
    },
    update: async patch => {
      const common = ['prompt', 'models', 'imageCount', 'references', 'collectionIds'] as const
      rejectDraftFields(patch, thumbnailMode ? [...common, 'thumbnailStyle'] : logoMode ? [...common, 'logoStyle', 'aspectRatio', 'background', 'inputFidelity', 'quality'] : [...common, 'aspectRatio', 'resolution', 'quality', 'seed', 'clearSeed', 'background', 'inputFidelity'])
      const models = patch.models ?? selectedModels
      if (new Set(models).size !== models.length) throw new Error('Select each model only once')
      if (thumbnailMode && models.some(id => !isThumbnailModel(id))) throw new Error('This model is unavailable in thumbnail mode')
      if (logoMode && models.some(id => !isLogoModel(id))) throw new Error('This model is unavailable in logo mode')
      const caps = getCombinedCapabilities(models)
      if (patch.imageCount !== undefined && patch.imageCount > caps.maxImagesPerRequest) throw new Error(`Selected models allow at most ${caps.maxImagesPerRequest} images per request`)
      if (logoMode && patch.aspectRatio !== undefined && !LOGO_ASPECT_RATIOS.includes(patch.aspectRatio as typeof LOGO_ASPECT_RATIOS[number])) throw new Error(`Logo ratio must be one of ${LOGO_ASPECT_RATIOS.join(', ')}`)
      if (patch.resolution !== undefined && !caps.resolutions.includes(patch.resolution as Resolution)) throw new Error(`Resolution must be one of ${caps.resolutions.join(', ')}`)
      if (patch.quality !== undefined && !caps.qualities?.includes(patch.quality)) throw new Error('Quality control is unavailable for the selected models or this quality is unsupported')
      if (patch.seed !== undefined && !caps.supportsSeed) throw new Error('Selected models do not support a seed')
      if (patch.seed !== undefined && patch.clearSeed) throw new Error('Specify seed or clearSeed, not both')
      if (patch.background !== undefined && !caps.supportsBackground) throw new Error('Selected models do not support background control')
      if (patch.inputFidelity !== undefined && !caps.supportsInputFidelity) throw new Error('Selected models do not support input fidelity')
      // Resolve every reference before changing any UI state.
      const nextImages = patch.references === undefined ? undefined : await Promise.all(patch.references.map(async (source, index) => ({ id: crypto.randomUUID(), name: `Image ${index + 1}`, base64: await compressImage(await resolveDraftReference(source)) })))
      const nextCollections = patch.collectionIds === undefined ? undefined : [...new Set(patch.collectionIds)].map(id => {
        const collection = collections.find(c => c.id === id)
        if (!collection) throw new Error(`Collection not found: ${id}`)
        return { id: crypto.randomUUID(), collectionId: id, name: collection.name, thumbnail: collection.images[0] || '', images: collection.images }
      })
      if (patch.prompt !== undefined || nextImages || nextCollections) setDraftContent({ prompt: patch.prompt, images: nextImages, collections: nextCollections })
      if (patch.models) setSelectedModels(patch.models)
      if (patch.aspectRatio !== undefined) {
        if (patch.aspectRatio === 'auto' || caps.aspectRatios.includes(patch.aspectRatio as never) || logoMode) setAspectRatio(patch.aspectRatio as AspectRatio)
        else { setAspectRatio('custom'); setCustomRatio(patch.aspectRatio) }
      }
      if (patch.resolution !== undefined) setResolution(patch.resolution as Resolution)
      if (patch.imageCount !== undefined) setImageCount(patch.imageCount)
      if (patch.quality !== undefined) setQuality(patch.quality)
      if (patch.seed !== undefined || patch.clearSeed) setSeed(patch.clearSeed ? undefined : patch.seed)
      if (patch.thumbnailStyle !== undefined) setThumbnailStyle(patch.thumbnailStyle)
      if (patch.logoStyle !== undefined) setLogoStyle(patch.logoStyle)
      if (patch.background !== undefined) setBackground(patch.background)
      if (patch.inputFidelity !== undefined) setInputFidelity(patch.inputFidelity)
      setExpanded(true)
    },
    submit: handleSubmit,
    readReference: id => imageRefs.find(ref => ref.id === id)?.base64,
  })

  // ── Editor keyboard handling ──────────────────────────────────────

  const handleEditorKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSubmit()
      return
    }
    if (handleMentionKeyDown(e)) return
    if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault()
      document.execCommand('insertLineBreak')
    }
  }, [handleSubmit, handleMentionKeyDown])

  // ── Drag & drop ───────────────────────────────────────────────────

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy' }, [])
  const handleDragEnter = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); dragCountRef.current++; setIsDragOver(true) }, [])
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); dragCountRef.current--; if (dragCountRef.current === 0) setIsDragOver(false) }, [])
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    dragCountRef.current = 0
    await handleImageDrop(e)
  }, [handleImageDrop])

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
    clearRefs()
    setSeed(undefined)
  }, [clearRefs])

  // ── Render ────────────────────────────────────────────────────────

  const hasContent = promptText || imageRefs.length > 0 || collectionRefs.length > 0
  const canSend = !!promptText && !!falApiKey
  const resolvedRatio = aspectRatio === 'custom' ? customRatio : aspectRatio

  // Warn when references exceed the strictest selected model's limit — they are
  // collaged rather than dropped, but it changes how the model sees them.
  const totalRefImages =
    imageRefs.length + collectionRefs.reduce((sum, c) => sum + c.images.length, 0)
  const refLimit = getCombinedCapabilities(selectedModels).minReferenceLimit
  const willCollage = totalRefImages > refLimit
  const isInpaintMode = !!inpaintContext
  const isCanvasMode = !!canvasContext
  const isEmbeddedMode = isInpaintMode || isCanvasMode

  // Embedded modes (inpaint, canvas) live in a modal and never collapse; a
  // drag keeps the bar open so the drop targets stay visible.
  const showExpanded = expanded || isEmbeddedMode || isDragOver

  const editorPlaceholder = isInpaintMode
    ? 'Describe what should appear in the masked area...'
    : isCanvasMode
      ? 'Describe what to generate from your sketch...'
      : thumbnailMode
        ? 'Die eine Idee: Motiv, Emotion, Situation…'
        : logoMode
          ? 'Die Marke und die eine Form: „Kaffeerösterei, Bohne als Sonne…"'
          : 'Describe your image...'

  const collapsedSummary = [
    selectedModels.length > 1 ? `${selectedModels.length} Models` : getModelName(selectedModels[0]),
    thumbnailMode ? '16:9' : logoMode ? null : resolvedRatio,
    `${imageCount}×`,
    totalRefImages > 0 ? `${totalRefImages} Ref${totalRefImages === 1 ? '' : 's'}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className={cn("shrink-0 flex flex-col items-center", isEmbeddedMode ? "px-6 pb-4 pt-3" : "px-6 pb-6 pt-3")}>
      <div ref={cardWrapRef} className="w-full max-w-[800px] relative">
        <div
          className={cn(
            'prompt-card grain relative border rounded-2xl transition-all',
            isDragOver ? 'border-accent-main/60 glow-accent-strong' : 'border-border-base',
            !showExpanded && 'cursor-text hover:border-border-bright'
          )}
          onClick={!showExpanded ? expandAndFocus : undefined}
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

          {/* Collapsed summary row — crossfades with the full content below. */}
          {!isEmbeddedMode && (
            <div
              className="collapse-seg"
              style={{ gridTemplateRows: showExpanded ? '0fr' : '1fr', opacity: showExpanded ? 0 : 1 }}
              aria-hidden={showExpanded}
            >
              <div>
                <div className="flex items-center gap-3 pl-4 pr-2.5 h-[52px]">
                  <span
                    className={cn(
                      'flex-1 min-w-0 truncate text-[13.5px]',
                      promptText ? 'text-text-primary' : 'text-text-muted'
                    )}
                  >
                    {promptText || editorPlaceholder}
                  </span>
                  <span className="shrink-0 text-[11px] text-text-muted whitespace-nowrap">
                    {collapsedSummary}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleSubmit()
                    }}
                    disabled={!canSend}
                    tabIndex={showExpanded ? -1 : 0}
                    className={cn(
                      'no-drag btn-interactive shrink-0 w-8 h-8 rounded-[10px] flex items-center justify-center transition-all',
                      canSend
                        ? 'bg-accent-main hover:bg-accent-bright text-white glow-accent'
                        : 'bg-surface-3 text-text-muted cursor-not-allowed'
                    )}
                    title="Generate"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Full content — stays mounted while collapsed (the editor's text
              lives in the DOM), hidden behind an animated 0fr grid row. */}
          <div
            className="collapse-seg"
            style={{ gridTemplateRows: showExpanded ? '1fr' : '0fr', opacity: showExpanded ? 1 : 0 }}
            aria-hidden={!showExpanded}
            onTransitionEnd={() => {
              if (showExpanded) setContentOverflow('visible')
            }}
          >
            <div style={{ overflow: contentOverflow }}>

          {/* What comes out of here, stated once so the format is never a surprise. */}
          {logoMode && (
            <div className="flex items-center gap-2 px-4 pt-2.5 -mb-1">
              <div className="w-1.5 h-1.5 rounded-full shrink-0 bg-accent-main" />
              <span className="text-[11px] text-text-secondary">
                {background === 'transparent'
                  ? 'Transparentes PNG'
                  : background === 'opaque'
                    ? 'PNG mit deckendem Hintergrund'
                    : 'PNG, Hintergrund entscheidet das Modell'}
              </span>
              <span className="text-[10px] text-text-muted/70 shrink-0">
                {background === 'transparent'
                  ? '— wird ohne JPEG-Kompression gespeichert, Alphakanal bleibt erhalten'
                  : '— nur „Transparent" liefert einen Alphakanal'}
              </span>
            </div>
          )}

          {/* Which video are we working on? */}
          {thumbnailMode && (
            <div className="flex items-center gap-2 px-4 pt-2.5 -mb-1">
              {activeProject ? (
                <>
                  <div
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: activeProject.color }}
                  />
                  <span className="text-[11px] text-text-secondary truncate">{activeProject.title}</span>
                  <span className="text-[10px] text-text-muted/70 shrink-0">
                    — Titel geht als Kontext mit, der Bildtext wiederholt ihn nicht
                  </span>
                </>
              ) : (
                <span className="text-[11px] text-text-muted/70">
                  Kein Video gewählt — landet unter „Alle Thumbnails"
                </span>
              )}
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
              data-placeholder={editorPlaceholder}
              className="prompt-editor flex-1 min-h-[44px] max-h-[140px] overflow-y-auto text-[14px] text-text-primary leading-relaxed outline-none pt-1"
            />
          </div>


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
          {logoMode ? (
            <LogoControls
              selectedModels={selectedModels}
              onModelsChange={setSelectedModels}
              style={logoStyle}
              onStyleChange={setLogoStyle}
              aspectRatio={resolvedRatio}
              onAspectRatioChange={(r) => setAspectRatio(r as AspectRatio)}
              background={background}
              onBackgroundChange={setBackground}
              inputFidelity={inputFidelity}
              onInputFidelityChange={setInputFidelity}
              hasReferences={imageRefs.length > 0 || collectionRefs.length > 0}
              quality={quality}
              onQualityChange={setQuality}
              imageCount={imageCount}
              onImageCountChange={setImageCount}
              canSend={canSend}
              hasContent={!!hasContent}
              onSubmit={handleSubmit}
              onClear={clearPrompt}
              onSettingsClick={onSettingsClick}
              onCollectionsClick={onCollectionsClick}
              onQueueClick={onQueueClick}
            />
          ) : thumbnailMode ? (
            <ThumbnailControls
              selectedModels={selectedModels}
              onModelsChange={setSelectedModels}
              style={thumbnailStyle}
              onStyleChange={setThumbnailStyle}
              imageCount={imageCount}
              onImageCountChange={setImageCount}
              canSend={canSend}
              hasContent={!!hasContent}
              onSubmit={handleSubmit}
              onClear={clearPrompt}
              onSettingsClick={onSettingsClick}
              onCollectionsClick={onCollectionsClick}
              onQueueClick={onQueueClick}
            />
          ) : (
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
            quality={quality}
            onQualityChange={setQuality}
            background={background}
            onBackgroundChange={setBackground}
            inputFidelity={inputFidelity}
            onInputFidelityChange={setInputFidelity}
            hasReferences={imageRefs.length > 0 || collectionRefs.length > 0}
            seed={seed}
            onSeedChange={setSeed}
            onPresetsManage={isEmbeddedMode ? undefined : onPresetsManage}
            onQueueClick={isEmbeddedMode ? undefined : onQueueClick}
            onCanvasClick={isEmbeddedMode ? undefined : onCanvasClick}
          />
          )}
            </div>
          </div>
        </div>

        {/* Hint - only show when not in embedded mode; fades out with the bar */}
        {!isEmbeddedMode && (
          <div
            className={cn(
              'flex justify-center mt-2.5 transition-opacity duration-200',
              !showExpanded && 'opacity-0 pointer-events-none'
            )}
          >
            <p className="text-[11px] text-text-muted/70">
              {hydrated && !falApiKey ? (
                <button onClick={onSettingsClick} className="text-danger/80 hover:text-danger transition-colors cursor-pointer">
                  fal.ai API key missing — click to open Settings
                </button>
              ) : (
                <>
                  <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-surface-2 text-text-muted border border-border-dim text-[10px] mr-0.5">&#x2318;</kbd>
                  <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-surface-2 text-text-muted border border-border-dim text-[10px] mx-0.5">&#x23CE;</kbd>
                  {'  ·  '}
                  <CostEstimate
                    models={selectedModels}
                    aspectRatio={thumbnailMode ? THUMBNAIL_ASPECT_RATIO : resolvedRatio}
                    resolution={thumbnailMode ? THUMBNAIL_RESOLUTION : resolution}
                    imageCount={imageCount}
                    quality={quality}
                    imageSize={thumbnailMode ? THUMBNAIL_GPT_IMAGE_SIZE : undefined}
                  />
                  {(imageRefs.length > 0 || collections.length > 0) && (
                    <>
                      {'  \u00B7  '}
                      <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-surface-2 text-text-muted border border-border-dim text-[10px] mx-0.5">@</kbd>
                      {' references'}
                    </>
                  )}
                  {willCollage && (
                    <>
                      {'  \u00B7  '}
                      <span className="text-accent-main/80">
                        {totalRefImages} references &gt; {refLimit} \u2014 extras are merged into numbered collages
                      </span>
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
