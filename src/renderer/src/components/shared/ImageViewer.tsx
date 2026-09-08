import { PromptText } from './PromptText'
import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  X,
  Copy,
  ChevronLeft,
  ChevronRight,
  Trash2,
  WandSparkles,
  RotateCcw,
  Clock,
  Calendar,
  Clipboard,
  Crop,
  DollarSign,
  Loader2,
  ArrowUpCircle,
  Star,
  Columns,
  Hash
} from 'lucide-react'
import type { GalleryImage } from '../../stores/gallery-store'
import { useGalleryStore, toDisplayUrl } from '../../stores/gallery-store'
import { useSettingsStore } from '../../stores/settings-store'
import { AVAILABLE_MODELS, DEFAULT_MODEL, getModelName, getVideoModelName, normalizeModelId } from '../../types/api'
import { getResolutionLabel } from '../../lib/image-utils'
import { ExportPopover } from './ExportPopover'
import { TagInput } from '../tags/TagInput'
import { cn } from '../../lib/utils'
import { prepareImageTransform, ZOOM_LEVELS, EDIT_ASPECT_RATIOS, upscaleTargets as getUpscaleTargets } from '../../lib/image-editing'
import { useImageGeneration } from '../../hooks/useImageGeneration'
import { formatDuration, formatDate } from '../../lib/date-utils'
import { neutralImageName } from '../../lib/anti-detection'
import { logger } from '../../lib/logger'

interface ImageViewerProps {
  images: GalleryImage[]
  currentIndex: number
  onClose: () => void
  onNavigate: (index: number) => void
  onCreateVariant: (imageId: string) => void
  onReusePrompt: (image: GalleryImage) => void
  onCropImage?: (imageId: string, filePath: string) => void
  onCompare?: (image: GalleryImage) => void
}


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
        stroke={active ? 'var(--color-accent-main)' : 'var(--color-text-muted)'} strokeWidth="1.2" strokeDasharray={active ? undefined : '2 2'} />
      <rect x={innerX} y={innerY} width={innerW} height={innerH} rx="1"
        fill={active ? 'var(--color-accent-main)' : 'var(--color-text-secondary)'} opacity={active ? 0.35 : 0.2}
        stroke={active ? 'var(--color-accent-main)' : 'var(--color-text-secondary)'} strokeWidth="0.8" />
    </svg>
  )
}

function ZoomIcon({ factor, active }: { factor: number; active?: boolean }) {
  const inner = Math.round(100 / factor)
  const offset = Math.round((100 - inner) / 2)
  return (
    <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none">
      <rect x="1" y="1" width="18" height="18" rx="2" stroke={active ? 'var(--color-accent-main)' : 'var(--color-text-muted)'} strokeWidth="1.5" strokeDasharray={active ? undefined : '2 2'} />
      <rect x={1 + (offset * 18) / 100} y={1 + (offset * 18) / 100} width={(inner * 18) / 100} height={(inner * 18) / 100} rx="1" fill={active ? 'var(--color-accent-main)' : 'var(--color-text-secondary)'} opacity={active ? 0.3 : 0.15} stroke={active ? 'var(--color-accent-main)' : 'var(--color-text-secondary)'} strokeWidth="1" />
    </svg>
  )
}

