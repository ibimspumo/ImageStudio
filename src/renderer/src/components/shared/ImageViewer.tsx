import { useState, useEffect, useCallback } from 'react'
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
  Image as ImageIcon
} from 'lucide-react'
import type { GalleryImage } from '../../stores/gallery-store'
import { useGalleryStore, toDisplayUrl } from '../../stores/gallery-store'
import { useChatStore } from '../../stores/chat-store'
import { useSettingsStore } from '../../stores/settings-store'
import { getModelName } from '../../types/api'
import { ExportPopover } from './ExportPopover'
import { cn } from '../../lib/utils'
import { compressImage } from '../../lib/image-utils'

interface ImageViewerProps {
  images: GalleryImage[]
  currentIndex: number
  onClose: () => void
  onNavigate: (index: number) => void
  onStartChat: (imageId: string) => void
  onReusePrompt: (image: GalleryImage) => void
  onOpenChat?: (chatId: string) => void
  onCropImage?: (imageId: string, filePath: string) => void
}

function formatDuration(ms: number): string {
  return (ms / 1000).toFixed(1) + 's'
}

function formatDate(timestamp: number): string {
  const d = new Date(timestamp)
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }) + ' at ' + d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  })
}

const ZOOM_LEVELS = [1.5, 2, 3, 4] as const

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
  onCropImage
}: ImageViewerProps) {
  const [hovered, setHovered] = useState(false)
  const [promptCopied, setPromptCopied] = useState(false)
  const [imageDims, setImageDims] = useState<{ w: number; h: number } | null>(null)
  const [zoomGenerating, setZoomGenerating] = useState<number | null>(null)
  const removeImage = useGalleryStore((s) => s.removeImage)
  const addPlaceholder = useGalleryStore((s) => s.addPlaceholder)
  const completeImage = useGalleryStore((s) => s.completeImage)
  const failImage = useGalleryStore((s) => s.failImage)
  const chats = useChatStore((s) => s.chats)
  const apiKey = useSettingsStore((s) => s.apiKey)
  const image = images[currentIndex]
  const displayUrl = image ? toDisplayUrl(image.filePath) : undefined

  const linkedChat = image?.chatId ? chats.find((c) => c.id === image.chatId) : null

  useEffect(() => {
    if (!displayUrl) { setImageDims(null); return }
    const img = new window.Image()
    img.onload = () => setImageDims({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = () => setImageDims(null)
    img.src = displayUrl
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

  const handleCopy = async () => {
    if (!image?.filePath) return
    try {
      const result = await window.api.readImage(image.filePath)
      if (result.success) {
        const response = await fetch(result.base64DataUrl)
        const blob = await response.blob()
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
      }
    } catch { /* silent */ }
  }

  const handleCopyPrompt = async () => {
    if (!image?.prompt) return
    try {
      await navigator.clipboard.writeText(image.prompt)
      setPromptCopied(true)
      setTimeout(() => setPromptCopied(false), 2000)
    } catch { /* silent */ }
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
      // Load base64 from disk, compress for API
      const readResult = await window.api.readImage(image.filePath)
      if (!readResult.success) throw new Error('Failed to read image')
      const compressedRef = await compressImage(readResult.base64DataUrl)

      const prompt = `Take this image and zoom out by ${factor}x, extending the scene naturally beyond all edges. Keep the original image content exactly as-is in the center, and seamlessly continue the environment, lighting, colors, and composition outward. Original description: "${image.prompt}"`

      const placeholderId = addPlaceholder(
        `Zoom ${factor}x: ${image.prompt}`,
        image.aspectRatio,
        image.resolution,
        image.model,
        [image.filePath],
        image.workspaceId
      )
      onClose()

      const startTime = Date.now()
      const response = await window.api.generateImage({
        prompt,
        model: image.model,
        apiKey,
        aspectRatio: image.aspectRatio,
        resolution: image.resolution,
        count: 1,
        requestId: crypto.randomUUID(),
        attachments: [compressedRef],
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
    } catch { /* handled */ } finally {
      setZoomGenerating(null)
    }
  }, [image, apiKey, zoomGenerating, addPlaceholder, completeImage, failImage, onClose])

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
        <img src={displayUrl} alt="Full size" className="max-w-[75vw] max-h-[75vh] object-contain rounded-xl shadow-[0_0_80px_rgba(0,0,0,0.4)]" onClick={(e) => e.stopPropagation()} />
      </div>

      <div className="no-drag w-[30%] h-full bg-surface-2 border-l border-border-dim overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 flex flex-col gap-5">
          <div className="flex justify-end">
            <button onClick={(e) => { e.stopPropagation(); onClose() }} className="no-drag p-2.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-3 transition-colors cursor-pointer" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties} title="Close">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wider text-text-muted">Prompt</span>
            <div className="relative group">
              <p className="text-[13px] text-text-primary leading-relaxed bg-surface-3 rounded-lg p-3 pr-9">{image.prompt}</p>
              <button onClick={handleCopyPrompt} className="absolute top-2 right-2 p-1.5 rounded-md text-text-muted hover:text-text-secondary hover:bg-surface-4 transition-colors opacity-0 group-hover:opacity-100" title="Copy prompt">
                <Clipboard className="w-3.5 h-3.5" />
              </button>
              {promptCopied && <span className="absolute top-2 right-10 text-[11px] text-accent-main">Copied</span>}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <button onClick={() => onReusePrompt(image)} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent-dim text-accent-main hover:bg-accent-main/20 transition-colors text-[13px] font-medium">
              <RotateCcw className="w-3.5 h-3.5" /> Reuse Prompt
            </button>
            <button onClick={() => onStartChat(image.id)} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-3 text-text-secondary hover:bg-surface-4 transition-colors text-[13px] font-medium">
              <MessageSquare className="w-3.5 h-3.5" /> {linkedChat ? 'Continue Chat' : 'Start Chat'}
            </button>
            {onCropImage && (
              <button onClick={() => onCropImage(image.id, image.filePath)} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-3 text-text-secondary hover:bg-surface-4 transition-colors text-[13px] font-medium">
                <Crop className="w-3.5 h-3.5" /> Crop as Reference
              </button>
            )}
          </div>

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
              <span className="text-[12px] text-text-secondary truncate" title={image.model}>{getModelName(image.model)}</span>
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
              <ExportPopover imageSrc={displayUrl!} defaultName={`imagestudio-${Date.now()}.png`} className="flex-1" />
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
