import { useState, useEffect, useCallback } from 'react'
import { X, Download, Copy, ChevronLeft, ChevronRight } from 'lucide-react'

interface SimpleLightboxProps {
  images: string[]
  currentIndex: number
  onClose: () => void
  onNavigate: (index: number) => void
}

export function SimpleLightbox({ images, currentIndex, onClose, onNavigate }: SimpleLightboxProps) {
  const [hovered, setHovered] = useState(false)
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
    await window.api.exportImage(src, `imagestudio-${Date.now()}.png`)
  }

  const handleCopy = async () => {
    try {
      const response = await fetch(src)
      const blob = await response.blob()
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
    } catch { /* silent */ }
  }

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center animate-overlay-in"
      onClick={onClose}
      onMouseMove={() => setHovered(true)}
    >
      {/* Top controls */}
      <div className="absolute top-5 right-5 flex gap-2 z-10">
        <button
          onClick={(e) => { e.stopPropagation(); handleCopy() }}
          className="p-2.5 rounded-xl bg-white/8 hover:bg-white/15 border border-white/10 transition-colors backdrop-blur-md"
        >
          <Copy className="w-4 h-4 text-white" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); handleSave() }}
          className="p-2.5 rounded-xl bg-white/8 hover:bg-white/15 border border-white/10 transition-colors backdrop-blur-md"
        >
          <Download className="w-4 h-4 text-white" />
        </button>
        <button
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
      {canGoLeft && hovered && (
        <button
          onClick={(e) => { e.stopPropagation(); goLeft() }}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-2.5 rounded-xl bg-white/8 hover:bg-white/15 border border-white/10 transition-all backdrop-blur-md"
        >
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>
      )}
      {canGoRight && hovered && (
        <button
          onClick={(e) => { e.stopPropagation(); goRight() }}
          className="absolute right-4 top-1/2 -translate-y-1/2 z-10 p-2.5 rounded-xl bg-white/8 hover:bg-white/15 border border-white/10 transition-all backdrop-blur-md"
        >
          <ChevronRight className="w-5 h-5 text-white" />
        </button>
      )}

      {/* Image */}
      <img
        src={src}
        alt="Full size"
        className="max-w-[90vw] max-h-[88vh] object-contain rounded-xl shadow-[0_0_80px_rgba(0,0,0,0.4)]"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  )
}
