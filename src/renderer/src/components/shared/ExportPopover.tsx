import { useState, useEffect, useCallback, useRef } from 'react'
import { Download, ChevronDown } from 'lucide-react'
import { cn } from '../../lib/utils'
import { logger } from '../../lib/logger'

type ExportFormat = 'png' | 'jpeg' | 'webp'

interface ExportPopoverProps {
  imageSrc: string  // file:// URL or base64 data URL
  defaultName: string
  className?: string
  metadata?: Record<string, string>
  isVideo?: boolean
  videoFilePath?: string  // absolute file path for video export
}

const FORMAT_LABELS: Record<ExportFormat, string> = {
  png: 'PNG',
  jpeg: 'JPEG',
  webp: 'WebP',
}

const MIME_TYPES: Record<ExportFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function convertImage(
  src: string,
  format: ExportFormat,
  quality: number
): Promise<{ dataUrl: string; sizeBytes: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('Canvas not supported')); return }

      // For JPEG, fill with white background (no transparency)
      if (format === 'jpeg') {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      }

      ctx.drawImage(img, 0, 0)

      const mimeType = MIME_TYPES[format]
      const q = format === 'png' ? undefined : quality / 100

      canvas.toBlob(
        (blob) => {
          if (!blob) { reject(new Error('Conversion failed')); return }
          const reader = new FileReader()
          reader.onload = () => {
            resolve({
              dataUrl: reader.result as string,
              sizeBytes: blob.size,
            })
          }
          reader.readAsDataURL(blob)
        },
        mimeType,
        q
      )
    }
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = src
  })
}

