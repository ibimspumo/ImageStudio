import { useState, useRef, useEffect, useCallback } from 'react'
import { X, Crop, Check } from 'lucide-react'
import { cn } from '../../lib/utils'

interface CropRect {
  x: number
  y: number
  w: number
  h: number
}

type DragMode =
  | 'none'
  | 'draw'
  | 'move'
  | 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

interface CropModalProps {
  imageSrc: string
  sourceImageId: string
  onCrop: (base64: string, sourceImageId: string) => void
  onClose: () => void
}

const MIN_SIZE = 20

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val))
}

export function CropModal({ imageSrc, sourceImageId, onCrop, onClose }: CropModalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  const [imgLoaded, setImgLoaded] = useState(false)
  // Image rect relative to the container (not viewport)
  const [imgRect, setImgRect] = useState({ x: 0, y: 0, w: 0, h: 0 })
  const [naturalDims, setNaturalDims] = useState({ w: 0, h: 0 })

  // Crop rect in image-relative coordinates (0..imgRect.w, 0..imgRect.h)
  const [crop, setCrop] = useState<CropRect | null>(null)
  const [dragMode, setDragMode] = useState<DragMode>('none')
  const dragStart = useRef({ mx: 0, my: 0, rect: { x: 0, y: 0, w: 0, h: 0 } })

  // Measure image position relative to container
  const measureImage = useCallback(() => {
    const img = imgRef.current
    const container = containerRef.current
    if (!img || !container) return
    const imgR = img.getBoundingClientRect()
    const contR = container.getBoundingClientRect()
    setImgRect({
      x: imgR.left - contR.left,
      y: imgR.top - contR.top,
      w: imgR.width,
      h: imgR.height,
    })
    setNaturalDims({ w: img.naturalWidth, h: img.naturalHeight })
  }, [])

  useEffect(() => {
    if (imgLoaded) measureImage()
    window.addEventListener('resize', measureImage)
    return () => window.removeEventListener('resize', measureImage)
  }, [imgLoaded, measureImage])

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Enter' && crop && crop.w >= MIN_SIZE && crop.h >= MIN_SIZE) handleConfirm()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  })

  // Convert mouse event to image-relative coords (0..imgRect.w, 0..imgRect.h)
  const toImgCoords = useCallback((e: React.MouseEvent) => {
    const container = containerRef.current
    if (!container) return { x: 0, y: 0 }
    const contR = container.getBoundingClientRect()
    const mouseInContainer = {
      x: e.clientX - contR.left,
      y: e.clientY - contR.top,
    }
    return {
      x: clamp(mouseInContainer.x - imgRect.x, 0, imgRect.w),
      y: clamp(mouseInContainer.y - imgRect.y, 0, imgRect.h),
    }
  }, [imgRect])

  // Check if mouse is within the image area
  const isInsideImage = useCallback((e: React.MouseEvent) => {
    const container = containerRef.current
    if (!container) return false
    const contR = container.getBoundingClientRect()
    const mx = e.clientX - contR.left
    const my = e.clientY - contR.top
    return mx >= imgRect.x && mx <= imgRect.x + imgRect.w &&
           my >= imgRect.y && my <= imgRect.y + imgRect.h
  }, [imgRect])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()

    if (!isInsideImage(e)) return
    const pos = toImgCoords(e)

    if (!crop) {
      setDragMode('draw')
      dragStart.current = { mx: pos.x, my: pos.y, rect: { x: pos.x, y: pos.y, w: 0, h: 0 } }
      setCrop({ x: pos.x, y: pos.y, w: 0, h: 0 })
      return
    }

    // Check resize handles
    const hSize = 10
    const c = crop
    const handles: { mode: DragMode; cx: number; cy: number }[] = [
      { mode: 'nw', cx: c.x, cy: c.y },
      { mode: 'n',  cx: c.x + c.w / 2, cy: c.y },
      { mode: 'ne', cx: c.x + c.w, cy: c.y },
      { mode: 'e',  cx: c.x + c.w, cy: c.y + c.h / 2 },
      { mode: 'se', cx: c.x + c.w, cy: c.y + c.h },
      { mode: 's',  cx: c.x + c.w / 2, cy: c.y + c.h },
      { mode: 'sw', cx: c.x, cy: c.y + c.h },
      { mode: 'w',  cx: c.x, cy: c.y + c.h / 2 },
    ]

    for (const h of handles) {
      if (Math.abs(pos.x - h.cx) < hSize && Math.abs(pos.y - h.cy) < hSize) {
        setDragMode(h.mode)
        dragStart.current = { mx: pos.x, my: pos.y, rect: { ...c } }
        return
      }
    }

    // Inside crop — move
    if (pos.x >= c.x && pos.x <= c.x + c.w && pos.y >= c.y && pos.y <= c.y + c.h) {
      setDragMode('move')
      dragStart.current = { mx: pos.x, my: pos.y, rect: { ...c } }
      return
    }

    // Outside crop — draw new
    setDragMode('draw')
    dragStart.current = { mx: pos.x, my: pos.y, rect: { x: pos.x, y: pos.y, w: 0, h: 0 } }
    setCrop({ x: pos.x, y: pos.y, w: 0, h: 0 })
  }, [crop, isInsideImage, toImgCoords])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragMode === 'none') return
    e.preventDefault()
    const pos = toImgCoords(e)
    const { mx, my, rect } = dragStart.current
    const dx = pos.x - mx
    const dy = pos.y - my
    const maxW = imgRect.w
    const maxH = imgRect.h

    if (dragMode === 'draw') {
      setCrop({
        x: Math.min(mx, pos.x),
        y: Math.min(my, pos.y),
        w: Math.abs(pos.x - mx),
        h: Math.abs(pos.y - my),
      })
      return
    }

    if (dragMode === 'move') {
      setCrop({
        x: clamp(rect.x + dx, 0, maxW - rect.w),
        y: clamp(rect.y + dy, 0, maxH - rect.h),
        w: rect.w,
        h: rect.h,
      })
      return
    }

    // Resize
    let { x, y, w, h } = rect
    const applyDx = (side: 'left' | 'right') => {
      if (side === 'left') {
        const newX = clamp(x + dx, 0, x + w - MIN_SIZE)
        w = w - (newX - x)
        x = newX
      } else {
        w = clamp(w + dx, MIN_SIZE, maxW - x)
      }
    }
    const applyDy = (side: 'top' | 'bottom') => {
      if (side === 'top') {
        const newY = clamp(y + dy, 0, y + h - MIN_SIZE)
        h = h - (newY - y)
        y = newY
      } else {
        h = clamp(h + dy, MIN_SIZE, maxH - y)
      }
    }

    switch (dragMode) {
      case 'nw': applyDx('left'); applyDy('top'); break
      case 'n': applyDy('top'); break
      case 'ne': applyDx('right'); applyDy('top'); break
      case 'e': applyDx('right'); break
      case 'se': applyDx('right'); applyDy('bottom'); break
      case 's': applyDy('bottom'); break
      case 'sw': applyDx('left'); applyDy('bottom'); break
      case 'w': applyDx('left'); break
    }
    setCrop({ x, y, w, h })
  }, [dragMode, imgRect, toImgCoords])

  const handleMouseUp = useCallback(() => {
    if (dragMode === 'draw' && crop && crop.w < MIN_SIZE && crop.h < MIN_SIZE) {
      setCrop(null)
    }
    setDragMode('none')
  }, [dragMode, crop])

  const handleConfirm = useCallback(() => {
    if (!crop || crop.w < MIN_SIZE || crop.h < MIN_SIZE) return
    const img = imgRef.current
    if (!img) return

    const scaleX = naturalDims.w / imgRect.w
    const scaleY = naturalDims.h / imgRect.h
    const sx = Math.round(crop.x * scaleX)
    const sy = Math.round(crop.y * scaleY)
    const sw = Math.round(crop.w * scaleX)
    const sh = Math.round(crop.h * scaleY)

    const maxDim = 1000
    const longestSide = Math.max(sw, sh)
    const outputScale = longestSide > maxDim ? maxDim / longestSide : 1
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(sw * outputScale)
    canvas.height = Math.round(sh * outputScale)

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)

    const base64 = canvas.toDataURL('image/jpeg', 0.75)
    onCrop(base64, sourceImageId)
  }, [crop, imgRect, naturalDims, sourceImageId, onCrop])

  const getCursor = (): string => {
    if (dragMode === 'draw') return 'crosshair'
    if (dragMode === 'move') return 'grabbing'
    if (dragMode !== 'none') return `${dragMode}-resize`
    return 'crosshair'
  }

  const cropPixels = crop && imgRect.w > 0 ? {
    w: Math.round(crop.w * (naturalDims.w / imgRect.w)),
    h: Math.round(crop.h * (naturalDims.h / imgRect.h)),
  } : null

  const hasCrop = crop && crop.w >= MIN_SIZE && crop.h >= MIN_SIZE

  return (
    <div
      className="absolute inset-0 z-[70] bg-black/92 backdrop-blur-sm flex flex-col animate-overlay-in"
      style={{ cursor: getCursor() }}
    >
      {/* Top bar */}
      <div className="shrink-0 h-12 flex items-center justify-between px-5 z-10">
        <div className="flex items-center gap-2">
          <Crop className="w-4 h-4 text-accent-main" />
          <span className="text-[13px] font-medium text-text-secondary">Crop to Reference</span>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Image + crop area — this is the coordinate reference */}
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center p-8 relative select-none overflow-hidden"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        <img
          ref={imgRef}
          src={imageSrc}
          alt="Crop"
          className="max-w-[85vw] max-h-[70vh] object-contain rounded-lg"
          draggable={false}
          onLoad={() => setImgLoaded(true)}
        />

        {/* Dim overlay — 4 rectangles around the crop, positioned relative to container */}
        {hasCrop && imgLoaded && (
          <>
            {/* Top */}
            <div
              className="absolute bg-black/60 pointer-events-none"
              style={{
                left: imgRect.x, top: imgRect.y,
                width: imgRect.w, height: crop!.y,
              }}
            />
            {/* Bottom */}
            <div
              className="absolute bg-black/60 pointer-events-none"
              style={{
                left: imgRect.x, top: imgRect.y + crop!.y + crop!.h,
                width: imgRect.w, height: imgRect.h - crop!.y - crop!.h,
              }}
            />
            {/* Left */}
            <div
              className="absolute bg-black/60 pointer-events-none"
              style={{
                left: imgRect.x, top: imgRect.y + crop!.y,
                width: crop!.x, height: crop!.h,
              }}
            />
            {/* Right */}
            <div
              className="absolute bg-black/60 pointer-events-none"
              style={{
                left: imgRect.x + crop!.x + crop!.w, top: imgRect.y + crop!.y,
                width: imgRect.w - crop!.x - crop!.w, height: crop!.h,
              }}
            />

            {/* Crop border + glow */}
            <div
              className="absolute border-2 border-accent-main pointer-events-none"
              style={{
                left: imgRect.x + crop!.x,
                top: imgRect.y + crop!.y,
                width: crop!.w,
                height: crop!.h,
                boxShadow: '0 0 12px rgba(167,139,250,0.3), 0 0 30px rgba(167,139,250,0.1)',
              }}
            >
              {/* Rule of thirds */}
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/[0.06]" />
                <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/[0.06]" />
                <div className="absolute top-1/3 left-0 right-0 h-px bg-white/[0.06]" />
                <div className="absolute top-2/3 left-0 right-0 h-px bg-white/[0.06]" />
              </div>
            </div>

            {/* Resize handles */}
            {[
              { mode: 'nw', x: 0, y: 0, cursor: 'nw-resize' },
              { mode: 'n', x: crop!.w / 2, y: 0, cursor: 'n-resize' },
              { mode: 'ne', x: crop!.w, y: 0, cursor: 'ne-resize' },
              { mode: 'e', x: crop!.w, y: crop!.h / 2, cursor: 'e-resize' },
              { mode: 'se', x: crop!.w, y: crop!.h, cursor: 'se-resize' },
              { mode: 's', x: crop!.w / 2, y: crop!.h, cursor: 's-resize' },
              { mode: 'sw', x: 0, y: crop!.h, cursor: 'sw-resize' },
              { mode: 'w', x: 0, y: crop!.h / 2, cursor: 'w-resize' },
            ].map((h) => (
              <div
                key={h.mode}
                className="absolute w-2.5 h-2.5 bg-accent-main rounded-sm border border-accent-bright shadow-[0_0_6px_rgba(167,139,250,0.5)]"
                style={{
                  left: imgRect.x + crop!.x + h.x - 5,
                  top: imgRect.y + crop!.y + h.y - 5,
                  cursor: h.cursor,
                }}
              />
            ))}
          </>
        )}

        {/* Hint */}
        {!hasCrop && imgLoaded && (
          <div className="absolute bottom-12 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg bg-white/8 border border-white/10 backdrop-blur-md pointer-events-none animate-fade-up">
            <span className="text-[12px] text-white/70">Click and drag to select a crop area</span>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="shrink-0 h-14 flex items-center justify-between px-6 border-t border-border-dim bg-surface-1/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          {cropPixels && hasCrop ? (
            <>
              <span className="text-[12px] font-medium text-text-secondary tabular-nums">
                {cropPixels.w} × {cropPixels.h} px
              </span>
              <span className="text-[11px] text-text-muted">
                {((cropPixels.w * cropPixels.h) / 1_000_000).toFixed(1)} MP
              </span>
            </>
          ) : (
            <span className="text-[12px] text-text-muted">No selection</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-[12px] font-medium text-text-secondary hover:text-text-primary hover:bg-surface-3 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!hasCrop}
            className={cn(
              'flex items-center gap-2 px-4 py-1.5 rounded-lg text-[12px] font-medium transition-all',
              hasCrop
                ? 'bg-accent-main text-white hover:bg-accent-bright glow-accent shadow-lg'
                : 'bg-surface-3 text-text-muted cursor-not-allowed'
            )}
          >
            <Check className="w-3.5 h-3.5" />
            Use as Reference
          </button>
        </div>
      </div>
    </div>
  )
}
