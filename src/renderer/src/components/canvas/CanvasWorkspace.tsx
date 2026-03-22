import { useState, useEffect, useCallback, useRef } from 'react'
import { useCanvasStore } from '../../stores/canvas-store'
import { useSharedCanvasRenderer } from './CanvasRendererContext'

// Hook to compute CSS display dimensions that fit the container
function useDisplaySize(
  containerRef: React.RefObject<HTMLDivElement | null>,
  canvasWidth: number,
  canvasHeight: number
): [number, number] {
  const [size, setSize] = useState<[number, number]>([canvasWidth, canvasHeight])

  useEffect(() => {
    const update = () => {
      const el = containerRef.current
      if (!el) return
      const padding = 48
      const maxW = el.clientWidth - padding
      const maxH = el.clientHeight - padding
      const scale = Math.min(maxW / canvasWidth, maxH / canvasHeight, 1)
      setSize([Math.round(canvasWidth * scale), Math.round(canvasHeight * scale)])
    }
    update()
    const observer = new ResizeObserver(update)
    if (containerRef.current) observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [containerRef, canvasWidth, canvasHeight])

  return size
}

export function CanvasWorkspace() {
  const canvasWidth = useCanvasStore((s) => s.canvasWidth)
  const canvasHeight = useCanvasStore((s) => s.canvasHeight)
  const activeLayerId = useCanvasStore((s) => s.activeLayerId)
  const activeTool = useCanvasStore((s) => s.activeTool)
  const brushColor = useCanvasStore((s) => s.brushColor)
  const brushSize = useCanvasStore((s) => s.brushSize)
  const eraserSize = useCanvasStore((s) => s.eraserSize)
  const shapeFill = useCanvasStore((s) => s.shapeFill)

  const { displayCanvasRef, composite, handlePointerDown, handlePointerMove, handlePointerUp } = useSharedCanvasRenderer()
  const containerRef = useRef<HTMLDivElement>(null)
  const [displayW, displayH] = useDisplaySize(containerRef, canvasWidth, canvasHeight)

  // Initial composite
  useEffect(() => {
    composite()
  }, [composite])

  const toCanvasCoords = useCallback((e: React.MouseEvent) => {
    const canvas = displayCanvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvasWidth / rect.width
    const scaleY = canvasHeight / rect.height
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
  }, [displayCanvasRef, canvasWidth, canvasHeight])

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const pt = toCanvasCoords(e)
    if (!pt) return
    handlePointerDown(pt.x, pt.y, activeLayerId, activeTool, brushColor, brushSize, eraserSize, shapeFill)
  }, [toCanvasCoords, handlePointerDown, activeLayerId, activeTool, brushColor, brushSize, eraserSize, shapeFill])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const pt = toCanvasCoords(e)
    if (!pt) return
    handlePointerMove(pt.x, pt.y, activeLayerId, activeTool, brushColor, brushSize, eraserSize, shapeFill)
  }, [toCanvasCoords, handlePointerMove, activeLayerId, activeTool, brushColor, brushSize, eraserSize, shapeFill])

  const onMouseUp = useCallback((e: React.MouseEvent) => {
    const pt = toCanvasCoords(e)
    if (!pt) return
    handlePointerUp(pt.x, pt.y, activeLayerId, activeTool, brushColor, brushSize, eraserSize, shapeFill)
  }, [toCanvasCoords, handlePointerUp, activeLayerId, activeTool, brushColor, brushSize, eraserSize, shapeFill])

  // Build cursor SVG
  const cursorSize = activeTool === 'eraser' ? eraserSize : brushSize
  const displayCursorSize = Math.max(4, Math.round(cursorSize * (displayW / canvasWidth)))
  const cursorColor = activeTool === 'eraser' ? 'rgba(255,255,255,0.5)' : brushColor
  const cursorSvg = `url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="${displayCursorSize}" height="${displayCursorSize}"><circle cx="${displayCursorSize/2}" cy="${displayCursorSize/2}" r="${displayCursorSize/2 - 1}" fill="${encodeURIComponent(cursorColor)}33" stroke="white" stroke-width="1"/></svg>') ${displayCursorSize/2} ${displayCursorSize/2}, crosshair`

  return (
    <div
      ref={containerRef}
      className="flex-1 flex items-center justify-center p-6 min-h-0 relative overflow-hidden"
    >
      {/* Checkerboard background */}
      <div
        className="relative rounded-xl overflow-hidden shadow-lg"
        style={{ width: displayW, height: displayH }}
      >
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `linear-gradient(45deg, #1a1a1a 25%, transparent 25%),
              linear-gradient(-45deg, #1a1a1a 25%, transparent 25%),
              linear-gradient(45deg, transparent 75%, #1a1a1a 75%),
              linear-gradient(-45deg, transparent 75%, #1a1a1a 75%)`,
            backgroundSize: '16px 16px',
            backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
            backgroundColor: '#222',
          }}
        />
        <canvas
          ref={displayCanvasRef}
          width={canvasWidth}
          height={canvasHeight}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          className="absolute inset-0 rounded-xl"
          style={{
            width: displayW,
            height: displayH,
            cursor: cursorSvg,
          }}
        />
      </div>
    </div>
  )
}
