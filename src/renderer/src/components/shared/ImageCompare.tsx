import { useState, useRef, useCallback, useEffect } from 'react'
import { X, Columns2, SplitSquareHorizontal } from 'lucide-react'
import { type GalleryImage, toDisplayUrl } from '../../stores/gallery-store'
import { getModelName } from '../../types/api'
import { cn } from '../../lib/utils'

interface ImageCompareProps {
  imageA: GalleryImage
  imageB: GalleryImage
  onClose: () => void
}

type CompareMode = 'slider' | 'side-by-side'

export function ImageCompare({ imageA, imageB, onClose }: ImageCompareProps) {
  const [mode, setMode] = useState<CompareMode>('slider')
  const [sliderPos, setSliderPos] = useState(50)
  const [isDragging, setIsDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const urlA = toDisplayUrl(imageA.filePath)
  const urlB = toDisplayUrl(imageB.filePath)

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    setSliderPos(Math.max(2, Math.min(98, x)))
  }, [isDragging])

  const handleMouseUp = useCallback(() => setIsDragging(false), [])

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDragging, handleMouseMove, handleMouseUp])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div className="absolute inset-0 z-[60] bg-black/90 backdrop-blur-md flex flex-col animate-overlay-in" onClick={onClose}>
      {/* Top bar */}
      <div className="shrink-0 flex items-center justify-between px-5 py-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMode('slider')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-all',
              mode === 'slider'
                ? 'bg-accent-dim border-accent-main/30 text-accent-main'
                : 'bg-white/5 border-white/10 text-white/60 hover:text-white/80'
            )}
          >
            <SplitSquareHorizontal className="w-3.5 h-3.5" /> Slider
          </button>
          <button
            onClick={() => setMode('side-by-side')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-all',
              mode === 'side-by-side'
                ? 'bg-accent-dim border-accent-main/30 text-accent-main'
                : 'bg-white/5 border-white/10 text-white/60 hover:text-white/80'
            )}
          >
            <Columns2 className="w-3.5 h-3.5" /> Side by Side
          </button>
        </div>

        {/* Resolution labels */}
        <div className="flex items-center gap-4 text-[10px] text-white/50">
          <span>A: {imageA.resolution} ({getModelName(imageA.model)})</span>
          <span>B: {imageB.resolution} ({getModelName(imageB.model)})</span>
        </div>

        <button onClick={onClose} className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Comparison area */}
      <div className="flex-1 flex items-center justify-center p-6 min-h-0" onClick={(e) => e.stopPropagation()}>
        {mode === 'slider' ? (
          /* Slider mode: both images fill the same container identically */
          <div
            ref={containerRef}
            className="relative max-w-[80vw] max-h-[75vh] select-none overflow-hidden rounded-xl"
            style={{ cursor: isDragging ? 'col-resize' : 'default' }}
          >
            {/* Image B (full, underneath) — defines the container size */}
            <img
              src={urlB}
              alt="Image B"
              className="block max-w-[80vw] max-h-[75vh] object-contain"
              draggable={false}
            />

            {/* Image A (clipped overlay) — stretched to exactly match container */}
            <div
              className="absolute inset-0 overflow-hidden"
              style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
            >
              <img
                src={urlA}
                alt="Image A"
                className="absolute inset-0 w-full h-full object-fill"
                draggable={false}
              />
            </div>

            {/* Slider handle */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_8px_rgba(255,255,255,0.5)] cursor-col-resize z-10"
              style={{ left: `${sliderPos}%` }}
              onMouseDown={() => setIsDragging(true)}
            >
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 border-2 border-white shadow-lg flex items-center justify-center">
                <div className="flex gap-0.5">
                  <div className="w-0.5 h-3 bg-black/40 rounded-full" />
                  <div className="w-0.5 h-3 bg-black/40 rounded-full" />
                </div>
              </div>
            </div>

            {/* Labels */}
            <div className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-sm text-[11px] font-medium text-white/80 z-20">
              {imageA.resolution} · {getModelName(imageA.model)}
            </div>
            <div className="absolute top-3 right-3 px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-sm text-[11px] font-medium text-white/80 z-20">
              {imageB.resolution} · {getModelName(imageB.model)}
            </div>
          </div>
        ) : (
          /* Side-by-side: both images constrained to same max height */
          <div className="flex gap-4 max-w-[90vw] max-h-[75vh] items-center">
            <div className="flex-1 flex flex-col items-center gap-2 min-w-0">
              <img src={urlA} alt="Image A" className="max-h-[68vh] max-w-full object-contain rounded-xl" draggable={false} />
              <span className="px-2.5 py-1 rounded-lg bg-white/8 text-[11px] font-medium text-white/80">
                {imageA.resolution} · {getModelName(imageA.model)}
              </span>
            </div>
            <div className="flex-1 flex flex-col items-center gap-2 min-w-0">
              <img src={urlB} alt="Image B" className="max-h-[68vh] max-w-full object-contain rounded-xl" draggable={false} />
              <span className="px-2.5 py-1 rounded-lg bg-white/8 text-[11px] font-medium text-white/80">
                {imageB.resolution} · {getModelName(imageB.model)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
