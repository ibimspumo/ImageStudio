import { useState, useRef, useCallback, useEffect } from 'react'
import { Plus, Send } from 'lucide-react'
import { useImageGeneration } from '../../hooks/useImageGeneration'
import { useMentionEditor } from '../../hooks/useMentionEditor'
import { useSettingsStore } from '../../stores/settings-store'
import { collectionMention, imageMention } from '../../../../shared/reference-mentions'
import type {
  AspectRatio,
  Resolution,
  GptImageQuality,
  ThumbnailStyle,
  LogoStyle,
  FalBackground,
  FalInputFidelity,
  OutputFormat,
} from '../../types/api'
import {
  DEFAULT_MODEL,
  DEFAULT_THUMBNAIL_MODEL,
  DEFAULT_LOGO_MODEL,
  getCombinedCapabilities,
  getModel,
  normalizeGptImageSize,
  toGptImageSize,
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
} from '../../types/api'
import { PrintControls } from '../print/PrintControls'
import { PRINT_FORMATS, PRINT_STYLES, DEFAULT_PRINT_FORMAT, DEFAULT_PRINT_STYLE, preparePrintFormat, buildPrintSystemPrompt, buildPrintArtworkPrompt, type PrintFormat, type PrintStyle } from '../../../../shared/print-prompt'
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

export interface CanvasContext {
  getCanvasBase64: () => string | null
  onClose: () => void
}

interface PromptBarProps {
  onSettingsClick?: () => void
  onCollectionsClick?: () => void
  onPresetsManage?: () => void
  onQueueClick?: () => void
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
  printMode?: boolean
  logoMode?: boolean
}

