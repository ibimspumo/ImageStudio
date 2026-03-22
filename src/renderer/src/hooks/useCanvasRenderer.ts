import { useRef, useCallback, useEffect } from 'react'
import { useCanvasStore, type CanvasLayer, type CanvasTool } from '../stores/canvas-store'

interface UndoEntry {
  layerId: string
  imageData: ImageData
}

export function useCanvasRenderer() {
  const displayCanvasRef = useRef<HTMLCanvasElement>(null)

  // Offscreen canvases keyed by layer id
  const offscreenCanvasesRef = useRef<Map<string, HTMLCanvasElement>>(new Map())
  const undoStackRef = useRef<UndoEntry[]>([])
  const redoStackRef = useRef<UndoEntry[]>([])

  const isDrawingRef = useRef(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)
  const shapeStartRef = useRef<{ x: number; y: number } | null>(null)
  const preShapeImageRef = useRef<ImageData | null>(null)

  const { canvasWidth, canvasHeight, layers, setUndoRedoSize } = useCanvasStore()

  // Get or create offscreen canvas for a layer
  const getOffscreen = useCallback((layerId: string): HTMLCanvasElement => {
    let canvas = offscreenCanvasesRef.current.get(layerId)
    if (!canvas || canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
      const newCanvas = document.createElement('canvas')
      newCanvas.width = canvasWidth
      newCanvas.height = canvasHeight
      if (canvas && (canvas.width === canvasWidth || canvas.height === canvasHeight)) {
        // Same size, shouldn't happen but just in case
      } else if (canvas) {
        // Size changed — copy old content scaled
        const ctx = newCanvas.getContext('2d')!
        ctx.drawImage(canvas, 0, 0, canvasWidth, canvasHeight)
      }
      offscreenCanvasesRef.current.set(layerId, newCanvas)
      canvas = newCanvas
    }
    return canvas
  }, [canvasWidth, canvasHeight])

  // Ensure all layers have offscreen canvases & clean up removed layers
  useEffect(() => {
    const currentIds = new Set(layers.map((l) => l.id))
    // Create missing
    for (const layer of layers) {
      getOffscreen(layer.id)
    }
    // Remove stale
    for (const id of offscreenCanvasesRef.current.keys()) {
      if (!currentIds.has(id)) {
        offscreenCanvasesRef.current.delete(id)
      }
    }
  }, [layers, getOffscreen])

  // Composite all visible layers onto display canvas
  const composite = useCallback(() => {
    const display = displayCanvasRef.current
    if (!display) return
    const ctx = display.getContext('2d')!
    ctx.clearRect(0, 0, display.width, display.height)

    for (const layer of layers) {
      if (!layer.visible) continue
      const offscreen = offscreenCanvasesRef.current.get(layer.id)
      if (!offscreen) continue
      ctx.globalAlpha = layer.opacity
      ctx.drawImage(offscreen, 0, 0)
    }
    ctx.globalAlpha = 1
  }, [layers])

  // Draw a line segment on a specific layer's offscreen canvas
  const drawLine = useCallback((
    layerId: string,
    from: { x: number; y: number },
    to: { x: number; y: number },
    tool: CanvasTool,
    color: string,
    size: number
  ) => {
    const offscreen = getOffscreen(layerId)
    const ctx = offscreen.getContext('2d')!

    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.strokeStyle = 'rgba(0,0,0,1)'
    } else {
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = color
    }

    ctx.lineWidth = size
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.stroke()
    ctx.globalCompositeOperation = 'source-over'
  }, [getOffscreen])

  // Draw shape on a layer
  const drawShape = useCallback((
    layerId: string,
    tool: CanvasTool,
    start: { x: number; y: number },
    end: { x: number; y: number },
    color: string,
    size: number,
    fill: boolean,
    preview: boolean = false
  ) => {
    const offscreen = getOffscreen(layerId)
    const ctx = offscreen.getContext('2d')!

    if (preview && preShapeImageRef.current) {
      ctx.putImageData(preShapeImageRef.current, 0, 0)
    }

    ctx.strokeStyle = color
    ctx.fillStyle = color
    ctx.lineWidth = size
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    if (tool === 'rectangle') {
      const x = Math.min(start.x, end.x)
      const y = Math.min(start.y, end.y)
      const w = Math.abs(end.x - start.x)
      const h = Math.abs(end.y - start.y)
      if (fill) {
        ctx.fillRect(x, y, w, h)
      } else {
        ctx.strokeRect(x, y, w, h)
      }
    } else if (tool === 'circle') {
      const cx = (start.x + end.x) / 2
      const cy = (start.y + end.y) / 2
      const rx = Math.abs(end.x - start.x) / 2
      const ry = Math.abs(end.y - start.y) / 2
      ctx.beginPath()
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
      if (fill) {
        ctx.fill()
      } else {
        ctx.stroke()
      }
    } else if (tool === 'line') {
      ctx.beginPath()
      ctx.moveTo(start.x, start.y)
      ctx.lineTo(end.x, end.y)
      ctx.stroke()
    }
  }, [getOffscreen])

  // Save current layer state for undo
  const pushUndo = useCallback((layerId: string) => {
    const offscreen = getOffscreen(layerId)
    const ctx = offscreen.getContext('2d')!
    const imageData = ctx.getImageData(0, 0, offscreen.width, offscreen.height)
    undoStackRef.current.push({ layerId, imageData })
    if (undoStackRef.current.length > 30) {
      undoStackRef.current.shift()
    }
    redoStackRef.current = []
    setUndoRedoSize(undoStackRef.current.length, 0)
  }, [getOffscreen, setUndoRedoSize])

  const undo = useCallback(() => {
    const entry = undoStackRef.current.pop()
    if (!entry) return

    const offscreen = offscreenCanvasesRef.current.get(entry.layerId)
    if (!offscreen) return

    const ctx = offscreen.getContext('2d')!
    // Save current state for redo
    const currentData = ctx.getImageData(0, 0, offscreen.width, offscreen.height)
    redoStackRef.current.push({ layerId: entry.layerId, imageData: currentData })

    ctx.putImageData(entry.imageData, 0, 0)
    setUndoRedoSize(undoStackRef.current.length, redoStackRef.current.length)
    composite()
  }, [composite, setUndoRedoSize])

  const redo = useCallback(() => {
    const entry = redoStackRef.current.pop()
    if (!entry) return

    const offscreen = offscreenCanvasesRef.current.get(entry.layerId)
    if (!offscreen) return

    const ctx = offscreen.getContext('2d')!
    const currentData = ctx.getImageData(0, 0, offscreen.width, offscreen.height)
    undoStackRef.current.push({ layerId: entry.layerId, imageData: currentData })

    ctx.putImageData(entry.imageData, 0, 0)
    setUndoRedoSize(undoStackRef.current.length, redoStackRef.current.length)
    composite()
  }, [composite, setUndoRedoSize])

  const clearLayer = useCallback((layerId: string) => {
    const offscreen = getOffscreen(layerId)
    const ctx = offscreen.getContext('2d')!
    // Push undo before clearing
    pushUndo(layerId)
    ctx.clearRect(0, 0, offscreen.width, offscreen.height)
    composite()
  }, [getOffscreen, pushUndo, composite])

  const clearAll = useCallback(() => {
    for (const layer of layers) {
      const offscreen = offscreenCanvasesRef.current.get(layer.id)
      if (offscreen) {
        const ctx = offscreen.getContext('2d')!
        ctx.clearRect(0, 0, offscreen.width, offscreen.height)
      }
    }
    undoStackRef.current = []
    redoStackRef.current = []
    setUndoRedoSize(0, 0)
    composite()
  }, [layers, composite, setUndoRedoSize])

  // Mouse event handlers for drawing
  const handlePointerDown = useCallback((
    canvasX: number,
    canvasY: number,
    activeLayerId: string | null,
    tool: CanvasTool,
    color: string,
    brushSize: number,
    eraserSize: number,
    shapeFill: boolean
  ) => {
    if (!activeLayerId) return
    const layer = layers.find((l) => l.id === activeLayerId)
    if (!layer?.visible) return

    isDrawingRef.current = true
    const pt = { x: canvasX, y: canvasY }

    if (tool === 'brush' || tool === 'eraser') {
      pushUndo(activeLayerId)
      lastPointRef.current = pt
      const size = tool === 'eraser' ? eraserSize : brushSize
      drawLine(activeLayerId, pt, pt, tool, color, size)
      composite()
    } else {
      // Shape tool
      pushUndo(activeLayerId)
      shapeStartRef.current = pt
      const offscreen = getOffscreen(activeLayerId)
      const ctx = offscreen.getContext('2d')!
      preShapeImageRef.current = ctx.getImageData(0, 0, offscreen.width, offscreen.height)
    }
  }, [layers, pushUndo, drawLine, composite, getOffscreen])

  const handlePointerMove = useCallback((
    canvasX: number,
    canvasY: number,
    activeLayerId: string | null,
    tool: CanvasTool,
    color: string,
    brushSize: number,
    eraserSize: number,
    shapeFill: boolean
  ) => {
    if (!isDrawingRef.current || !activeLayerId) return

    const pt = { x: canvasX, y: canvasY }

    if (tool === 'brush' || tool === 'eraser') {
      if (!lastPointRef.current) return
      const size = tool === 'eraser' ? eraserSize : brushSize
      drawLine(activeLayerId, lastPointRef.current, pt, tool, color, size)
      lastPointRef.current = pt
      composite()
    } else {
      // Shape preview
      if (!shapeStartRef.current) return
      drawShape(activeLayerId, tool, shapeStartRef.current, pt, color, brushSize, shapeFill, true)
      composite()
    }
  }, [drawLine, drawShape, composite])

  const handlePointerUp = useCallback((
    canvasX: number,
    canvasY: number,
    activeLayerId: string | null,
    tool: CanvasTool,
    color: string,
    brushSize: number,
    _eraserSize: number,
    shapeFill: boolean
  ) => {
    if (!isDrawingRef.current) return
    isDrawingRef.current = false

    if ((tool === 'rectangle' || tool === 'circle' || tool === 'line') && shapeStartRef.current && activeLayerId) {
      const pt = { x: canvasX, y: canvasY }
      drawShape(activeLayerId, tool, shapeStartRef.current, pt, color, brushSize, shapeFill, true)
      composite()
    }

    lastPointRef.current = null
    shapeStartRef.current = null
    preShapeImageRef.current = null
  }, [drawShape, composite])

  // Export composite canvas as base64 PNG
  const exportComposite = useCallback((): string | null => {
    const exportCanvas = document.createElement('canvas')
    exportCanvas.width = canvasWidth
    exportCanvas.height = canvasHeight
    const ctx = exportCanvas.getContext('2d')!

    for (const layer of layers) {
      if (!layer.visible) continue
      const offscreen = offscreenCanvasesRef.current.get(layer.id)
      if (!offscreen) continue
      ctx.globalAlpha = layer.opacity
      ctx.drawImage(offscreen, 0, 0)
    }
    ctx.globalAlpha = 1

    return exportCanvas.toDataURL('image/png')
  }, [canvasWidth, canvasHeight, layers])

  // Detect unique colors on the composite canvas
  const detectColors = useCallback((maxColors: number = 12): string[] => {
    const exportCanvas = document.createElement('canvas')
    exportCanvas.width = canvasWidth
    exportCanvas.height = canvasHeight
    const ctx = exportCanvas.getContext('2d')!

    for (const layer of layers) {
      if (!layer.visible) continue
      const offscreen = offscreenCanvasesRef.current.get(layer.id)
      if (!offscreen) continue
      ctx.globalAlpha = layer.opacity
      ctx.drawImage(offscreen, 0, 0)
    }
    ctx.globalAlpha = 1

    const { data } = ctx.getImageData(0, 0, canvasWidth, canvasHeight)
    const step = Math.max(1, Math.floor(data.length / 4 / 50000))
    const colorCounts = new Map<string, { r: number; g: number; b: number; count: number }>()

    for (let i = 0; i < data.length; i += step * 4) {
      const a = data[i + 3]
      if (a < 64) continue // skip mostly transparent

      // Quantize to nearest 32 to group similar shades, clamp to 0–255
      const r = Math.min(255, Math.round(data[i] / 32) * 32)
      const g = Math.min(255, Math.round(data[i + 1] / 32) * 32)
      const b = Math.min(255, Math.round(data[i + 2] / 32) * 32)
      const key = `${r},${g},${b}`

      const existing = colorCounts.get(key)
      if (existing) {
        existing.count++
      } else {
        colorCounts.set(key, { r, g, b, count: 1 })
      }
    }

    // Sort by frequency
    const sorted = [...colorCounts.values()]
      .sort((a, b) => b.count - a.count)

    // De-duplicate similar colors using RGB distance
    const result: { r: number; g: number; b: number }[] = []
    for (const entry of sorted) {
      if (result.length >= maxColors) break
      const tooClose = result.some((ex) => {
        const dist = Math.sqrt(
          (entry.r - ex.r) ** 2 + (entry.g - ex.g) ** 2 + (entry.b - ex.b) ** 2
        )
        return dist < 80
      })
      if (!tooClose) result.push({ r: entry.r, g: entry.g, b: entry.b })
    }

    // Convert to hex
    const toHex = (n: number) => Math.min(255, n).toString(16).padStart(2, '0')
    return result.map(({ r, g, b }) => `#${toHex(r)}${toHex(g)}${toHex(b)}`)
  }, [canvasWidth, canvasHeight, layers])

  // Check if canvas has any content
  const hasContent = useCallback((): boolean => {
    for (const layer of layers) {
      const offscreen = offscreenCanvasesRef.current.get(layer.id)
      if (!offscreen) continue
      const ctx = offscreen.getContext('2d')!
      const data = ctx.getImageData(0, 0, offscreen.width, offscreen.height).data
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] > 0) return true
      }
    }
    return false
  }, [layers])

  return {
    displayCanvasRef,
    composite,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    undo,
    redo,
    clearLayer,
    clearAll,
    exportComposite,
    detectColors,
    hasContent,
    getOffscreen,
  }
}