export function ExportPopover({ imageSrc, defaultName, className, metadata, isVideo, videoFilePath }: ExportPopoverProps) {
  const [open, setOpen] = useState(false)
  const [format, setFormat] = useState<ExportFormat>('png')
  const [embedMetadata, setEmbedMetadata] = useState(true)
  const [quality, setQuality] = useState(92)
  const [fileSize, setFileSize] = useState<number | null>(null)
  const [originalSize, setOriginalSize] = useState<number | null>(null)
  const [isCalculating, setIsCalculating] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  // Calculate original file size on mount (images only)
  useEffect(() => {
    if (!imageSrc || isVideo) return
    // For file:// URLs, estimate size from a PNG conversion
    convertImage(imageSrc, 'png', 100)
      .then(({ sizeBytes }) => setOriginalSize(sizeBytes))
      .catch(() => setOriginalSize(null))
  }, [imageSrc, isVideo])

  // Recalculate file size when format or quality changes
  const recalculate = useCallback(() => {
    if (!imageSrc || !open) return
    setIsCalculating(true)

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      convertImage(imageSrc, format, quality)
        .then(({ sizeBytes }) => {
          setFileSize(sizeBytes)
          setIsCalculating(false)
        })
        .catch(() => {
          setFileSize(null)
          setIsCalculating(false)
        })
    }, 150)
  }, [imageSrc, format, quality, open])

  useEffect(() => {
    recalculate()
  }, [recalculate])

  const handleQuickSave = async () => {
    try {
      if (isVideo && videoFilePath) {
        await window.api.exportVideo(videoFilePath, defaultName)
      } else {
        const { dataUrl } = await convertImage(imageSrc, 'png', 100)
        await window.api.exportImage(dataUrl, defaultName)
      }
    } catch (err) {
      logger.error('ExportPopover', 'Quick save failed', err)
    }
  }

  const handleExportWithOptions = async () => {
    try {
      if (isVideo && videoFilePath) {
        await window.api.exportVideo(videoFilePath, defaultName)
        setOpen(false)
        return
      }
      const { dataUrl } = await convertImage(imageSrc, format, quality)
      const ext = format === 'jpeg' ? 'jpg' : format
      const name = defaultName.replace(/\.\w+$/, '') + '.' + ext
      if (metadata && embedMetadata) {
        await window.api.exportImageWithMetadata(dataUrl, name, metadata)
      } else {
        await window.api.exportImage(dataUrl, name)
      }
      setOpen(false)
    } catch (err) {
      logger.error('ExportPopover', 'Export with options failed', err)
    }
  }

  const showQuality = format === 'jpeg' || format === 'webp'
  const savings = originalSize && fileSize ? Math.round((1 - fileSize / originalSize) * 100) : null

  // Video: simple save button, no format/quality options
  if (isVideo) {
    return (
      <div className={cn('relative', className)}>
        <button
          onClick={handleQuickSave}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-surface-3 text-text-secondary hover:bg-surface-4 transition-colors text-[13px] font-medium"
        >
          <Download className="w-3.5 h-3.5" />
          Save MP4
        </button>
      </div>
    )
  }

  return (
    <div className={cn('relative', className)}>
      {/* Split button: Save (quick) + dropdown arrow */}
      <div className="flex items-center">
        <button
          onClick={handleQuickSave}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-l-lg bg-surface-3 text-text-secondary hover:bg-surface-4 transition-colors text-[13px] font-medium"
        >
          <Download className="w-3.5 h-3.5" />
          Save
        </button>
        <button
          onClick={() => setOpen(!open)}
          className={cn(
            'flex items-center justify-center px-1.5 py-2 rounded-r-lg border-l border-border-dim transition-colors',
            open
              ? 'bg-surface-4 text-text-primary'
              : 'bg-surface-3 text-text-muted hover:bg-surface-4 hover:text-text-secondary'
          )}
        >
          <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', open && 'rotate-180')} />
        </button>
      </div>

      {/* Export options popover */}
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 right-0 mb-2 bg-surface-3 border border-border-base rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.5)] p-3 z-30 animate-scale-in">
            {/* Format selector */}
            <div className="flex flex-col gap-2 mb-3">
              <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted">Format</span>
              <div className="flex gap-1">
                {(['png', 'jpeg', 'webp'] as ExportFormat[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFormat(f)}
                    className={cn(
                      'flex-1 py-1.5 rounded-lg text-[11px] font-medium transition-all text-center',
                      format === f
                        ? 'bg-accent-dim text-accent-main border border-accent-main/20'
                        : 'bg-surface-4 text-text-secondary hover:text-text-primary border border-transparent'
                    )}
                  >
                    {FORMAT_LABELS[f]}
                  </button>
                ))}
              </div>
            </div>

            {/* Quality slider — only for JPEG/WebP */}
            {showQuality && (
              <div className="flex flex-col gap-2 mb-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted">Quality</span>
                  <span className="text-[11px] font-medium text-text-secondary tabular-nums">{quality}%</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="100"
                  step="1"
                  value={quality}
                  onChange={(e) => setQuality(parseInt(e.target.value))}
                  className="w-full h-1 rounded-full appearance-none bg-surface-4 accent-accent-main cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-main [&::-webkit-slider-thumb]:shadow-[0_0_6px_rgba(167,139,250,0.4)]"
                />
                <div className="flex justify-between text-[9px] text-text-muted">
                  <span>Smaller file</span>
                  <span>Higher quality</span>
                </div>
              </div>
            )}

            {/* File size info */}
            <div className="flex items-center justify-between py-2 px-2.5 rounded-lg bg-surface-4/50 mb-3">
              <span className="text-[11px] text-text-muted">Estimated size</span>
              <div className="flex items-center gap-2">
                {isCalculating ? (
                  <span className="text-[11px] text-text-muted">...</span>
                ) : fileSize != null ? (
                  <>
                    <span className="text-[12px] font-medium text-text-primary tabular-nums">
                      {formatFileSize(fileSize)}
                    </span>
                    {savings != null && savings > 0 && format !== 'png' && (
                      <span className="text-[10px] text-success font-medium">
                        -{savings}%
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-[11px] text-text-muted">—</span>
                )}
              </div>
            </div>

            {metadata && (
              <div className="flex items-center gap-2 mb-3">
                <input
                  type="checkbox"
                  id="embed-metadata"
                  checked={embedMetadata}
                  onChange={(e) => setEmbedMetadata(e.target.checked)}
                  className="rounded border-border-base accent-accent-main"
                />
                <label htmlFor="embed-metadata" className="text-[11px] text-text-secondary cursor-pointer">
                  Embed metadata (prompt, model, etc.)
                </label>
              </div>
            )}

            {/* Export button */}
            <button
              onClick={handleExportWithOptions}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-accent-dim text-accent-main hover:bg-accent-main/20 transition-colors text-[12px] font-medium"
            >
              <Download className="w-3.5 h-3.5" />
              Export as {FORMAT_LABELS[format]}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
