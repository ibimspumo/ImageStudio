import { useState, useRef, useEffect, useCallback } from 'react'
import { X, Undo2, Eraser } from 'lucide-react'
import { toDisplayUrl } from '../../stores/gallery-store'
import { PromptBar, type InpaintContext } from '../input/PromptBar'

interface InpaintModalProps {
  imageId: string
  filePath: string
  prompt: string
  model: string
  aspectRatio: string
  resolution: string
  workspaceId?: string
  onClose: () => void
}

export function InpaintModal({ imageId, filePath, prompt: sourcePrompt, model: sourceModel, aspectRatio, resolution, workspaceId, onClose }: InpaintModalProps) {
  const [brushSize, setBrushSize] = useState(30)
  const [isDrawing, setIsDrawing] = useState(false)
  const [undoStack, setUndoStack] = useState<ImageData[]>([])
  const [hasMask, setHasMask] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const lastPoint = useRef<{ x: number; y: number } | null>(null)

  const displayUrl = toDisplayUrl(filePath)

  // Sync canvas size with image
  const syncCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img) return
    canvas.width = img.clientWidth
    canvas.height = img.clientHeight
    canvas.style.width = `${img.clientWidth}px`
    canvas.style.height = `${img.clientHeight}px`
  }, [])

  useEffect(() => {
    const img = imgRef.current
    if (!img) return
    if (img.complete) syncCanvas()
    img.onload = syncCanvas
    window.addEventListener('resize', syncCanvas)
    return () => window.removeEventListener('resize', syncCanvas)
  }, [syncCanvas])

  const getCanvasPoint = (e: React.MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }
  }

  const drawLine = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    ctx.strokeStyle = 'rgba(255, 60, 60, 0.45)'
    ctx.lineWidth = brushSize
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.stroke()
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    const pt = getCanvasPoint(e)
    if (!pt) return
    // Save state for undo
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) {
      setUndoStack((prev) => [...prev, ctx.getImageData(0, 0, canvas.width, canvas.height)])
    }
    setIsDrawing(true)
    lastPoint.current = pt
    drawLine(pt, pt)
    setHasMask(true)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing) return
    const pt = getCanvasPoint(e)
    if (!pt || !lastPoint.current) return
    drawLine(lastPoint.current, pt)
    lastPoint.current = pt
  }

  const handleMouseUp = () => {
    setIsDrawing(false)
    lastPoint.current = null
  }

  const handleUndo = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || undoStack.length === 0) return
    const prev = undoStack[undoStack.length - 1]
    ctx.putImageData(prev, 0, 0)
    setUndoStack((s) => s.slice(0, -1))
    // Check if canvas is now empty
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    setHasMask(data.some((v, i) => i % 4 === 3 && v > 0))
  }, [undoStack])

  const handleClear = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setUndoStack([])
    setHasMask(false)
  }

  /**
   * Generate a composite image: original with bright green semi-transparent
   * overlay on the masked (painted) areas. This lets the AI visually see
   * exactly which part of the image to regenerate.
   */
  const generateMaskedOverlay = useCallback((): string | null => {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img) return null

    const w = img.naturalWidth
    const h = img.naturalHeight

    // 1. Create canvas at natural resolution with the original image
    const outCanvas = document.createElement('canvas')
    outCanvas.width = w
    outCanvas.height = h
    const outCtx = outCanvas.getContext('2d')
    if (!outCtx) return null

    // Draw the original image
    outCtx.drawImage(img, 0, 0, w, h)

    // 2. Scale the user's brush strokes to natural resolution into a temp canvas
    const maskCanvas = document.createElement('canvas')
    maskCanvas.width = w
    maskCanvas.height = h
    const maskCtx = maskCanvas.getContext('2d')
    if (!maskCtx) return null
    maskCtx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, w, h)

    // 3. Find all painted pixels and overlay them with bright green
    const maskData = maskCtx.getImageData(0, 0, w, h)
    const overlayData = outCtx.getImageData(0, 0, w, h)
    const md = maskData.data
    const od = overlayData.data

    for (let i = 0; i < md.length; i += 4) {
      // If this pixel was painted (has any alpha from the brush)
      if (md[i + 3] > 10) {
        const alpha = 0.5 // overlay strength
        // Bright green (0, 255, 100) blended over original
        od[i]     = Math.round(od[i]     * (1 - alpha) + 0   * alpha) // R
        od[i + 1] = Math.round(od[i + 1] * (1 - alpha) + 255 * alpha) // G
        od[i + 2] = Math.round(od[i + 2] * (1 - alpha) + 100 * alpha) // B
      }
    }
    outCtx.putImageData(overlayData, 0, 0)

    return outCanvas.toDataURL('image/png')
  }, [])

  // Create inpaint context for PromptBar
  const inpaintContext: InpaintContext = {
    imageId,
    filePath,
    sourcePrompt,
    getOverlayBase64: generateMaskedOverlay,
    onClose,
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); handleUndo() }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose, handleUndo])

  return (
    <div className="absolute inset-0 z-[70] bg-surface-0 flex flex-col">
      {/* Top bar */}
      <div className="shrink-0 flex items-center gap-4 px-5 py-3 border-b border-border-dim" style={{ paddingLeft: '80px' }}>
        <h2 className="text-[14px] font-semibold text-text-primary">Inpaint</h2>

        <div className="flex items-center gap-2 ml-4">
          <span className="text-[11px] text-text-muted">Brush</span>
          <input
            type="range"
            min="5"
            max="100"
            value={brushSize}
            onChange={(e) => setBrushSize(parseInt(e.target.value))}
            className="w-24 h-1 rounded-full appearance-none bg-surface-4 accent-accent-main cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-main"
          />
          <span className="text-[10px] text-text-muted w-8">{brushSize}px</span>
        </div>

        <button onClick={handleUndo} disabled={undoStack.length === 0} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface-3 border border-border-dim text-[11px] font-medium text-text-secondary hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-all">
          <Undo2 className="w-3.5 h-3.5" /> Undo
        </button>
        <button onClick={handleClear} disabled={!hasMask} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface-3 border border-border-dim text-[11px] font-medium text-text-secondary hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-all">
          <Eraser className="w-3.5 h-3.5" /> Clear
        </button>

        <div className="flex-1" />
        <button onClick={onClose} className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-3 transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Canvas area */}
      <div ref={containerRef} className="flex-1 flex items-center justify-center p-8 min-h-0 relative" style={{ cursor: `url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="${brushSize}" height="${brushSize}"><circle cx="${brushSize/2}" cy="${brushSize/2}" r="${brushSize/2 - 1}" fill="rgba(255,60,60,0.3)" stroke="white" stroke-width="1"/></svg>') ${brushSize/2} ${brushSize/2}, crosshair` }}>
        <div className="relative inline-block max-w-full max-h-full">
          <img
            ref={imgRef}
            src={displayUrl}
            alt="Source"
            className="max-w-full max-h-[60vh] object-contain rounded-xl"
            draggable={false}
          />
          <canvas
            ref={canvasRef}
            className="absolute top-0 left-0 rounded-xl"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />
        </div>
      </div>

      {/* Bottom: PromptBar instead of simple input */}
      <div className="shrink-0 border-t border-border-dim">
        <PromptBar
          inpaintContext={inpaintContext}
          initialModels={[sourceModel]}
        />
      </div>
    </div>
  )
}
