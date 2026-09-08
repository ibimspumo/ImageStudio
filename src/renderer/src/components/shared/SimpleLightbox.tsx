import { useEffect, useCallback, useState } from 'react'
import { X, Download, Copy, ChevronLeft, ChevronRight } from 'lucide-react'
import { useSettingsStore } from '../../stores/settings-store'
import { convertImage } from '../../lib/image-export'
import { requireExportSuccess } from '../../lib/export-result'
import { logger } from '../../lib/logger'
import { neutralImageName } from '../../lib/anti-detection'

interface SimpleLightboxProps {
  images: string[]
  currentIndex: number
  onClose: () => void
  onNavigate: (index: number) => void
}

export function SimpleLightbox({ images, currentIndex, onClose, onNavigate }: SimpleLightboxProps) {
  const [actionError, setActionError] = useState('')
  const antiDetection = useSettingsStore((s) => s.antiDetection)
  const src = images[currentIndex]

  const canGoLeft = currentIndex > 0
  const canGoRight = currentIndex < images.length - 1

  const goLeft = useCallback(() => {
    if (canGoLeft) onNavigate(currentIndex - 1)
  }, [canGoLeft, currentIndex, onNavigate])

  const goRight = useCallback(() => {
    if (canGoRight) onNavigate(currentIndex + 1)
  }, [canGoRight, currentIndex, onNavigate])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') goLeft()
      if (e.key === 'ArrowRight') goRight()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose, goLeft, goRight])

  const handleSave = async () => {
    setActionError('')
    try {
      const format = antiDetection ? 'jpeg' : 'png'
      const { dataUrl } = await convertImage(src, format, 95)
      requireExportSuccess(await window.api.exportImage(dataUrl, antiDetection ? neutralImageName('jpg') : `imagestudio-${Date.now()}.png`))
    } catch (err) { setActionError(err instanceof Error ? err.message : 'Export fehlgeschlagen') }
  }

  const handleCopy = async () => {
    try {
      const response = await fetch(src)
      const blob = await response.blob()
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
    } catch (err) { setActionError('Bild konnte nicht kopiert werden.'); logger.error('SimpleLightbox', 'Failed to copy image', err) }
  }

  return (
    <div
      className="fixed inset-0 z-[200] bg-surface-0/95 flex items-center justify-center animate-overlay-in"
      onClick={onClose}
      role="dialog" aria-modal="true" aria-label="Bildvorschau"
    >
      {actionError && <p role="alert" className="absolute bottom-5 inset-x-5 rounded-lg bg-surface-2 p-3 text-danger text-[13px]" onClick={(e) => e.stopPropagation()}>{actionError}</p>}
      {/* Top controls */}
      <div className="absolute top-5 right-5 flex gap-2 z-10">
        <button
          aria-label="Bild kopieren"
          onClick={(e) => { e.stopPropagation(); handleCopy() }}
          className="p-2.5 rounded-xl bg-white/8 hover:bg-white/15 border border-white/10 transition-colors backdrop-blur-md"
        >
          <Copy className="w-4 h-4 text-white" />
        </button>
        <button
          aria-label="Bild exportieren"
          onClick={(e) => { e.stopPropagation(); handleSave() }}
          className="p-2.5 rounded-xl bg-white/8 hover:bg-white/15 border border-white/10 transition-colors backdrop-blur-md"
        >
          <Download className="w-4 h-4 text-white" />
        </button>
        <button
          aria-label="Schließen"
          onClick={onClose}
          className="p-2.5 rounded-xl bg-white/8 hover:bg-white/15 border border-white/10 transition-colors backdrop-blur-md"
        >
          <X className="w-4 h-4 text-white" />
        </button>
      </div>

      {/* Counter */}
      {images.length > 1 && (
        <div className="absolute top-5 left-5 z-10 px-3 py-1.5 rounded-lg bg-white/8 border border-white/10 backdrop-blur-md">
          <span className="text-[13px] font-medium text-white/80">{currentIndex + 1} / {images.length}</span>
        </div>
      )}

      {/* Arrows */}
      {canGoLeft && (
        <button
          aria-label="Vorheriges Bild"
          onClick={(e) => { e.stopPropagation(); goLeft() }}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-2.5 rounded-xl bg-white/8 hover:bg-white/15 border border-white/10 transition-all backdrop-blur-md"
        >
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>
      )}
      {canGoRight && (
        <button
          aria-label="Nächstes Bild"
          onClick={(e) => { e.stopPropagation(); goRight() }}
          className="absolute right-4 top-1/2 -translate-y-1/2 z-10 p-2.5 rounded-xl bg-white/8 hover:bg-white/15 border border-white/10 transition-all backdrop-blur-md"
        >
          <ChevronRight className="w-5 h-5 text-white" />
        </button>
      )}

      {/* Image */}
      <img
        src={src}
        alt="Bild in voller Größe"
        className="max-w-[90vw] max-h-[88vh] object-contain rounded-xl shadow-[0_0_80px_rgba(0,0,0,0.4)]"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  )
}
