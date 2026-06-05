import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  X,
  Copy,
  ChevronLeft,
  ChevronRight,
  Trash2,
  MessageSquare,
  RotateCcw,
  Clock,
  Calendar,
  Clipboard,
  ExternalLink,
  Crop,
  DollarSign,
  ZoomOut,
  Loader2,
  Image as ImageIcon,
  ArrowUpCircle,
  ChevronDown,
  Star,
  Paintbrush,
  Columns,
  Hash
} from 'lucide-react'
import type { GalleryImage } from '../../stores/gallery-store'
import { useGalleryStore, toDisplayUrl } from '../../stores/gallery-store'
import { useChatStore } from '../../stores/chat-store'
import { useSettingsStore } from '../../stores/settings-store'
import { AVAILABLE_MODELS, getModelName, getVideoModelName } from '../../types/api'
import { compressImage, getResolutionLabel } from '../../lib/image-utils'
import { ExportPopover } from './ExportPopover'
import { TagInput } from '../tags/TagInput'
import { cn } from '../../lib/utils'
import { createZoomOutCanvas, createAspectRatioCanvas, upscaleForApi } from '../../lib/image-utils'
import { formatDuration, formatDate } from '../../lib/date-utils'
import { logger } from '../../lib/logger'

interface ImageViewerProps {
  images: GalleryImage[]
  currentIndex: number
  onClose: () => void
  onNavigate: (index: number) => void
  onStartChat: (imageId: string) => void
  onReusePrompt: (image: GalleryImage) => void
  onOpenChat?: (chatId: string) => void
  onCropImage?: (imageId: string, filePath: string) => void
  onInpaint?: (imageId: string, filePath: string) => void
  onCompare?: (image: GalleryImage) => void
}

const ZOOM_LEVELS = [1.5, 2, 3, 4] as const

/** Shows outer rect = target ratio, inner filled rect = source ratio */
function AspectRatioIcon({ sourceRatio, targetRatio, active }: { sourceRatio: string; targetRatio: string; active?: boolean }) {
  const parse = (r: string) => { const [w, h] = r.split(':').map(Number); return w / h }
  const srcAR = parse(sourceRatio)
  const tgtAR = parse(targetRatio)

  // Outer rect fits target ratio inside 18x18 viewBox area (1..19)
  const maxW = 18, maxH = 18
  let outerW: number, outerH: number
  if (tgtAR > 1) { outerW = maxW; outerH = maxW / tgtAR }
  else { outerH = maxH; outerW = maxH * tgtAR }

  // Inner rect fits source ratio inside outer rect, centered
  let innerW: number, innerH: number
  if (srcAR > tgtAR) {
    // Source is wider relative to target — source fills width, shorter in height
    innerW = outerW * 0.7
    innerH = innerW / srcAR
  } else {
    // Source is taller relative to target — source fills height, narrower in width
    innerH = outerH * 0.7
    innerW = innerH * srcAR
  }

  const outerX = 1 + (maxW - outerW) / 2
  const outerY = 1 + (maxH - outerH) / 2
  const innerX = outerX + (outerW - innerW) / 2
  const innerY = outerY + (outerH - innerH) / 2

  return (
    <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none">
      <rect x={outerX} y={outerY} width={outerW} height={outerH} rx="1.5"
        stroke={active ? '#a78bfa' : '#505060'} strokeWidth="1.2" strokeDasharray={active ? undefined : '2 2'} />
      <rect x={innerX} y={innerY} width={innerW} height={innerH} rx="1"
        fill={active ? '#a78bfa' : '#9898a4'} opacity={active ? 0.35 : 0.2}
        stroke={active ? '#a78bfa' : '#9898a4'} strokeWidth="0.8" />
    </svg>
  )
}

function ZoomIcon({ factor, active }: { factor: number; active?: boolean }) {
  const inner = Math.round(100 / factor)
  const offset = Math.round((100 - inner) / 2)
  return (
    <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none">
      <rect x="1" y="1" width="18" height="18" rx="2" stroke={active ? '#a78bfa' : '#505060'} strokeWidth="1.5" strokeDasharray={active ? undefined : '2 2'} />
      <rect x={1 + (offset * 18) / 100} y={1 + (offset * 18) / 100} width={(inner * 18) / 100} height={(inner * 18) / 100} rx="1" fill={active ? '#a78bfa' : '#9898a4'} opacity={active ? 0.3 : 0.15} stroke={active ? '#a78bfa' : '#9898a4'} strokeWidth="1" />
    </svg>
  )
}