export function PromptBar({ onSettingsClick, onCollectionsClick, onPresetsManage, onQueueClick, canvasContext, initialModels, onCanvasClick, thumbnailMode, logoMode, printMode }: PromptBarProps = {}) {
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(
    thumbnailMode ? '16:9' : logoMode ? (LOGO_DEFAULT_ASPECT_RATIO as AspectRatio) : useSettingsStore.getState().defaultAspectRatio as AspectRatio
  )
  const [customRatio, setCustomRatio] = useState<string>('4:3')
  const [resolution, setResolution] = useState<Resolution>(logoMode ? '1K' : useSettingsStore.getState().defaultResolution as Resolution)
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
  const [printFormat, setPrintFormat] = useState<PrintFormat>(useSettingsStore.getState().defaultPrintFormat ?? DEFAULT_PRINT_FORMAT)
  const [printStyle, setPrintStyle] = useState<PrintStyle>(useSettingsStore.getState().defaultPrintStyle ?? DEFAULT_PRINT_STYLE)
  const [printMetaPrompt, setPrintMetaPrompt] = useState(useSettingsStore.getState().printPrompt ?? '')
  const [printSaveError, setPrintSaveError] = useState<string>()
  const pendingPrintSaves = useRef(0)
  const printSaveFailed = useRef(false)
  useEffect(() => {
    if (!printMode) return
    return useSettingsStore.subscribe((next, previous) => {
      if (pendingPrintSaves.current > 0) return
      if (next.defaultPrintFormat !== previous.defaultPrintFormat) setPrintFormat(next.defaultPrintFormat)
      if (next.defaultPrintStyle !== previous.defaultPrintStyle) setPrintStyle(next.defaultPrintStyle)
      if (next.printPrompt !== previous.printPrompt) setPrintMetaPrompt(next.printPrompt)
    })
  }, [printMode])
  const savePrintSetting = async (key: 'defaultPrintFormat' | 'defaultPrintStyle' | 'printPrompt', value: string) => {
    if (pendingPrintSaves.current === 0) printSaveFailed.current = false
    pendingPrintSaves.current++
    try { await useSettingsStore.getState().setSetting(key, value as never); setPrintSaveError(undefined) }
    catch (error) { printSaveFailed.current = true; setPrintSaveError(error instanceof Error ? error.message : 'Print-Einstellung konnte nicht gespeichert werden.') }
    finally {
      pendingPrintSaves.current--
      if (pendingPrintSaves.current === 0 && !printSaveFailed.current) {
        const latest = useSettingsStore.getState()
        setPrintFormat(latest.defaultPrintFormat); setPrintStyle(latest.defaultPrintStyle); setPrintMetaPrompt(latest.printPrompt)
      }
    }
  }
  const changePrintFormat = (value: PrintFormat) => { setPrintFormat(value); setSizeError(undefined); void savePrintSetting('defaultPrintFormat', value) }
  const changePrintStyle = (value: PrintStyle) => { setPrintStyle(value); void savePrintSetting('defaultPrintStyle', value) }
  const changePrintMetaPrompt = (value: string) => { setPrintMetaPrompt(value); void savePrintSetting('printPrompt', value) }
  const [logoStyle, setLogoStyle] = useState<LogoStyle>('auto')
  const [background, setBackground] = useState<FalBackground>(
    logoMode ? LOGO_BACKGROUND : 'auto'
  )
  const [inputFidelity, setInputFidelity] = useState<FalInputFidelity>('high')
  const [isDragOver, setIsDragOver] = useState(false)
  const [quality, setQuality] = useState<GptImageQuality>('high')
  const [seed, setSeed] = useState<number | undefined>(undefined)
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | undefined>()
  const [sizeError, setSizeError] = useState<string | undefined>()
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('png')
  const [outputCompression, setOutputCompression] = useState<number | undefined>()
  const changeFormat = (format: OutputFormat) => {
    setOutputFormat(format)
    if (format === 'png') setOutputCompression(undefined)
    if (format === 'jpeg' && background === 'transparent') setBackground('opaque')
  }
  const changeBackground = (value: FalBackground) => {
    setBackground(value)
    if (value === 'transparent' && outputFormat === 'jpeg') changeFormat('png')
  }
  const changeModels = (models: string[]) => {
    const caps = getCombinedCapabilities(models)
    setSelectedModels(models)
    setImageCount(count => Math.min(count, caps.maxImagesPerRequest))
    if (!caps.supportsCustomImageSize) { setImageSize(undefined); setSizeError(undefined) }
    if (!caps.supportsOutputCompression) setOutputCompression(undefined)
    if (!caps.supportsBackground) setBackground('auto')
    if (!caps.qualities?.includes(quality)) setQuality('high')
    if (!caps.supportsSeed) setSeed(undefined)
  }

  const printOutput = printMode ? preparePrintFormat(printFormat, selectedModels, { aspectRatio: aspectRatio === 'custom' ? customRatio : aspectRatio, resolution, imageSize }) : undefined

  const {
    editorRef,
    fileInputRef,
    imageRefs,
    collectionRefs,
    collections,
    addImageRef,
    removeImageRef,
    removeCollectionRef,
    clearRefs,
    insertChipAtCursor,
    insertCollectionChipAtCursor,
    getPromptText,
    promptText,
    setDraftContent,
    buildAttachments,
    mentionItems,
    showMentionPopup,
    handleMentionKeyDown,
    handleEditorInput,
    handleEditorPaste,
    handleFileSelect,
    handleImageDrop,
  } = useMentionEditor()

  const dragCountRef = useRef(0)

  const { generate } = useImageGeneration()
  const falApiKey = useSettingsStore((s) => s.falApiKey)
  const hydrated = useSettingsStore((s) => s.hydrated)
  const defaultsHydrated = useRef(useSettingsStore.getState().hydrated)
  useEffect(() => {
    if (!hydrated || defaultsHydrated.current) return
    defaultsHydrated.current = true
    const settings = useSettingsStore.getState()
    setImageCount(settings.defaultImageCount)
    if (printMode) { setPrintFormat(settings.defaultPrintFormat); setPrintStyle(settings.defaultPrintStyle); setPrintMetaPrompt(settings.printPrompt) }
    if (!thumbnailMode && !logoMode) {
      setAspectRatio(settings.defaultAspectRatio as AspectRatio)
      setResolution(settings.defaultResolution as Resolution)
      if (!initialModels?.length) setSelectedModels([normalizeModelId(settings.defaultModel)])
    }
  }, [hydrated, thumbnailMode, logoMode, printMode, initialModels])
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

  const [referenceLoading, setReferenceLoading] = useState(false)
  const [referenceError, setReferenceError] = useState<string | null>(null)
  const referenceLoadVersion = useRef(0)
  const lastReuseRef = useRef<typeof pendingReuse>(null)

  useEffect(() => {
    if (!pendingReuse) return
    const reuse = consumePendingReuse()
    if (!reuse) return
    lastReuseRef.current = reuse
    if (printMode && reuse.isPrint) {
      setPrintFormat(reuse.printFormat ?? DEFAULT_PRINT_FORMAT); setPrintStyle(reuse.printStyle ?? DEFAULT_PRINT_STYLE); setPrintMetaPrompt(reuse.printMetaPrompt ?? '')
    }
    const version = ++referenceLoadVersion.current
    setReferenceError(null)
    setReferenceLoading(true)
    // Show the incoming prompt immediately, but never submit before its source loads.
    setDraftContent({ prompt: reuse.prompt, images: [], collections: [] })
    if (!thumbnailMode && !logoMode) {
      const model = normalizeModelId(reuse.model)
      const config = getModel(model)
      const caps = getCombinedCapabilities([model])
      setSelectedModels([model])
      setImageCount(count => Math.min(count, caps.maxImagesPerRequest))
      setResolution(reuse.resolution && caps.resolutions.includes(reuse.resolution as Resolution)
        ? reuse.resolution as Resolution : config.defaultResolution ?? caps.resolutions[0] ?? '1K')
      setBackground(caps.supportsBackground ? reuse.background ?? 'auto' : 'auto')
      setQuality(config.qualities?.includes(reuse.quality as GptImageQuality) ? reuse.quality as GptImageQuality : config.defaultQuality ?? 'high')
      setImageSize(caps.supportsCustomImageSize ? reuse.imageSize : undefined)
      setSizeError(undefined)
      setOutputFormat(reuse.outputFormat ?? 'png')
      setOutputCompression(caps.supportsOutputCompression ? reuse.outputCompression : undefined)
      setSeed(caps.supportsSeed ? reuse.seed : undefined)
      if (reuse.aspectRatio === 'auto' || caps.aspectRatios.includes(reuse.aspectRatio as never)) {
        setAspectRatio(reuse.aspectRatio as AspectRatio)
      } else if (reuse.aspectRatio && /^[1-9]\d*:[1-9]\d*$/.test(reuse.aspectRatio)) {
        setAspectRatio('custom')
        setCustomRatio(reuse.aspectRatio)
      } else {
        setAspectRatio(config.defaultAspectRatio ?? caps.aspectRatios[0] ?? '1:1')
      }
    }
    const imageNames = [...new Set([...reuse.prompt.matchAll(/\[([^@\]][^\]]*)\]/g)].map(match => match[1]))]
    const collectionNames = [...new Set([...reuse.prompt.matchAll(/\[@([^\]]+)\]/g)].map(match => match[1]))]
    const nextCollections: CollectionRef[] = collectionNames.flatMap(name => {
      const collection = collections.find(item => item.name === name)
      return collection ? [{ id: crypto.randomUUID(), collectionId: collection.id, name: collection.name,
        thumbnail: collection.images[0] || '', images: collection.images }] : []
    })
    const paths = (reuse.attachmentFilePaths ?? []).slice(0, imageNames.length)
    void (async () => {
      try {
        const images = await Promise.all(paths.map(async (path, index) => {
          const result = await window.api.readImage(path)
          if (!result.success || !result.base64DataUrl) throw new Error(`Referenz „${imageNames[index]}“ konnte nicht geladen werden.`)
          return { id: crypto.randomUUID(), name: imageNames[index], base64: await compressImage(result.base64DataUrl, 1000, 0.75, reuse.background === 'transparent' ? 'png' : 'jpeg') }
        }))
        if (referenceLoadVersion.current !== version) return
        setDraftContent({ prompt: reuse.prompt, images, collections: nextCollections })
        setReferenceLoading(false)
      } catch (error) {
        if (referenceLoadVersion.current !== version) return
        logger.error('PromptBar', 'Failed to load reuse attachment', error)
        setReferenceError('Das Ausgangsbild konnte nicht geladen werden. Prüfe, ob die Datei noch verfügbar ist, und versuche es erneut.')
        setReferenceLoading(false)
      }
    })()
  }, [pendingReuse, consumePendingReuse, collections, setDraftContent, thumbnailMode, logoMode, printMode])

  // ── Submit ────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    const text = getPromptText()
    if (!text || !falApiKey || referenceLoading || referenceError) return
    if (sizeError) throw new Error(sizeError)

    const { attachments, labeledAttachments } = await buildAttachments()

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

    let apiPromptText: string | undefined

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
      prompt: canvasContext ? `Canvas: ${text}` : finalPrompt,
      apiPrompt: apiPromptText || undefined,
      aspectRatio: printOutput?.aspectRatio ?? (thumbnailMode ? THUMBNAIL_ASPECT_RATIO : resolvedAspectRatio),
      resolution: printOutput?.resolution ?? (thumbnailMode ? THUMBNAIL_RESOLUTION : resolution),
      imageCount,
      attachments: attachments.length > 0 ? attachments : undefined,
      labeledAttachments: labeledAttachments.length > 0 ? labeledAttachments : undefined,
      models: selectedModels,
      seed,
      quality,
      canvasSketchPath,
      systemPrompt: printMode ? buildPrintSystemPrompt({ format: printFormat, style: printStyle, hasReferences: hasRefs, customMetaPrompt: printMetaPrompt }) : thumbnailSystemPrompt ?? logoSystemPrompt,
      imageSize: printOutput ? printOutput.imageSize : thumbnailMode ? { ...THUMBNAIL_GPT_IMAGE_SIZE } : imageSize,
      projectId: thumbnailMode ? (project?.id ?? undefined) : undefined,
      thumbnailStyle: thumbnailMode ? thumbnailStyle : undefined,
      faceFidelity: thumbnailMode ? hasRefs : undefined,
      background,
      // Transparency only survives in a format that has an alpha channel.
      outputFormat: logoMode ? LOGO_OUTPUT_FORMAT : outputFormat,
      outputCompression: logoMode ? undefined : outputCompression,
      inputFidelity,
      isPrint: printMode || undefined,
      printFormat: printMode ? printFormat : undefined,
      printStyle: printMode ? printStyle : undefined,
      printMetaPrompt: printMode ? printMetaPrompt : undefined,
      isLogo: logoMode || undefined,
      logoStyle: logoMode ? logoStyle : undefined,
    })

    // Close canvas modal after generating
    if (canvasContext) {
      canvasContext.onClose()
    }
    return jobIds
  }, [getPromptText, falApiKey, referenceLoading, referenceError, buildAttachments, imageRefs, collectionRefs, generate, aspectRatio, customRatio, resolution, imageCount, selectedModels, quality, seed, activePresetId, presets, canvasContext, thumbnailMode, thumbnailStyle, logoMode, logoStyle, background, inputFidelity, imageSize, sizeError, outputFormat, outputCompression, printMode, printFormat, printStyle, printMetaPrompt, printOutput])

  useLiveDraft({
    mode: canvasContext ? 'canvas' : thumbnailMode ? 'thumbnail' : logoMode ? 'logo' : printMode ? 'print' : 'image',
    read: () => {
      const project = thumbnailMode ? useThumbnailProjectsStore.getState().getActiveProject() : null
      const hasRefs = imageRefs.length > 0 || collectionRefs.length > 0
      const text = getPromptText()
      const preset = usePresetsStore.getState().presets.find(p => p.id === usePresetsStore.getState().activePresetId)
      return {
        mode: canvasContext ? 'canvas' : thumbnailMode ? 'thumbnail' : logoMode ? 'logo' : printMode ? 'print' : 'image',
        prompt: text, models: selectedModels, aspectRatio: printOutput?.aspectRatio ?? (thumbnailMode ? '16:9' : aspectRatio === 'custom' ? customRatio : aspectRatio),
        resolution: printOutput?.resolution ?? (thumbnailMode ? '2K' : resolution), imageCount, quality, seed: seed ?? null,
        imageSize: printOutput ? printOutput.imageSize ?? null : thumbnailMode ? THUMBNAIL_GPT_IMAGE_SIZE : imageSize ?? null,
        printFormat: printMode ? printFormat : undefined, printStyle: printMode ? printStyle : undefined, printMetaPrompt: printMode ? printMetaPrompt : undefined,
        resolvedImageSize: printOutput?.imageSize ?? (selectedModels.every(id => getModel(id).imageSizeMode === 'pixels') ? thumbnailMode ? THUMBNAIL_GPT_IMAGE_SIZE : imageSize ?? toGptImageSize(aspectRatio === 'custom' ? customRatio : aspectRatio, resolution) : null),
        outputFormat: logoMode ? 'png' : outputFormat, outputCompression: outputCompression ?? null, sizeError: sizeError ?? null,
        background, thumbnailStyle: thumbnailMode ? thumbnailStyle : undefined, logoStyle: logoMode ? logoStyle : undefined,
        references: imageRefs.map(ref => ({ id: ref.id, name: ref.name, promptReference: imageMention(ref.name), mimeType: /^data:([^;]+)/.exec(ref.base64)?.[1] })),
        collections: collectionRefs.map(ref => ({ id: ref.id, collectionId: ref.collectionId, name: ref.name, promptReference: collectionMention(ref.name), imageCount: ref.images.length })),
        activePresetId: usePresetsStore.getState().activePresetId, finalPrompt: preset ? `${text}, ${preset.suffix}` : text,
        apiPrompt: printMode ? buildPrintArtworkPrompt(preset ? `${text}, ${preset.suffix}` : text) : undefined,
        project, activeMetaPromptId: thumbnailMode ? useThumbnailMetaPromptsStore.getState().activeId : undefined,
        systemPrompt: thumbnailMode ? buildThumbnailSystemPrompt({ style: thumbnailStyle, faceFidelity: hasRefs, videoTitle: project?.title, videoAngle: project?.angle, customMetaPrompt: useThumbnailMetaPromptsStore.getState().getActiveText() })
          : logoMode ? buildLogoSystemPrompt({ style: logoStyle, transparent: background === 'transparent', hasReferences: hasRefs }) : printMode ? buildPrintSystemPrompt({ format: printFormat, style: printStyle, hasReferences: hasRefs, customMetaPrompt: printMetaPrompt }) : undefined,
        capabilities: getCombinedCapabilities(selectedModels),
        ready: !!text && !!useSettingsStore.getState().falApiKey && !referenceLoading && !referenceError && !sizeError,
        referenceLoadStatus: referenceLoading ? 'loading' : referenceError ? 'error' : 'ready',
        referenceError,
          contextRequirement: canvasContext ? 'Canvas must contain a sketch' : undefined,
      }
    },
    update: async patch => {
      const common = ['prompt', 'models', 'imageCount', 'references', 'collectionIds'] as const
      const formatFields = ['outputFormat', 'outputCompression', 'clearOutputCompression'] as const
      const sizeFields = ['imageSize', 'clearImageSize', 'aspectRatio', 'resolution'] as const
      rejectDraftFields(patch, thumbnailMode ? [...common, 'thumbnailStyle', 'quality', ...formatFields] : logoMode ? [...common, 'logoStyle', 'background', 'quality', ...sizeFields] : [...common, 'quality', 'seed', 'clearSeed', 'background', ...sizeFields, ...formatFields, ...(printMode ? ['printFormat', 'printStyle', 'printMetaPrompt'] as const : [])])
      if (patch.printFormat !== undefined && !PRINT_FORMATS.some(f => f.id === patch.printFormat)) throw new Error('Unknown print format')
      if (patch.printStyle !== undefined && !PRINT_STYLES.some(f => f.id === patch.printStyle)) throw new Error('Unknown print style')
      const models = patch.models ?? selectedModels
      if (new Set(models).size !== models.length) throw new Error('Select each model only once')
      if (thumbnailMode && models.some(id => !isThumbnailModel(id))) throw new Error('This model is unavailable in thumbnail mode')
      if (logoMode && models.some(id => !isLogoModel(id))) throw new Error('This model is unavailable in logo mode')
      const caps = getCombinedCapabilities(models)
      if (patch.imageCount !== undefined && patch.imageCount > caps.maxImagesPerRequest) throw new Error(`Selected models allow at most ${caps.maxImagesPerRequest} images per request`)
      if (patch.resolution !== undefined && !caps.resolutions.includes(patch.resolution as Resolution)) throw new Error(`Resolution must be one of ${caps.resolutions.join(', ')}`)
      if (patch.quality !== undefined && !caps.qualities?.includes(patch.quality)) throw new Error('Quality control is unavailable for the selected models or this quality is unsupported')
      if (patch.seed !== undefined && !caps.supportsSeed) throw new Error('Selected models do not support a seed')
      if (patch.seed !== undefined && patch.clearSeed) throw new Error('Specify seed or clearSeed, not both')
      if (patch.background !== undefined && !caps.supportsBackground) throw new Error('Selected models do not support background control')
      if (patch.inputFidelity !== undefined && !caps.supportsInputFidelity) throw new Error('Selected models do not support input fidelity')
      if (patch.imageSize && patch.clearImageSize) throw new Error('Specify imageSize or clearImageSize, not both')
      if (patch.imageSize && !caps.supportsCustomImageSize) throw new Error('Custom pixel sizes require pixel-capable models only')
      const nextSize = patch.clearImageSize || !caps.supportsCustomImageSize ? undefined : patch.imageSize ? normalizeGptImageSize(patch.imageSize) : imageSize
      const nextFormat = patch.outputFormat ?? outputFormat
      const nextBackground = patch.background ?? (caps.supportsBackground ? background : 'auto')
      if (nextFormat === 'jpeg' && nextBackground === 'transparent') throw new Error('JPEG cannot preserve transparency. Choose PNG or WebP.')
      if (patch.outputCompression !== undefined && patch.clearOutputCompression) throw new Error('Specify outputCompression or clearOutputCompression, not both')
      if (patch.outputCompression !== undefined && (!caps.supportsOutputCompression || !['jpeg', 'webp'].includes(nextFormat))) throw new Error('Compression requires a supported model and JPEG or WebP')
      // Resolve every reference before changing any UI state.
      const nextImages = patch.references === undefined ? undefined : await Promise.all(patch.references.map(async (source, index) => ({ id: crypto.randomUUID(), name: `Image ${index + 1}`, base64: await compressImage(await resolveDraftReference(source)) })))
      const nextCollections = patch.collectionIds === undefined ? undefined : [...new Set(patch.collectionIds)].map(id => {
        const collection = collections.find(c => c.id === id)
        if (!collection) throw new Error(`Collection not found: ${id}`)
        return { id: crypto.randomUUID(), collectionId: id, name: collection.name, thumbnail: collection.images[0] || '', images: collection.images }
      })
      if (nextImages) {
        referenceLoadVersion.current++
        setReferenceLoading(false)
        setReferenceError(null)
      }
      if (patch.prompt !== undefined || nextImages || nextCollections) setDraftContent({ prompt: patch.prompt, images: nextImages, collections: nextCollections })
      if (patch.models) changeModels(patch.models)
      if (patch.imageSize || patch.clearImageSize) { setImageSize(nextSize); setSizeError(undefined) }
      if (patch.outputFormat) setOutputFormat(nextFormat)
      if (patch.outputCompression !== undefined || patch.clearOutputCompression || nextFormat === 'png' || !caps.supportsOutputCompression) setOutputCompression(patch.clearOutputCompression || nextFormat === 'png' || !caps.supportsOutputCompression ? undefined : patch.outputCompression)
      if (patch.aspectRatio !== undefined) {
        if (patch.aspectRatio === 'auto' || caps.aspectRatios.includes(patch.aspectRatio as never)) setAspectRatio(patch.aspectRatio as AspectRatio)
        else { setAspectRatio('custom'); setCustomRatio(patch.aspectRatio) }
      }
      if (patch.resolution !== undefined) setResolution(patch.resolution as Resolution)
      if (patch.imageCount !== undefined) setImageCount(patch.imageCount)
      if (patch.quality !== undefined) setQuality(patch.quality)
      if (patch.seed !== undefined || patch.clearSeed) setSeed(patch.clearSeed ? undefined : patch.seed)
      if (patch.thumbnailStyle !== undefined) setThumbnailStyle(patch.thumbnailStyle)
      if (patch.printFormat !== undefined) { setPrintFormat(patch.printFormat); await useSettingsStore.getState().setSetting('defaultPrintFormat', patch.printFormat) }
      if (patch.printStyle !== undefined) { setPrintStyle(patch.printStyle); await useSettingsStore.getState().setSetting('defaultPrintStyle', patch.printStyle) }
      if (patch.printMetaPrompt !== undefined) { setPrintMetaPrompt(patch.printMetaPrompt); await useSettingsStore.getState().setSetting('printPrompt', patch.printMetaPrompt) }
      if (printMode && patch.printFormat === undefined && (patch.imageSize || patch.clearImageSize || patch.aspectRatio)) { setPrintFormat('custom'); await useSettingsStore.getState().setSetting('defaultPrintFormat', 'custom') }
      if (patch.logoStyle !== undefined) setLogoStyle(patch.logoStyle)
      if (patch.background !== undefined) setBackground(nextBackground)
      if (patch.inputFidelity !== undefined) setInputFidelity(patch.inputFidelity)
    },
    submit: () => {
      if (referenceLoading) throw new Error('Ausgangsbild wird noch geladen. Lies get_draft erneut, bis referenceLoadStatus ready meldet.')
      if (referenceError) throw new Error(`${referenceError} Mit update_draft.references kannst du die Referenz ersetzen.`)
      return handleSubmit()
    },
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
    referenceLoadVersion.current++
    setReferenceLoading(false)
    setReferenceError(null)
    lastReuseRef.current = null
    clearRefs()
    setSeed(undefined)
  }, [clearRefs])

  // ── Render ────────────────────────────────────────────────────────

  const hasContent = promptText || imageRefs.length > 0 || collectionRefs.length > 0
  const canSend = !!promptText && !!falApiKey && !referenceLoading && !referenceError && !sizeError
  const resolvedRatio = aspectRatio === 'custom' ? customRatio : aspectRatio

  // Warn when references exceed the strictest selected model's limit — they are
  // collaged rather than dropped, but it changes how the model sees them.
  const totalRefImages =
    imageRefs.length + collectionRefs.reduce((sum, c) => sum + c.images.length, 0)
  const refLimit = getCombinedCapabilities(selectedModels).minReferenceLimit
  const willCollage = totalRefImages > refLimit
  const isEmbeddedMode = !!canvasContext
  const editorPlaceholder = canvasContext
    ? 'Was soll aus deiner Skizze entstehen?'
    : thumbnailMode
      ? 'Deine Thumbnail-Idee: Motiv, Emotion und Situation …'
      : logoMode
        ? 'Beschreibe die Marke und dein Logo: „Kaffeerösterei, Bohne als Sonne …“'
        : printMode ? 'Was gestaltest du? Anlass, Zielgruppe und genaue Texte in „Anführungszeichen“ …'
        : 'Was möchtest du erschaffen? Beschreibe Motiv, Licht und Stil …'

  return (
    <div className={cn("shrink-0 flex flex-col items-center", isEmbeddedMode ? "px-6 pb-4 pt-3" : "px-6 pb-6 pt-3")}>
      <div className="w-full max-w-[1100px] relative">
        <div
          className={cn(
            'prompt-card studio-composer relative border rounded-xl transition-colors',
            isDragOver ? 'border-accent-main' : 'border-border-base'
          )}
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Drag overlay */}
          {isDragOver && (
            <div className="absolute inset-0 z-10 rounded-2xl bg-accent-main/8 backdrop-blur-sm flex items-center justify-center pointer-events-none border-2 border-dashed border-accent-main/40">
              <div className="flex flex-col items-center gap-2">
                <Plus className="w-6 h-6 text-accent-main" />
                <span className="text-[13px] font-medium text-accent-main">Als Referenz hinzufügen</span>
              </div>
            </div>
          )}

          {printMode && <PrintControls format={printFormat} style={printStyle} metaPrompt={printMetaPrompt} onFormatChange={changePrintFormat} onStyleChange={changePrintStyle} onMetaPromptChange={changePrintMetaPrompt} imageSize={printOutput?.imageSize} aspectRatio={printOutput?.aspectRatio ?? aspectRatio} error={printSaveError} hasReferences={imageRefs.length > 0 || collectionRefs.length > 0} />}

          {/* What comes out of here, stated once so the format is never a surprise. */}
          {logoMode && (
            <div className="flex items-center gap-2 px-4 pt-2.5 -mb-1">
              <div className="w-1.5 h-1.5 rounded-full shrink-0 bg-accent-main" />
              <span className="text-[12px] text-text-secondary">
                {background === 'transparent'
                  ? 'Transparentes PNG'
                  : background === 'opaque'
                    ? 'PNG mit deckendem Hintergrund'
                    : 'PNG, Hintergrund entscheidet das Modell'}
              </span>
              <span className="text-[12px] text-text-muted shrink-0">
                {background === 'transparent'
                  ? '· Hintergrund frei wählbar unter Optionen'
                  : '· Transparenz unter Optionen wählen'}
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
                  <span className="text-[12px] text-text-secondary truncate">{activeProject.title}</span>
                  <span className="text-[12px] text-text-muted shrink-0">
                    · Videotitel wird als Kontext verwendet
                  </span>
                </>
              ) : (
                <span className="text-[12px] text-text-muted">
                  Kein Video gewählt — landet unter „Alle Thumbnails"
                </span>
              )}
            </div>
          )}

          {/* ContentEditable editor */}
          <div className="flex items-start gap-3 px-5 pt-5 pb-4">
            {imageRefs.length === 0 && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="no-drag shrink-0 mt-0.5 w-8 h-8 rounded-full flex items-center justify-center border border-border-base text-text-secondary hover:text-text-primary hover:bg-surface-4 hover:border-border-bright transition-all"
                title="Referenzbilder hinzufügen"
              >
                <Plus className="w-4 h-4" />
              </button>
            )}
            <div
              ref={editorRef}
              role="textbox"
              aria-label="Bildbeschreibung"
              aria-multiline="true"
              contentEditable
              suppressContentEditableWarning
              onInput={handleEditorInput}
              onPaste={handleEditorPaste}
              onKeyDown={handleEditorKeyDown}
              data-placeholder={editorPlaceholder}
              className="prompt-editor flex-1 min-h-[60px] max-h-[160px] overflow-y-auto text-[15px] text-text-primary leading-relaxed outline-none pt-1"
            />
          </div>


          {referenceLoading && <p role="status" className="px-5 pb-3 text-[13px] text-text-muted">Ausgangsbild wird geladen …</p>}
          {referenceError && <div role="alert" className="mx-5 mb-3 p-3 rounded-lg border border-danger/40 text-[13px] text-text-primary">
            <p>{referenceError}</p>
            <button className="mt-2 text-accent-main underline underline-offset-4" onClick={() => {
              const reuse = lastReuseRef.current
              if (reuse) useCropStore.getState().setPendingReuse(reuse.prompt, reuse.attachmentFilePaths, reuse.negativePrompt, reuse.seed, reuse)
            }}>Erneut versuchen</button>
            <button className="mt-2 ml-4 text-text-secondary underline underline-offset-4" onClick={clearPrompt}>Eingabe verwerfen</button>
          </div>}

          {/* Attachments */}
          <AttachmentStrip
            imageRefs={imageRefs}
            collectionRefs={collectionRefs}
            onRemoveImage={removeImageRef}
            onRemoveCollection={removeCollectionRef}
            onAddMore={() => fileInputRef.current?.click()}
          />

          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileSelect} />


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
              onModelsChange={changeModels}
              style={logoStyle}
              onStyleChange={setLogoStyle}
              aspectRatio={resolvedRatio}
              onAspectRatioChange={(r) => setAspectRatio(r as AspectRatio)}
              customRatio={customRatio}
              onCustomRatioChange={setCustomRatio}
              resolution={resolution}
              onResolutionChange={setResolution}
              imageSize={imageSize}
              onImageSizeChange={setImageSize}
              onSizeErrorChange={setSizeError}
              background={background}
              onBackgroundChange={changeBackground}
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
              onModelsChange={changeModels}
              quality={quality}
              onQualityChange={setQuality}
              outputFormat={outputFormat}
              onOutputFormatChange={changeFormat}
              outputCompression={outputCompression}
              onOutputCompressionChange={setOutputCompression}
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
            printFormat={printMode ? printFormat : undefined}
            onPrintFormatChange={printMode ? changePrintFormat : undefined}
            selectedModels={selectedModels}
            onModelsChange={changeModels}
            aspectRatio={(printOutput ? getCombinedCapabilities(selectedModels).aspectRatios.includes(printOutput.aspectRatio as never) ? printOutput.aspectRatio : 'custom' : aspectRatio) as AspectRatio}
            onAspectRatioChange={value => { setAspectRatio(value); if (printMode) changePrintFormat('custom') }}
            customRatio={printOutput?.aspectRatio ?? customRatio}
            onCustomRatioChange={value => { setCustomRatio(value); if (printMode) changePrintFormat('custom') }}
            imageSize={printOutput ? printOutput.imageSize : imageSize}
            onImageSizeChange={value => { setImageSize(value); if (printMode) changePrintFormat('custom') }}
            onSizeErrorChange={setSizeError}
            outputFormat={outputFormat}
            onOutputFormatChange={changeFormat}
            outputCompression={outputCompression}
            onOutputCompressionChange={setOutputCompression}
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
            onBackgroundChange={changeBackground}
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

        {/* Hint - only show when not in embedded mode; fades out with the bar */}
        {!isEmbeddedMode && (
          <div
            className="flex flex-wrap justify-between mt-2.5 px-1"
          >
            <p className="text-[12px] text-text-muted">
              {hydrated && !falApiKey ? (
                <button onClick={onSettingsClick} className="text-danger/80 hover:text-danger transition-colors cursor-pointer">
                  fal.ai API-Schlüssel fehlt · Einstellungen öffnen
                </button>
              ) : (
                <>
                  <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-surface-2 text-text-muted border border-border-dim text-[12px] mr-0.5">&#x2318;</kbd>
                  <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-surface-2 text-text-muted border border-border-dim text-[12px] mx-0.5">&#x23CE;</kbd>
                  {'  ·  '}
                  <CostEstimate
                    models={selectedModels}
                    aspectRatio={printOutput?.aspectRatio ?? (thumbnailMode ? THUMBNAIL_ASPECT_RATIO : resolvedRatio)}
                    resolution={printOutput?.resolution ?? (thumbnailMode ? THUMBNAIL_RESOLUTION : resolution)}
                    imageCount={imageCount}
                    quality={quality}
                    imageSize={printOutput ? printOutput.imageSize : thumbnailMode ? THUMBNAIL_GPT_IMAGE_SIZE : imageSize}
                  />
                  {(imageRefs.length > 0 || collections.length > 0) && (
                    <>
                      {'  \u00B7  '}
                      <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-surface-2 text-text-muted border border-border-dim text-[12px] mx-0.5">@</kbd>
                      {' Referenzen im Text'}
                    </>
                  )}
                  {willCollage && (
                    <>
                      {'  \u00B7  '}
                      <span className="text-accent-main/80">
                        {totalRefImages} Referenzen · ab {refLimit} Bildern werden nummerierte Collagen erstellt
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