export function ImageViewer({
  images,
  currentIndex,
  onClose,
  onNavigate,
  onCreateVariant,
  onReusePrompt,
  onCropImage,
  onCompare
}: ImageViewerProps) {
  const [actionError, setActionError] = useState('')
  const [promptCopied, setPromptCopied] = useState(false)
  const [promptExpanded, setPromptExpanded] = useState(false)
  const [imageDims, setImageDims] = useState<{ w: number; h: number } | null>(null)
  const [zoomGenerating, setZoomGenerating] = useState<number | null>(null)
  const [upscaleGenerating, setUpscaleGenerating] = useState<string | null>(null)
  const [upscaleModel, setUpscaleModel] = useState(DEFAULT_MODEL)
  const [aspectRatioGenerating, setAspectRatioGenerating] = useState<string | null>(null)
  const [aspectRatioModel, setAspectRatioModel] = useState<string | null>(null)
  const { generate } = useImageGeneration()
  const removeImage = useGalleryStore((s) => s.removeImage)
  const toggleFavorite = useGalleryStore((s) => s.toggleFavorite)
  const updateTags = useGalleryStore((s) => s.updateTags)
  const allImages = useGalleryStore((s) => s.images)
  const falApiKey = useSettingsStore((s) => s.falApiKey)
  const antiDetection = useSettingsStore((s) => s.antiDetection)
  const snapshotImage = images[currentIndex]
  // Read live image from store so toggleFavorite/updateTags reflect immediately
  const image = allImages.find((img) => img.id === snapshotImage?.id) ?? snapshotImage
  const displayUrl = image ? toDisplayUrl(image.filePath) : undefined


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
    if ((e.target as HTMLElement)?.closest('input, textarea, [contenteditable=true], select')) return
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
      if (result.success && result.base64DataUrl) {
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
    if (!image || !window.confirm('Dieses Medium aus der Galerie löschen?')) return
    const id = image.id
    if (images.length <= 1) { onClose() }
    else if (currentIndex >= images.length - 1) { onNavigate(currentIndex - 1) }
    removeImage(id)
  }

  const availableRatios = image ? EDIT_ASPECT_RATIOS.filter((r) => r !== image.aspectRatio) : []
  const effectiveAspectRatioModel = aspectRatioModel ?? normalizeModelId(image?.model)

  const handleZoomOut = useCallback(async (factor: number) => {
    if (!image?.filePath || !falApiKey || zoomGenerating) return
    setActionError('')
    setZoomGenerating(factor)
    try {
      generate(await prepareImageTransform(image, { operation: 'zoom_out', factor }))
      onClose()
    } catch (err) { setActionError(err instanceof Error ? err.message : 'Bild konnte nicht erweitert werden.'); logger.error('ImageViewer', 'Zoom out failed', err) }
    finally { setZoomGenerating(null) }
  }, [image, falApiKey, zoomGenerating, generate, onClose])

  const handleUpscale = useCallback(async (targetResolution: string) => {
    if (!image?.filePath || !falApiKey || upscaleGenerating) return
    setActionError('')
    setUpscaleGenerating(targetResolution)
    try {
      generate(await prepareImageTransform(image, { operation: 'upscale', resolution: targetResolution, model: upscaleModel }))
      onClose()
    } catch (err) { setActionError(err instanceof Error ? err.message : 'Auflösung konnte nicht erhöht werden.'); logger.error('ImageViewer', 'Upscale failed', err) }
    finally { setUpscaleGenerating(null) }
  }, [image, falApiKey, upscaleGenerating, upscaleModel, generate, onClose])

  const handleAspectRatioChange = useCallback(async (targetRatio: string) => {
    if (!image?.filePath || !falApiKey || aspectRatioGenerating) return
    setActionError('')
    setAspectRatioGenerating(targetRatio)
    try {
      generate(await prepareImageTransform(image, { operation: 'aspect_ratio', aspectRatio: targetRatio, model: effectiveAspectRatioModel }))
      onClose()
    } catch (err) { setActionError(err instanceof Error ? err.message : 'Format konnte nicht geändert werden.'); logger.error('ImageViewer', 'Aspect ratio change failed', err) }
    finally { setAspectRatioGenerating(null) }
  }, [image, falApiKey, aspectRatioGenerating, effectiveAspectRatioModel, generate, onClose])

  const upscaleTargets = image ? getUpscaleTargets(image).filter((r) => AVAILABLE_MODELS.find((m) => m.id === upscaleModel)?.uiResolutions.includes(r as never)) : []

  if (!image) return null

  return (
    <div
      className="fixed inset-0 z-50 bg-surface-0 flex flex-col md:flex-row animate-overlay-in"
      onClick={onClose}
      role="dialog" aria-modal="true" aria-label="Mediendetails" data-media-id={image.id}
    >
      {images.length > 1 && (
        <div className="absolute bottom-5 left-[calc((100%-360px)/2)] hidden md:block -translate-x-1/2 z-[60] px-3 py-1.5 rounded-lg bg-white/8 border border-white/10 backdrop-blur-md pointer-events-none">
          <span className="text-[13px] font-medium text-white/80">{currentIndex + 1} / {images.length}</span>
        </div>
      )}

      {canGoLeft && (
        <button aria-label="Vorheriges Medium" onClick={(e) => { e.stopPropagation(); goLeft() }} className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-2.5 rounded-xl bg-white/8 hover:bg-white/15 border border-white/10 transition-all backdrop-blur-md">
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>
      )}
      {canGoRight && (
        <button aria-label="Nächstes Medium" onClick={(e) => { e.stopPropagation(); goRight() }} className="absolute right-4 md:right-[376px] top-1/2 -translate-y-1/2 z-10 p-2.5 rounded-xl bg-white/8 hover:bg-white/15 border border-white/10 transition-all backdrop-blur-md">
          <ChevronRight className="w-5 h-5 text-white" />
        </button>
      )}

      <div className="flex-1 min-w-0 min-h-0 flex items-center justify-center p-6 md:p-10" onClick={onClose}>
        {image?.type === 'video' ? (
          <video
            src={displayUrl}
            controls
            autoPlay
            className="max-w-full max-h-[84vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <img
            src={displayUrl}
            alt={image.prompt || "Bild in voller Größe"}
            className={cn(
              'max-w-full max-h-[84vh] object-contain rounded-lg',
              // A transparent logo needs a ground here too, or it is invisible
              // against the dark lightbox.
              image?.hasAlpha && 'alpha-checker'
            )}
            onClick={(e) => e.stopPropagation()}
          />
        )}
      </div>

      <div className="no-drag w-full md:w-[360px] shrink-0 max-h-[50vh] md:max-h-none md:h-full bg-surface-1 border-t md:border-t-0 md:border-l border-border-dim overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 flex flex-col gap-6">
          <div className="flex items-center justify-between"><h2 className="text-[18px] font-semibold text-text-primary">{image.type === 'video' ? 'Video' : 'Bild'}</h2>
            <button onClick={(e) => { e.stopPropagation(); onClose() }} className="no-drag p-2.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-3 transition-colors cursor-pointer" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties} title="Schließen" aria-label="Schließen">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <button onClick={() => onReusePrompt(image)} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent-dim text-accent-main hover:bg-accent-main/20 transition-colors text-[13px] font-medium">
              <RotateCcw className="w-3.5 h-3.5" /> Prompt übernehmen
            </button>
            {image.type !== 'video' && (
              <button onClick={() => onCreateVariant(image.id)} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent-main text-surface-0 hover:bg-accent-bright transition-colors text-[13px] font-semibold">
                <WandSparkles className="w-4 h-4" /> Variante erstellen
              </button>
            )}
          </div>

            <div className="flex flex-col gap-2">
              {image.type !== 'video' && <button onClick={handleCopy} className={cn('flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg', 'bg-surface-3 text-text-secondary hover:bg-surface-4 transition-colors text-[13px] font-medium')}>
                <Copy className="w-3.5 h-3.5" /> Kopieren
              </button>}
              <ExportPopover
                imageSrc={displayUrl ?? ''}
                defaultName={
                  antiDetection
                    ? neutralImageName(image.filePath.split('.').pop()?.toLowerCase() || (image.type === 'video' ? 'mp4' : 'jpg'))
                    : `imagestudio-${Date.now()}.${image.type === 'video' ? image.filePath.split('.').pop()?.toLowerCase() || 'mp4' : 'png'}`
                }
                className="flex-1"
                isVideo={image.type === 'video'}
                videoFilePath={image.type === 'video' ? image.filePath : undefined}
                // Embedding prompt and model would put back exactly what the
                // anti-detection step removes, so it is not offered while it is on.
                metadata={image.type !== 'video' && !antiDetection ? { prompt: image.prompt, model: image.model, aspectRatio: image.aspectRatio, resolution: image.resolution, ...(image.seed != null ? { seed: String(image.seed) } : {}), ...(image.negativePrompt ? { negativePrompt: image.negativePrompt } : {}), timestamp: new Date(image.timestamp).toISOString() } : undefined}
              />
            </div>

          {actionError && <p role="alert" className="text-[12px] text-danger">{actionError}</p>}
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
              {image.isFavorite ? 'Favorisiert' : 'Favorisieren'}
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[12px] font-medium text-text-muted">Prompt</span>
            <div className="relative group">
              <p className={cn(
                'text-[13px] text-text-primary leading-relaxed bg-surface-3 rounded-lg p-3 pr-9',
                !promptExpanded && 'line-clamp-4'
              )}><PromptText text={image.prompt}/></p>
              {!promptExpanded && image.prompt.length > 200 && (
                <button
                  onClick={() => setPromptExpanded(true)}
                  className="w-full text-center text-[11px] text-accent-main hover:text-accent-bright transition-colors mt-1"
                >
                  Mehr anzeigen
                </button>
              )}
              {promptExpanded && image.prompt.length > 200 && (
                <button
                  onClick={() => setPromptExpanded(false)}
                  className="w-full text-center text-[11px] text-accent-main hover:text-accent-bright transition-colors mt-1"
                >
                  Weniger anzeigen
                </button>
              )}
              <button onClick={handleCopyPrompt} className="absolute top-2 right-2 p-1.5 rounded-md text-text-muted hover:text-text-secondary hover:bg-surface-4 transition-colors opacity-100" title="Prompt kopieren">
                <Clipboard className="w-3.5 h-3.5" />
              </button>
              {promptCopied && <span className="absolute top-2 right-10 text-[11px] text-accent-main">Kopiert</span>}
            </div>
          </div>

          {image.negativePrompt && (
            <div className="flex flex-col gap-2">
              <span className="text-[12px] font-medium text-text-muted">Negativer Prompt</span>
              <p className="text-[13px] text-text-secondary leading-relaxed bg-surface-3 rounded-lg p-3">{image.negativePrompt}</p>
            </div>
          )}

          {image.type !== 'video' && <details className="border-t border-border-dim pt-4">
            <summary className="cursor-pointer text-[13px] font-medium text-text-secondary">Bild bearbeiten</summary>
            <div className="flex flex-col gap-2 mt-3">
            {onCropImage && (
              <button onClick={() => onCropImage(image.id, image.filePath)} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-3 text-text-secondary hover:bg-surface-4 transition-colors text-[13px] font-medium">
                <Crop className="w-3.5 h-3.5" /> Ausschnitt als Referenz
              </button>
            )}
            {onCompare && hasParentImage && (
              <button onClick={() => onCompare(image)} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-3 text-text-secondary hover:bg-surface-4 transition-colors text-[13px] font-medium">
                <Columns className="w-3.5 h-3.5" /> Mit Original vergleichen
              </button>
            )}
            </div>
            <p className="mt-2 mb-4 text-[12px] leading-relaxed text-text-muted">KI-Bearbeitungen erstellen ein neues Bild und sind kostenpflichtig.</p>
            <div className="flex flex-col gap-5">
          {(
          <div className="flex flex-col gap-2">
            <span className="text-[12px] font-medium text-text-muted">Bild erweitern</span>
            <div className="flex gap-1.5">
              {ZOOM_LEVELS.map((level) => {
                const isGenerating = zoomGenerating === level
                return (
                  <button key={level} onClick={() => handleZoomOut(level)} disabled={!!zoomGenerating || !falApiKey}
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
            {zoomGenerating && <p className="text-[10px] text-accent-main/70 text-center animate-pulse">Bild wird {zoomGenerating}× erweitert…</p>}
          </div>
          )}

          {/* Seitenverhältnis */}
          {availableRatios.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[12px] font-medium text-text-muted">Seitenverhältnis</span>
              <div className="grid grid-cols-3 gap-1.5">
                {availableRatios.map((ratio) => {
                  const isGenerating = aspectRatioGenerating === ratio
                  return (
                    <button key={ratio} onClick={() => handleAspectRatioChange(ratio)} disabled={!!aspectRatioGenerating || !!zoomGenerating || !falApiKey}
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
              <label className="flex items-center gap-3 text-[12px] text-text-muted">Modell
                <select aria-label="Modell für Formatänderung" value={effectiveAspectRatioModel} onChange={(e) => setAspectRatioModel(e.target.value)} className="flex-1 min-w-0 rounded-lg bg-surface-3 border border-border-dim px-2 py-2 text-text-primary">
                  {AVAILABLE_MODELS.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
                </select>
              </label>
              {aspectRatioGenerating && <p className="text-[10px] text-accent-main/70 text-center animate-pulse">Format wird auf {aspectRatioGenerating} geändert…</p>}
            </div>
          )}

          {/* Upscale */}
          {upscaleTargets.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[12px] font-medium text-text-muted">Auflösung erhöhen</span>
              <div className="flex gap-1.5">
                {upscaleTargets.map((res) => {
                  const isGenerating = upscaleGenerating === res
                  return (
                    <button key={res} onClick={() => handleUpscale(res)} disabled={!!upscaleGenerating || !!zoomGenerating || !falApiKey}
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
              <label className="flex items-center gap-3 text-[12px] text-text-muted">Modell
                <select aria-label="Modell für höhere Auflösung" value={upscaleModel} onChange={(e) => setUpscaleModel(e.target.value)} className="flex-1 min-w-0 rounded-lg bg-surface-3 border border-border-dim px-2 py-2 text-text-primary">
                  {AVAILABLE_MODELS.filter((model) => model.uiResolutions.some((r) => r === '2K' || r === '4K')).map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
                </select>
              </label>
              {upscaleGenerating && <p className="text-[10px] text-accent-main/70 text-center animate-pulse">Auflösung wird auf {upscaleGenerating} erhöht…</p>}
            </div>
          )}

            </div>
          </details>}

          <div className="flex flex-col gap-3">
            <span className="text-[12px] font-medium text-text-muted">Details</span>
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-text-muted w-20 shrink-0">Modell</span>
              <span className="text-[12px] text-text-secondary truncate" title={image.model}>{image.type === 'video' ? getVideoModelName(image.model) : getModelName(image.model)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-text-muted w-20 shrink-0">Format</span>
              <div className="flex flex-wrap gap-1.5">
                <span className="px-2 py-0.5 rounded-md bg-surface-3 text-[11px] font-medium text-text-secondary">{image.aspectRatio}</span>
                <span className="px-2 py-0.5 rounded-md bg-surface-3 text-[11px] font-medium text-text-secondary">{image.resolution}</span>
                {imageDims && <span className="px-2 py-0.5 rounded-md bg-surface-3 text-[11px] font-medium text-text-secondary">{imageDims.w} × {imageDims.h}</span>}
              </div>
            </div>
            {image.durationMs != null && (
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-text-muted w-20 shrink-0">Dauer</span>
                <div className="flex items-center gap-1.5 text-[12px] text-text-secondary"><Clock className="w-3 h-3 text-text-muted" />{formatDuration(image.durationMs)}</div>
              </div>
            )}
            {image.cost != null && (
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-text-muted w-20 shrink-0">{image.costSource === 'provider-reported' ? 'fal.ai-Kosten' : 'Schätzung USD'}</span>
                <div className="flex items-center gap-1.5 text-[12px] text-text-secondary"><DollarSign className="w-3 h-3 text-text-muted" />{image.cost < 0.01 ? `$${image.cost.toFixed(4)}` : `$${image.cost.toFixed(3)}`}</div>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-text-muted w-20 shrink-0">Erstellt</span>
              <div className="flex items-center gap-1.5 text-[12px] text-text-secondary"><Calendar className="w-3 h-3 text-text-muted" />{formatDate(image.timestamp)}</div>
            </div>
            {image.seed != null && (
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-text-muted w-20 shrink-0">Seed</span>
                <div className="flex items-center gap-1.5">
                  <Hash className="w-3 h-3 text-text-muted" />
                  <span className="text-[12px] text-text-secondary font-mono">{image.seed}</span>
                  <button onClick={handleCopySeed} className="p-1 rounded text-text-muted hover:text-text-secondary transition-colors" title="Seed kopieren">
                    <Clipboard className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {(image.generationOptions || image.generationRequest) && (
            <details className="rounded-lg border border-border-dim bg-surface-3 p-3">
              <summary className="cursor-pointer text-[12px] font-medium text-text-secondary">Generierungsdetails</summary>
              <p className="mt-2 text-[11px] text-text-muted">Gespeicherter Auftrag mit Prompt und Referenzen. Kosten sind Listenpreis-Schätzungen, sofern nicht vom Anbieter gemeldet.</p>
              <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all text-[11px] text-text-secondary select-text">{JSON.stringify({
                options: image.generationOptions,
                providerRequest: image.generationRequest,
                requestId: image.requestId,
                providerRequestId: image.falRequestId,
                costSource: image.costSource ?? 'Unknown (older result)',
                costCheckedAt: image.costCheckedAt,
                costCurrency: image.costCurrency ?? 'USD',
              }, (_key, value) => typeof value === 'string' && value.startsWith('data:') ? `[Embedded ${value.slice(5, value.indexOf(';'))} reference; ${value.length} characters]` : value, 2)}</pre>
            </details>
          )}

          {/* Tags */}
          <div className="flex flex-col gap-2">
            <span className="text-[12px] font-medium text-text-muted">Tags</span>
            <TagInput
              tags={image.tags || []}
              onTagsChange={(tags) => updateTags(image.id, tags)}
              suggestions={allTags}
            />
          </div>

          {image.attachments && image.attachments.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[12px] font-medium text-text-muted">Referenzbilder</span>
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
            <button onClick={handleDelete} className={cn('flex items-center justify-center gap-2 px-3 py-2 rounded-lg', 'bg-surface-3 text-danger hover:bg-danger/10 transition-colors text-[13px] font-medium')}>
              <Trash2 className="w-3.5 h-3.5" /> Löschen
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