export function ImageViewer({
  images,
  currentIndex,
  onClose,
  onNavigate,
  onStartChat,
  onReusePrompt,
  onOpenChat,
  onCropImage,
  onInpaint,
  onCompare
}: ImageViewerProps) {
  const [hovered, setHovered] = useState(false)
  const [promptCopied, setPromptCopied] = useState(false)
  const [promptExpanded, setPromptExpanded] = useState(false)
  const [imageDims, setImageDims] = useState<{ w: number; h: number } | null>(null)
  const [zoomGenerating, setZoomGenerating] = useState<number | null>(null)
  const [upscaleGenerating, setUpscaleGenerating] = useState<string | null>(null)
  const [upscaleModel, setUpscaleModel] = useState('google/gemini-3.1-flash-image-preview')
  const [showUpscaleModelPicker, setShowUpscaleModelPicker] = useState(false)
  const [aspectRatioGenerating, setAspectRatioGenerating] = useState<string | null>(null)
  const [aspectRatioModel, setAspectRatioModel] = useState<string | null>(null)
  const [showAspectRatioModelPicker, setShowAspectRatioModelPicker] = useState(false)
  const removeImage = useGalleryStore((s) => s.removeImage)
  const addPlaceholder = useGalleryStore((s) => s.addPlaceholder)
  const updateStatus = useGalleryStore((s) => s.updateStatus)
  const completeImage = useGalleryStore((s) => s.completeImage)
  const failImage = useGalleryStore((s) => s.failImage)
  const toggleFavorite = useGalleryStore((s) => s.toggleFavorite)
  const updateTags = useGalleryStore((s) => s.updateTags)
  const allImages = useGalleryStore((s) => s.images)
  const chats = useChatStore((s) => s.chats)
  const apiKey = useSettingsStore((s) => s.apiKey)
  const useImageUrls = useSettingsStore((s) => s.useImageUrls)
  const snapshotImage = images[currentIndex]
  // Read live image from store so toggleFavorite/updateTags reflect immediately
  const image = allImages.find((img) => img.id === snapshotImage?.id) ?? snapshotImage
  const displayUrl = image ? toDisplayUrl(image.filePath) : undefined

  const linkedChat = image?.chatId ? chats.find((c) => c.id === image.chatId) : null

  // Check if this image has a parent (was derived from another via upscale, zoom out, inpaint, etc.)
  const hasParentImage = image ? !!(
    image.inpaintSourceId ||
    image.canvasSketchPath ||
    (image.attachments?.length && allImages.some(i => i.filePath === image.attachments![0] && i.id !== image.id))
  ) : false

  const allTags = useMemo(() => {
    const tags = new Set<string>()
    for (const img of allImages) {
      if (img.tags) for (const t of img.tags) tags.add(t)
    }
    return Array.from(tags)
  }, [allImages])

  useEffect(() => {
    if (!displayUrl) { setImageDims(null); return }
    const img = new window.Image()
    img.onload = () => {
      setImageDims({ w: img.naturalWidth, h: img.naturalHeight })
      // Auto-fix resolution label if it doesn't match actual dimensions
      if (image) {
        const actualRes = getResolutionLabel(img.naturalWidth, img.naturalHeight)
        if (actualRes !== image.resolution) {
          useGalleryStore.getState().updateResolution(image.id, actualRes)
        }
      }
    }
    img.onerror = () => setImageDims(null)
    img.src = displayUrl
    setPromptExpanded(false)
    return () => { img.onload = null; img.onerror = null }
  }, [displayUrl])

  const canGoLeft = currentIndex > 0
  const canGoRight = currentIndex < images.length - 1

  const goLeft = useCallback(() => { if (canGoLeft) onNavigate(currentIndex - 1) }, [canGoLeft, currentIndex, onNavigate])
  const goRight = useCallback(() => { if (canGoRight) onNavigate(currentIndex + 1) }, [canGoRight, currentIndex, onNavigate])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
    if (e.key === 'ArrowLeft') goLeft()
    if (e.key === 'ArrowRight') goRight()
  }, [onClose, goLeft, goRight])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const handleCopySeed = async () => {
    if (image?.seed == null) return
    try {
      await navigator.clipboard.writeText(String(image.seed))
    } catch (err) {
      logger.error('ImageViewer', 'Failed to copy seed', err)
    }
  }

  const handleCopy = async () => {
    if (!image?.filePath) return
    try {
      const result = await window.api.readImage(image.filePath)
      if (result.success) {
        const response = await fetch(result.base64DataUrl)
        const blob = await response.blob()
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
      }
    } catch (err) {
      logger.error('ImageViewer', 'Failed to copy image to clipboard', err)
    }
  }

  const handleCopyPrompt = async () => {
    if (!image?.prompt) return
    try {
      await navigator.clipboard.writeText(image.prompt)
      setPromptCopied(true)
      setTimeout(() => setPromptCopied(false), 2000)
    } catch (err) {
      logger.error('ImageViewer', 'Failed to copy prompt to clipboard', err)
    }
  }

  const handleDelete = () => {
    if (!image) return
    const id = image.id
    if (images.length <= 1) { onClose() }
    else if (currentIndex >= images.length - 1) { onNavigate(currentIndex - 1) }
    removeImage(id)
  }

  // Zoom out / outpaint
  const handleZoomOut = useCallback(async (factor: number) => {
    if (!image || !image.filePath || !apiKey || zoomGenerating) return
    setZoomGenerating(factor)
    try {
      // Load base64 from disk
      const readResult = await window.api.readImage(image.filePath)
      if (!readResult.success) throw new Error('Failed to read image')

      // Create zoom-out canvas (image centered on larger black canvas) + compressed reference
      const { canvas, reference } = await createZoomOutCanvas(readResult.base64DataUrl, factor)

      const prompt = `I have placed the original image centered on a larger black canvas. Fill in the black/empty areas naturally, seamlessly extending the scene outward in all directions. Keep the original center image exactly as-is — do not alter, crop, or re-interpret it. Continue the environment, lighting, colors, perspective, and composition from the edges outward. Original description: "${image.prompt}"`

      const placeholderId = addPlaceholder(
        `Zoom ${factor}x: ${image.prompt}`,
        image.aspectRatio,
        image.resolution,
        image.model,
        [image.filePath],
        image.workspaceId
      )
      onClose()

      // Two attachments: canvas (shows layout) + reference (full-quality original)
      let resolvedAttachments = [canvas, reference]
      let resolvedLabeled: { label: string; images: string[] }[] = [
        { label: 'Canvas layout — fill the black areas around the centered image', images: [canvas] },
        { label: 'Original image (high quality reference)', images: [reference] },
      ]

      // Upload to temp URLs if enabled
      if (useImageUrls) {
        updateStatus(placeholderId, 'Uploading images...')
        try {
          const uploadResult = await window.api.uploadToUrls([canvas, reference])
          if (uploadResult.success) {
            resolvedAttachments = uploadResult.urls
            resolvedLabeled = [
              { label: 'Canvas layout — fill the black areas around the centered image', images: [uploadResult.urls[0]] },
              { label: 'Original image (high quality reference)', images: [uploadResult.urls[1]] },
            ]
          }
        } catch (err) {
          logger.warn('ImageViewer', 'Upload failed, falling back to base64', err)
        }
        updateStatus(placeholderId, undefined)
      }

      const startTime = Date.now()
      const response = await window.api.generateImage({
        prompt,
        model: image.model,
        apiKey,
        aspectRatio: image.aspectRatio,
        resolution: image.resolution,
        count: 1,
        requestId: crypto.randomUUID(),
        attachments: resolvedAttachments,
        labeledAttachments: resolvedLabeled,
      })

      const durationMs = Date.now() - startTime
      if (response.success && response.results?.[0]?.status === 'complete' && response.results[0].result?.imageBase64) {
        const filename = `${placeholderId}.png`
        const saveResult = await window.api.saveImage(response.results[0].result.imageBase64, filename)
        if (saveResult.success && saveResult.filePath) {
          completeImage(placeholderId, saveResult.filePath, durationMs, response.results[0].result.cost)
        } else {
          failImage(placeholderId, 'Failed to save image')
        }
      } else {
        failImage(placeholderId, response.error || response.results?.[0]?.error || 'Zoom out failed')
      }
    } catch (err) {
      logger.error('ImageViewer', 'Zoom out failed', err)
    } finally {
      setZoomGenerating(null)
    }
  }, [image, apiKey, useImageUrls, zoomGenerating, addPlaceholder, updateStatus, completeImage, failImage, onClose])

  // Upscale
  const handleUpscale = useCallback(async (targetResolution: string) => {
    if (!image || !image.filePath || !apiKey || upscaleGenerating) return
    setUpscaleGenerating(targetResolution)
    try {
      const readResult = await window.api.readImage(image.filePath)
      if (!readResult.success) throw new Error('Failed to read image')

      // Pre-upscale small images so the API produces the requested resolution.
      // Gemini matches output size to input size — a 1024px input with image_size:"4K"
      // still returns 1024px. By sending a 2048px+ input, 4K output works reliably.
      const minDimForTarget = targetResolution === '4K' ? 2048 : 1024
      const upscaled = await upscaleForApi(readResult.base64DataUrl, minDimForTarget)
      const compressed = await compressImage(upscaled, 4096, 0.85)

      const prompt = `Recreate this exact image in higher resolution. Preserve every detail precisely — same composition, colors, lighting, textures, subjects, and style. Do not add, remove, or change anything. Simply produce a pixel-perfect higher-resolution version of this exact image. Original description: "${image.prompt}"`

      const placeholderId = addPlaceholder(
        `Upscale to ${targetResolution}: ${image.prompt}`,
        image.aspectRatio,
        targetResolution,
        upscaleModel,
        [image.filePath],
        image.workspaceId
      )
      onClose()

      let resolvedAttachments = [compressed]
      let resolvedLabeled = [
        { label: 'Original image — recreate this exactly at higher resolution', images: [compressed] },
      ]

      if (useImageUrls) {
        updateStatus(placeholderId, 'Uploading image...')
        try {
          const uploadResult = await window.api.uploadToUrls([compressed])
          if (uploadResult.success) {
            resolvedAttachments = uploadResult.urls
            resolvedLabeled = [
              { label: 'Original image — recreate this exactly at higher resolution', images: [uploadResult.urls[0]] },
            ]
          }
        } catch (err) {
          logger.warn('ImageViewer', 'Upload failed, falling back to base64', err)
        }
        updateStatus(placeholderId, undefined)
      }

      const startTime = Date.now()
      const response = await window.api.generateImage({
        prompt,
        model: upscaleModel,
        apiKey,
        aspectRatio: image.aspectRatio,
        resolution: targetResolution,
        count: 1,
        requestId: crypto.randomUUID(),
        attachments: resolvedAttachments,
        labeledAttachments: resolvedLabeled,
      })

      const durationMs = Date.now() - startTime
      if (response.success && response.results?.[0]?.status === 'complete' && response.results[0].result?.imageBase64) {
        const filename = `${placeholderId}.png`
        const saveResult = await window.api.saveImage(response.results[0].result.imageBase64, filename)
        if (saveResult.success && saveResult.filePath) {
          completeImage(placeholderId, saveResult.filePath, durationMs, response.results[0].result.cost)
        } else {
          failImage(placeholderId, 'Failed to save image')
        }
      } else {
        failImage(placeholderId, response.error || response.results?.[0]?.error || 'Upscale failed')
      }
    } catch (err) {
      logger.error('ImageViewer', 'Upscale failed', err)
    } finally {
      setUpscaleGenerating(null)
    }
  }, [image, apiKey, useImageUrls, upscaleGenerating, upscaleModel, addPlaceholder, updateStatus, completeImage, failImage, onClose])

  const ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '5:4', '4:5', '21:9'] as const
  const availableRatios = image ? ASPECT_RATIOS.filter((r) => r !== image.aspectRatio) : []
  const effectiveAspectRatioModel = aspectRatioModel ?? image?.model ?? 'google/gemini-3.1-flash-image-preview'

  // Change aspect ratio / outpaint to new ratio
  const handleAspectRatioChange = useCallback(async (targetRatio: string) => {
    if (!image || !image.filePath || !apiKey || aspectRatioGenerating) return
    setAspectRatioGenerating(targetRatio)
    try {
      const readResult = await window.api.readImage(image.filePath)
      if (!readResult.success) throw new Error('Failed to read image')

      const { canvas, reference } = await createAspectRatioCanvas(readResult.base64DataUrl, targetRatio)

      const prompt = `I have placed the original image centered on a larger canvas with ${targetRatio} aspect ratio. Fill in the black/empty areas naturally, seamlessly extending the scene outward. Keep the original image exactly as-is — do not alter, crop, or re-interpret it. Continue the environment, lighting, colors, perspective, and composition from the edges outward. Original description: "${image.prompt}"`

      const selectedModel = effectiveAspectRatioModel
      const placeholderId = addPlaceholder(
        `Aspect ${targetRatio}: ${image.prompt}`,
        targetRatio,
        image.resolution,
        selectedModel,
        [image.filePath],
        image.workspaceId
      )
      onClose()

      let resolvedAttachments = [canvas, reference]
      let resolvedLabeled: { label: string; images: string[] }[] = [
        { label: `Canvas layout (${targetRatio}) — fill the black areas around the centered image`, images: [canvas] },
        { label: 'Original image (high quality reference)', images: [reference] },
      ]

      if (useImageUrls) {
        updateStatus(placeholderId, 'Uploading images...')
        try {
          const uploadResult = await window.api.uploadToUrls([canvas, reference])
          if (uploadResult.success) {
            resolvedAttachments = uploadResult.urls
            resolvedLabeled = [
              { label: `Canvas layout (${targetRatio}) — fill the black areas around the centered image`, images: [uploadResult.urls[0]] },
              { label: 'Original image (high quality reference)', images: [uploadResult.urls[1]] },
            ]
          }
        } catch (err) {
          logger.warn('ImageViewer', 'Upload failed, falling back to base64', err)
        }
        updateStatus(placeholderId, undefined)
      }

      const startTime = Date.now()
      const response = await window.api.generateImage({
        prompt,
        model: selectedModel,
        apiKey,
        aspectRatio: targetRatio,
        resolution: image.resolution,
        count: 1,
        requestId: crypto.randomUUID(),
        attachments: resolvedAttachments,
        labeledAttachments: resolvedLabeled,
      })

      const durationMs = Date.now() - startTime
      if (response.success && response.results?.[0]?.status === 'complete' && response.results[0].result?.imageBase64) {
        const filename = `${placeholderId}.png`
        const saveResult = await window.api.saveImage(response.results[0].result.imageBase64, filename)
        if (saveResult.success && saveResult.filePath) {
          completeImage(placeholderId, saveResult.filePath, durationMs, response.results[0].result.cost)
        } else {
          failImage(placeholderId, 'Failed to save image')
        }
      } else {
        failImage(placeholderId, response.error || response.results?.[0]?.error || 'Aspect ratio change failed')
      }
    } catch (err) {
      logger.error('ImageViewer', 'Aspect ratio change failed', err)
    } finally {
      setAspectRatioGenerating(null)
    }
  }, [image, apiKey, useImageUrls, aspectRatioGenerating, effectiveAspectRatioModel, addPlaceholder, updateStatus, completeImage, failImage, onClose])

  // Available upscale targets based on original resolution
  const upscaleTargets = image
    ? image.resolution === '1K' ? ['2K', '4K']
      : image.resolution === '2K' ? ['4K']
      : []
    : []

  if (!image) return null

  return (
    <div
      className="absolute inset-0 z-50 bg-black/85 backdrop-blur-md flex animate-overlay-in"
      onClick={onClose}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseMove={() => setHovered(true)}
    >
      {images.length > 1 && (
        <div className="absolute bottom-5 left-[35%] -translate-x-1/2 z-[60] px-3 py-1.5 rounded-lg bg-white/8 border border-white/10 backdrop-blur-md pointer-events-none">
          <span className="text-[13px] font-medium text-white/80">{currentIndex + 1} / {images.length}</span>
        </div>
      )}

      {canGoLeft && hovered && (
        <button onClick={(e) => { e.stopPropagation(); goLeft() }} className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-2.5 rounded-xl bg-white/8 hover:bg-white/15 border border-white/10 transition-all backdrop-blur-md">
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>
      )}
      {canGoRight && hovered && (
        <button onClick={(e) => { e.stopPropagation(); goRight() }} className="absolute right-[31%] top-1/2 -translate-y-1/2 z-10 p-2.5 rounded-xl bg-white/8 hover:bg-white/15 border border-white/10 transition-all backdrop-blur-md">
          <ChevronRight className="w-5 h-5 text-white" />
        </button>
      )}

      <div className="w-[70%] h-full flex items-center justify-center p-12" onClick={onClose}>
        {image?.type === 'video' ? (
          <video
            src={displayUrl}
            controls
            autoPlay
            className="max-w-[75vw] max-h-[75vh] object-contain rounded-xl shadow-[0_0_80px_rgba(0,0,0,0.4)]"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <img src={displayUrl} alt="Full size" className="max-w-[75vw] max-h-[75vh] object-contain rounded-xl shadow-[0_0_80px_rgba(0,0,0,0.4)]" onClick={(e) => e.stopPropagation()} />
        )}
      </div>

      <div className="no-drag w-[30%] h-full bg-surface-2 border-l border-border-dim overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 flex flex-col gap-5">
          <div className="flex justify-end">
            <button onClick={(e) => { e.stopPropagation(); onClose() }} className="no-drag p-2.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-3 transition-colors cursor-pointer" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties} title="Close">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Favorite toggle */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => toggleFavorite(image.id)}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-[13px] font-medium',
                image.isFavorite
                  ? 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                  : 'bg-surface-3 text-text-secondary hover:bg-surface-4'
              )}
            >
              <Star className={cn('w-4 h-4', image.isFavorite && 'fill-current')} />
              {image.isFavorite ? 'Favorited' : 'Favorite'}
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wider text-text-muted">Prompt</span>
            <div className="relative group">
              <p className={cn(
                'text-[13px] text-text-primary leading-relaxed bg-surface-3 rounded-lg p-3 pr-9',
                !promptExpanded && 'line-clamp-4'
              )}>{image.prompt}</p>
              {!promptExpanded && image.prompt.length > 200 && (
                <button
                  onClick={() => setPromptExpanded(true)}
                  className="w-full text-center text-[11px] text-accent-main hover:text-accent-bright transition-colors mt-1"
                >
                  Show more
                </button>
              )}
              {promptExpanded && image.prompt.length > 200 && (
                <button
                  onClick={() => setPromptExpanded(false)}
                  className="w-full text-center text-[11px] text-accent-main hover:text-accent-bright transition-colors mt-1"
                >
                  Show less
                </button>
              )}
              <button onClick={handleCopyPrompt} className="absolute top-2 right-2 p-1.5 rounded-md text-text-muted hover:text-text-secondary hover:bg-surface-4 transition-colors opacity-0 group-hover:opacity-100" title="Copy prompt">
                <Clipboard className="w-3.5 h-3.5" />
              </button>
              {promptCopied && <span className="absolute top-2 right-10 text-[11px] text-accent-main">Copied</span>}
            </div>
          </div>

          {image.negativePrompt && (
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-medium uppercase tracking-wider text-text-muted">Negative Prompt</span>
              <p className="text-[13px] text-text-secondary leading-relaxed bg-surface-3 rounded-lg p-3">{image.negativePrompt}</p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <button onClick={() => onReusePrompt(image)} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent-dim text-accent-main hover:bg-accent-main/20 transition-colors text-[13px] font-medium">
              <RotateCcw className="w-3.5 h-3.5" /> Reuse Prompt
            </button>
            {image.type !== 'video' && (
              <button onClick={() => onStartChat(image.id)} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-3 text-text-secondary hover:bg-surface-4 transition-colors text-[13px] font-medium">
                <MessageSquare className="w-3.5 h-3.5" /> {linkedChat ? 'Continue Chat' : 'Start Chat'}
              </button>
            )}
            {onCropImage && image.type !== 'video' && (
              <button onClick={() => onCropImage(image.id, image.filePath)} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-3 text-text-secondary hover:bg-surface-4 transition-colors text-[13px] font-medium">
                <Crop className="w-3.5 h-3.5" /> Crop as Reference
              </button>
            )}
            {onInpaint && image.type !== 'video' && (
              <button onClick={() => onInpaint(image.id, image.filePath)} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-3 text-text-secondary hover:bg-surface-4 transition-colors text-[13px] font-medium">
                <Paintbrush className="w-3.5 h-3.5" /> Inpaint
              </button>
            )}
            {onCompare && hasParentImage && (
              <button onClick={() => onCompare(image)} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-3 text-text-secondary hover:bg-surface-4 transition-colors text-[13px] font-medium">
                <Columns className="w-3.5 h-3.5" /> Compare with Original
              </button>
            )}
          </div>

          {image.type !== 'video' && (
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wider text-text-muted">Zoom Out</span>
            <div className="flex gap-1.5">
              {ZOOM_LEVELS.map((level) => {
                const isGenerating = zoomGenerating === level
                return (
                  <button key={level} onClick={() => handleZoomOut(level)} disabled={!!zoomGenerating || !apiKey}
                    className={cn('flex-1 flex flex-col items-center gap-1 py-2 rounded-lg border text-[11px] font-medium transition-all',
                      isGenerating ? 'bg-accent-dim border-accent-main/30 text-accent-main'
                        : zoomGenerating ? 'bg-surface-3/50 border-border-dim text-text-muted cursor-not-allowed opacity-50'
                        : 'bg-surface-3 border-border-dim text-text-secondary hover:bg-surface-4 hover:border-border-base hover:text-text-primary')}>
                    {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <ZoomIcon factor={level} />}
                    <span>{level}x</span>
                  </button>
                )
              })}
            </div>
            {zoomGenerating && <p className="text-[10px] text-accent-main/70 text-center animate-pulse">Extending image {zoomGenerating}x...</p>}
          </div>
          )}

          {/* Aspect Ratio */}
          {image.type !== 'video' && availableRatios.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-medium uppercase tracking-wider text-text-muted">Aspect Ratio</span>
              <div className="grid grid-cols-3 gap-1.5">
                {availableRatios.map((ratio) => {
                  const isGenerating = aspectRatioGenerating === ratio
                  return (
                    <button key={ratio} onClick={() => handleAspectRatioChange(ratio)} disabled={!!aspectRatioGenerating || !!zoomGenerating || !apiKey}
                      className={cn('flex items-center justify-center gap-1 py-2 rounded-lg border text-[11px] font-medium transition-all',
                        isGenerating ? 'bg-accent-dim border-accent-main/30 text-accent-main'
                          : aspectRatioGenerating ? 'bg-surface-3/50 border-border-dim text-text-muted cursor-not-allowed opacity-50'
                          : 'bg-surface-3 border-border-dim text-text-secondary hover:bg-surface-4 hover:border-border-base hover:text-text-primary')}>
                      {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <AspectRatioIcon sourceRatio={image.aspectRatio} targetRatio={ratio} />}
                      <span>{ratio}</span>
                    </button>
                  )
                })}
              </div>
              {/* Model picker */}
              <div className="relative">
                <button
                  onClick={() => setShowAspectRatioModelPicker(!showAspectRatioModelPicker)}
                  className={cn(
                    'w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-[11px] transition-colors',
                    showAspectRatioModelPicker
                      ? 'bg-surface-4 border-border-base text-text-primary'
                      : 'bg-surface-3 border-border-dim text-text-muted hover:text-text-secondary hover:border-border-base'
                  )}
                >
                  <span>{getModelName(effectiveAspectRatioModel)}</span>
                  <ChevronDown className={cn('w-3 h-3 transition-transform', showAspectRatioModelPicker && 'rotate-180')} />
                </button>
                {showAspectRatioModelPicker && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setShowAspectRatioModelPicker(false)} />
                    <div className="absolute bottom-full left-0 right-0 mb-1 bg-surface-3 border border-border-base rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.5)] p-1 z-30 animate-scale-in max-h-[200px] overflow-y-auto">
                      {AVAILABLE_MODELS.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => { setAspectRatioModel(m.id); setShowAspectRatioModelPicker(false) }}
                          className={cn(
                            'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] text-left transition-colors',
                            effectiveAspectRatioModel === m.id
                              ? 'bg-surface-4 text-text-primary font-medium'
                              : 'text-text-secondary hover:bg-surface-4 hover:text-text-primary'
                          )}
                        >
                          <span className="flex-1">{m.name}</span>
                          <span className="text-[9px] text-text-muted">{m.provider}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              {aspectRatioGenerating && <p className="text-[10px] text-accent-main/70 text-center animate-pulse">Changing to {aspectRatioGenerating}...</p>}
            </div>
          )}

          {/* Upscale */}
          {image.type !== 'video' && upscaleTargets.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-medium uppercase tracking-wider text-text-muted">Upscale</span>
              <div className="flex gap-1.5">
                {upscaleTargets.map((res) => {
                  const isGenerating = upscaleGenerating === res
                  return (
                    <button key={res} onClick={() => handleUpscale(res)} disabled={!!upscaleGenerating || !!zoomGenerating || !apiKey}
                      className={cn('flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border text-[11px] font-medium transition-all',
                        isGenerating ? 'bg-accent-dim border-accent-main/30 text-accent-main'
                          : upscaleGenerating ? 'bg-surface-3/50 border-border-dim text-text-muted cursor-not-allowed opacity-50'
                          : 'bg-surface-3 border-border-dim text-text-secondary hover:bg-surface-4 hover:border-border-base hover:text-text-primary')}>
                      {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowUpCircle className="w-3.5 h-3.5" />}
                      <span>{res}</span>
                    </button>
                  )
                })}
              </div>
              {/* Model picker */}
              <div className="relative">
                <button
                  onClick={() => setShowUpscaleModelPicker(!showUpscaleModelPicker)}
                  className={cn(
                    'w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-[11px] transition-colors',
                    showUpscaleModelPicker
                      ? 'bg-surface-4 border-border-base text-text-primary'
                      : 'bg-surface-3 border-border-dim text-text-muted hover:text-text-secondary hover:border-border-base'
                  )}
                >
                  <span>{getModelName(upscaleModel)}</span>
                  <ChevronDown className={cn('w-3 h-3 transition-transform', showUpscaleModelPicker && 'rotate-180')} />
                </button>
                {showUpscaleModelPicker && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setShowUpscaleModelPicker(false)} />
                    <div className="absolute bottom-full left-0 right-0 mb-1 bg-surface-3 border border-border-base rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.5)] p-1 z-30 animate-scale-in max-h-[200px] overflow-y-auto">
                      {AVAILABLE_MODELS.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => { setUpscaleModel(m.id); setShowUpscaleModelPicker(false) }}
                          className={cn(
                            'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] text-left transition-colors',
                            upscaleModel === m.id
                              ? 'bg-surface-4 text-text-primary font-medium'
                              : 'text-text-secondary hover:bg-surface-4 hover:text-text-primary'
                          )}
                        >
                          <span className="flex-1">{m.name}</span>
                          <span className="text-[9px] text-text-muted">{m.provider}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              {upscaleGenerating && <p className="text-[10px] text-accent-main/70 text-center animate-pulse">Upscaling to {upscaleGenerating}...</p>}
            </div>
          )}

          {linkedChat && (
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-medium uppercase tracking-wider text-text-muted">Chat Origin</span>
              <button onClick={() => { onOpenChat ? onOpenChat(linkedChat.id) : onStartChat(image.id) }} className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-surface-3 hover:bg-surface-4 transition-colors group">
                <MessageSquare className="w-4 h-4 text-accent-main shrink-0" />
                <div className="flex flex-col min-w-0 flex-1 text-left">
                  <span className="text-[12px] font-medium text-text-primary truncate">{linkedChat.title}</span>
                  <span className="text-[10px] text-text-muted">{linkedChat.messages.length} messages</span>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-text-muted group-hover:text-accent-main transition-colors shrink-0" />
              </button>
            </div>
          )}

          <div className="flex flex-col gap-3">
            <span className="text-[11px] font-medium uppercase tracking-wider text-text-muted">Details</span>
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-text-muted w-20 shrink-0">Model</span>
              <span className="text-[12px] text-text-secondary truncate" title={image.model}>{image.type === 'video' ? getVideoModelName(image.model) : getModelName(image.model)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-text-muted w-20 shrink-0">Size</span>
              <div className="flex flex-wrap gap-1.5">
                <span className="px-2 py-0.5 rounded-md bg-surface-3 text-[11px] font-medium text-text-secondary">{image.aspectRatio}</span>
                <span className="px-2 py-0.5 rounded-md bg-surface-3 text-[11px] font-medium text-text-secondary">{image.resolution}</span>
                {imageDims && <span className="px-2 py-0.5 rounded-md bg-surface-3 text-[11px] font-medium text-text-secondary">{imageDims.w} × {imageDims.h}</span>}
              </div>
            </div>
            {image.durationMs != null && (
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-text-muted w-20 shrink-0">Duration</span>
                <div className="flex items-center gap-1.5 text-[12px] text-text-secondary"><Clock className="w-3 h-3 text-text-muted" />{formatDuration(image.durationMs)}</div>
              </div>
            )}
            {image.cost != null && image.cost > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-text-muted w-20 shrink-0">Cost</span>
                <div className="flex items-center gap-1.5 text-[12px] text-text-secondary"><DollarSign className="w-3 h-3 text-text-muted" />{image.cost < 0.01 ? `$${image.cost.toFixed(4)}` : `$${image.cost.toFixed(3)}`}</div>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-text-muted w-20 shrink-0">Created</span>
              <div className="flex items-center gap-1.5 text-[12px] text-text-secondary"><Calendar className="w-3 h-3 text-text-muted" />{formatDate(image.timestamp)}</div>
            </div>
            {image.seed != null && (
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-text-muted w-20 shrink-0">Seed</span>
                <div className="flex items-center gap-1.5">
                  <Hash className="w-3 h-3 text-text-muted" />
                  <span className="text-[12px] text-text-secondary font-mono">{image.seed}</span>
                  <button onClick={handleCopySeed} className="p-1 rounded text-text-muted hover:text-text-secondary transition-colors" title="Copy seed">
                    <Clipboard className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Tags */}
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wider text-text-muted">Tags</span>
            <TagInput
              tags={image.tags || []}
              onTagsChange={(tags) => updateTags(image.id, tags)}
              suggestions={allTags}
            />
          </div>

          {image.attachments && image.attachments.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-medium uppercase tracking-wider text-text-muted">Reference Images</span>
              <div className="flex flex-wrap gap-2">
                {image.attachments.map((att, i) => {
                  const matchIdx = images.findIndex((img) => img.filePath === att)
                  const galleryMatch = matchIdx >= 0 ? matchIdx : null
                  return (
                    <button key={i} type="button" onClick={() => { if (galleryMatch !== null) onNavigate(galleryMatch) }}
                      className={cn('w-16 h-16 rounded-lg overflow-hidden border bg-surface-3 transition-colors',
                        galleryMatch !== null ? 'border-border-dim hover:border-accent-main cursor-pointer' : 'border-border-dim opacity-60 cursor-default')}
                      title={galleryMatch !== null ? 'View in lightbox' : `Reference ${i + 1}`}>
                      <img src={toDisplayUrl(att)} alt={`Reference ${i + 1}`} className="w-full h-full object-cover" />
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2 pt-2 border-t border-border-dim">
            <div className="flex gap-2">
              <button onClick={handleCopy} className={cn('flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg', 'bg-surface-3 text-text-secondary hover:bg-surface-4 transition-colors text-[13px] font-medium')}>
                <Copy className="w-3.5 h-3.5" /> Copy
              </button>
              <ExportPopover
                imageSrc={displayUrl ?? ''}
                defaultName={`imagestudio-${Date.now()}.${image.type === 'video' ? 'mp4' : 'png'}`}
                className="flex-1"
                isVideo={image.type === 'video'}
                videoFilePath={image.type === 'video' ? image.filePath : undefined}
                metadata={image.type !== 'video' ? { prompt: image.prompt, model: image.model, aspectRatio: image.aspectRatio, resolution: image.resolution, ...(image.seed != null ? { seed: String(image.seed) } : {}), ...(image.negativePrompt ? { negativePrompt: image.negativePrompt } : {}), timestamp: new Date(image.timestamp).toISOString() } : undefined}
              />
            </div>
            <button onClick={handleDelete} className={cn('flex items-center justify-center gap-2 px-3 py-2 rounded-lg', 'bg-surface-3 text-danger hover:bg-danger/10 transition-colors text-[13px] font-medium')}>
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
