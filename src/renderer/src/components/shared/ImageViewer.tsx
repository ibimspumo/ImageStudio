import { useState, useEffect, useCallback } from 'react'
import {
  X,
  Download,
  Copy,
  ChevronLeft,
  ChevronRight,
  Trash2,
  MessageSquare,
  RotateCcw,
  Clock,
  Calendar,
  Clipboard,
  Image as ImageIcon
} from 'lucide-react'
import type { GalleryImage } from '../../stores/gallery-store'
import { useGalleryStore } from '../../stores/gallery-store'
import { cn } from '../../lib/utils'

interface ImageViewerProps {
  images: GalleryImage[]
  currentIndex: number
  onClose: () => void
  onNavigate: (index: number) => void
  onStartChat: (imageId: string) => void
  onReusePrompt: (image: GalleryImage) => void
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

export function ImageViewer({
  images,
  currentIndex,
  onClose,
  onNavigate,
  onStartChat,
  onReusePrompt
}: ImageViewerProps) {
  const [hovered, setHovered] = useState(false)
  const [promptCopied, setPromptCopied] = useState(false)
  const [imageDims, setImageDims] = useState<{ w: number; h: number } | null>(null)
  const removeImage = useGalleryStore((s) => s.removeImage)
  const image = images[currentIndex]
  const src = image?.base64DataUrl

  // Detect actual pixel dimensions of the base64 image
  useEffect(() => {
    if (!src) { setImageDims(null); return }
    const img = new window.Image()
    img.onload = () => setImageDims({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = () => setImageDims(null)
    img.src = src
    return () => { img.onload = null; img.onerror = null }
  }, [src])

  const canGoLeft = currentIndex > 0
  const canGoRight = currentIndex < images.length - 1

  const goLeft = useCallback(() => {
    if (canGoLeft) onNavigate(currentIndex - 1)
  }, [canGoLeft, currentIndex, onNavigate])

  const goRight = useCallback(() => {
    if (canGoRight) onNavigate(currentIndex + 1)
  }, [canGoRight, currentIndex, onNavigate])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') goLeft()
      if (e.key === 'ArrowRight') goRight()
    },
    [onClose, goLeft, goRight]
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const handleSave = async () => {
    if (!src) return
    await window.api.exportImage(src, `imagestudio-${Date.now()}.png`)
  }

  const handleCopy = async () => {
    if (!src) return
    try {
      const response = await fetch(src)
      const blob = await response.blob()
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
    } catch {
      // silent
    }
  }

  const handleCopyPrompt = async () => {
    if (!image?.prompt) return
    try {
      await navigator.clipboard.writeText(image.prompt)
      setPromptCopied(true)
      setTimeout(() => setPromptCopied(false), 2000)
    } catch {
      // silent
    }
  }

  const handleDelete = () => {
    if (!image) return
    const id = image.id
    // Navigate away before deleting
    if (images.length <= 1) {
      onClose()
    } else if (currentIndex >= images.length - 1) {
      onNavigate(currentIndex - 1)
    }
    removeImage(id)
  }

  if (!image) return null

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex animate-overlay-in"
      onClick={onClose}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseMove={() => setHovered(true)}
    >
      {/* Counter — bottom-center to avoid macOS traffic lights */}
      {images.length > 1 && (
        <div className="absolute bottom-5 left-[35%] -translate-x-1/2 z-[60] px-3 py-1.5 rounded-lg bg-white/8 border border-white/10 backdrop-blur-md pointer-events-none">
          <span className="text-[13px] font-medium text-white/80">
            {currentIndex + 1} / {images.length}
          </span>
        </div>
      )}

      {/* Left arrow */}
      {canGoLeft && hovered && (
        <button
          onClick={(e) => { e.stopPropagation(); goLeft() }}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-2.5 rounded-xl bg-white/8 hover:bg-white/15 border border-white/10 transition-all backdrop-blur-md"
        >
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>
      )}

      {/* Right arrow - offset from info panel */}
      {canGoRight && hovered && (
        <button
          onClick={(e) => { e.stopPropagation(); goRight() }}
          className="absolute right-[31%] top-1/2 -translate-y-1/2 z-10 p-2.5 rounded-xl bg-white/8 hover:bg-white/15 border border-white/10 transition-all backdrop-blur-md"
        >
          <ChevronRight className="w-5 h-5 text-white" />
        </button>
      )}

      {/* Image area - 70% */}
      <div
        className="w-[70%] h-full flex items-center justify-center p-12"
        onClick={onClose}
      >
        <img
          src={src}
          alt="Full size"
          className="max-w-[75vw] max-h-[75vh] object-contain rounded-xl shadow-[0_0_80px_rgba(0,0,0,0.4)]"
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      {/* Info panel - 30% */}
      <div
        className="no-drag w-[30%] h-full bg-surface-2 border-l border-border-dim overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 flex flex-col gap-5">
          {/* Close button — no-drag to override Electron drag region */}
          <div className="flex justify-end">
            <button
              onClick={(e) => { e.stopPropagation(); onClose() }}
              className="no-drag p-2.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-3 transition-colors cursor-pointer"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Prompt */}
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wider text-text-muted">Prompt</span>
            <div className="relative group">
              <p className="text-[13px] text-text-primary leading-relaxed bg-surface-3 rounded-lg p-3 pr-9">
                {image.prompt}
              </p>
              <button
                onClick={handleCopyPrompt}
                className="absolute top-2 right-2 p-1.5 rounded-md text-text-muted hover:text-text-secondary hover:bg-surface-4 transition-colors opacity-0 group-hover:opacity-100"
                title="Copy prompt"
              >
                <Clipboard className="w-3.5 h-3.5" />
              </button>
              {promptCopied && (
                <span className="absolute top-2 right-10 text-[11px] text-accent-main">Copied</span>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-2">
            <button
              onClick={() => onReusePrompt(image)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent-dim text-accent-main hover:bg-accent-main/20 transition-colors text-[13px] font-medium"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reuse Prompt
            </button>
            <button
              onClick={() => onStartChat(image.id)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-3 text-text-secondary hover:bg-surface-4 transition-colors text-[13px] font-medium"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Start Chat
            </button>
          </div>

          {/* Metadata */}
          <div className="flex flex-col gap-3">
            <span className="text-[11px] font-medium uppercase tracking-wider text-text-muted">Details</span>

            {/* Model */}
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-text-muted w-20 shrink-0">Model</span>
              <span className="text-[12px] text-text-secondary truncate">{image.model}</span>
            </div>

            {/* Aspect ratio + Resolution + Pixel dimensions badges */}
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-text-muted w-20 shrink-0">Size</span>
              <div className="flex flex-wrap gap-1.5">
                <span className="px-2 py-0.5 rounded-md bg-surface-3 text-[11px] font-medium text-text-secondary">
                  {image.aspectRatio}
                </span>
                <span className="px-2 py-0.5 rounded-md bg-surface-3 text-[11px] font-medium text-text-secondary">
                  {image.resolution}
                </span>
                {imageDims && (
                  <span className="px-2 py-0.5 rounded-md bg-surface-3 text-[11px] font-medium text-text-secondary">
                    {imageDims.w} × {imageDims.h}
                  </span>
                )}
              </div>
            </div>

            {/* Duration */}
            {image.durationMs != null && (
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-text-muted w-20 shrink-0">Duration</span>
                <div className="flex items-center gap-1.5 text-[12px] text-text-secondary">
                  <Clock className="w-3 h-3 text-text-muted" />
                  {formatDuration(image.durationMs)}
                </div>
              </div>
            )}

            {/* Date */}
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-text-muted w-20 shrink-0">Created</span>
              <div className="flex items-center gap-1.5 text-[12px] text-text-secondary">
                <Calendar className="w-3 h-3 text-text-muted" />
                {formatDate(image.timestamp)}
              </div>
            </div>
          </div>

          {/* Reference images — clickable to preview */}
          {image.attachments && image.attachments.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-medium uppercase tracking-wider text-text-muted">
                Reference Images
              </span>
              <div className="flex flex-wrap gap-2">
                {image.attachments.map((att, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => window.open(att, '_blank')}
                    className="w-16 h-16 rounded-lg overflow-hidden border border-border-dim bg-surface-3 hover:border-accent-main transition-colors cursor-pointer"
                    title={`View reference ${i + 1}`}
                  >
                    <img
                      src={att}
                      alt={`Reference ${i + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Bottom action buttons */}
          <div className="flex flex-col gap-2 pt-2 border-t border-border-dim">
            <div className="flex gap-2">
              <button
                onClick={handleCopy}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg',
                  'bg-surface-3 text-text-secondary hover:bg-surface-4 transition-colors text-[13px] font-medium'
                )}
              >
                <Copy className="w-3.5 h-3.5" />
                Copy
              </button>
              <button
                onClick={handleSave}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg',
                  'bg-surface-3 text-text-secondary hover:bg-surface-4 transition-colors text-[13px] font-medium'
                )}
              >
                <Download className="w-3.5 h-3.5" />
                Save
              </button>
            </div>
            <button
              onClick={handleDelete}
              className={cn(
                'flex items-center justify-center gap-2 px-3 py-2 rounded-lg',
                'bg-surface-3 text-danger hover:bg-danger/10 transition-colors text-[13px] font-medium'
              )}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
