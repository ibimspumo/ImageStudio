import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { AspectRatio } from '../types/api'

export interface CanvasLayer {
  id: string
  name: string
  visible: boolean
  opacity: number
}

export type CanvasTool = 'brush' | 'eraser' | 'rectangle' | 'circle' | 'line'
export type CanvasMode = 'simple' | 'expert'

export interface ColorMapping {
  color: string
  description: string
  attachments: string[]
}

interface CanvasState {
  isOpen: boolean
  aspectRatio: AspectRatio
  customRatio: string
  canvasWidth: number
  canvasHeight: number

  layers: CanvasLayer[]
  activeLayerId: string | null

  activeTool: CanvasTool
  brushSize: number
  brushColor: string
  eraserSize: number
  shapeFill: boolean

  undoStackSize: number
  redoStackSize: number

  mode: CanvasMode
  colorMappings: ColorMapping[]
  generalPrompt: string

  open: () => void
  close: () => void
  setAspectRatio: (ratio: AspectRatio, custom?: string) => void
  recalcDimensions: () => void
  addLayer: () => void
  removeLayer: (id: string) => void
  reorderLayers: (fromIndex: number, toIndex: number) => void
  setActiveLayer: (id: string) => void
  toggleLayerVisibility: (id: string) => void
  setLayerOpacity: (id: string, opacity: number) => void
  renameLayer: (id: string, name: string) => void
  setTool: (tool: CanvasTool) => void
  setBrushSize: (size: number) => void
  setBrushColor: (color: string) => void
  setEraserSize: (size: number) => void
  setShapeFill: (fill: boolean) => void
  setUndoRedoSize: (undo: number, redo: number) => void
  setMode: (mode: CanvasMode) => void
  setColorMappings: (mappings: ColorMapping[]) => void
  updateColorDescription: (color: string, description: string) => void
  updateColorAttachments: (color: string, attachments: string[]) => void
  setGeneralPrompt: (prompt: string) => void
  resetCanvas: () => void
}

const BASE_DIMENSION = 1024

function computeDimensions(ratio: AspectRatio, customRatio: string): { width: number; height: number } {
  let w = 1
  let h = 1

  const ratioStr = ratio === 'custom' ? customRatio : ratio
  const parts = ratioStr.split(':')
  if (parts.length === 2) {
    w = parseInt(parts[0]) || 1
    h = parseInt(parts[1]) || 1
  }

  if (w >= h) {
    return { width: BASE_DIMENSION, height: Math.round(BASE_DIMENSION * (h / w)) }
  } else {
    return { width: Math.round(BASE_DIMENSION * (w / h)), height: BASE_DIMENSION }
  }
}

const defaultLayerId = nanoid()

export const useCanvasStore = create<CanvasState>((set, get) => ({
  isOpen: false,
  aspectRatio: '1:1',
  customRatio: '4:3',
  canvasWidth: BASE_DIMENSION,
  canvasHeight: BASE_DIMENSION,

  layers: [{ id: defaultLayerId, name: 'Layer 1', visible: true, opacity: 1 }],
  activeLayerId: defaultLayerId,

  activeTool: 'brush',
  brushSize: 20,
  brushColor: '#FF0000',
  eraserSize: 20,
  shapeFill: false,

  undoStackSize: 0,
  redoStackSize: 0,

  mode: 'simple',
  colorMappings: [],
  generalPrompt: '',

  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),

  setAspectRatio: (ratio, custom) => {
    const customRatio = custom || get().customRatio
    const dims = computeDimensions(ratio, customRatio)
    set({ aspectRatio: ratio, customRatio, canvasWidth: dims.width, canvasHeight: dims.height })
  },

  recalcDimensions: () => {
    const { aspectRatio, customRatio } = get()
    const dims = computeDimensions(aspectRatio, customRatio)
    set({ canvasWidth: dims.width, canvasHeight: dims.height })
  },

  addLayer: () => {
    const { layers } = get()
    if (layers.length >= 8) return
    const id = nanoid()
    const name = `Layer ${layers.length + 1}`
    set({
      layers: [...layers, { id, name, visible: true, opacity: 1 }],
      activeLayerId: id,
    })
  },

  removeLayer: (id) => {
    const { layers, activeLayerId } = get()
    if (layers.length <= 1) return
    const idx = layers.findIndex((l) => l.id === id)
    const newLayers = layers.filter((l) => l.id !== id)
    let newActive = activeLayerId
    if (activeLayerId === id) {
      newActive = newLayers[Math.min(idx, newLayers.length - 1)]?.id || null
    }
    set({ layers: newLayers, activeLayerId: newActive })
  },

  reorderLayers: (fromIndex, toIndex) => {
    const { layers } = get()
    const newLayers = [...layers]
    const [moved] = newLayers.splice(fromIndex, 1)
    newLayers.splice(toIndex, 0, moved)
    set({ layers: newLayers })
  },

  setActiveLayer: (id) => set({ activeLayerId: id }),

  toggleLayerVisibility: (id) => {
    set({
      layers: get().layers.map((l) =>
        l.id === id ? { ...l, visible: !l.visible } : l
      ),
    })
  },

  setLayerOpacity: (id, opacity) => {
    set({
      layers: get().layers.map((l) =>
        l.id === id ? { ...l, opacity } : l
      ),
    })
  },

  renameLayer: (id, name) => {
    set({
      layers: get().layers.map((l) =>
        l.id === id ? { ...l, name } : l
      ),
    })
  },

  setTool: (tool) => set({ activeTool: tool }),
  setBrushSize: (size) => set({ brushSize: size }),
  setBrushColor: (color) => set({ brushColor: color }),
  setEraserSize: (size) => set({ eraserSize: size }),
  setShapeFill: (fill) => set({ shapeFill: fill }),
  setUndoRedoSize: (undo, redo) => set({ undoStackSize: undo, redoStackSize: redo }),

  setMode: (mode) => set({ mode }),
  setColorMappings: (mappings) => set({ colorMappings: mappings }),
  updateColorDescription: (color, description) => {
    set({
      colorMappings: get().colorMappings.map((m) =>
        m.color === color ? { ...m, description } : m
      ),
    })
  },
  updateColorAttachments: (color, attachments) => {
    set({
      colorMappings: get().colorMappings.map((m) =>
        m.color === color ? { ...m, attachments } : m
      ),
    })
  },
  setGeneralPrompt: (prompt) => set({ generalPrompt: prompt }),

  resetCanvas: () => {
    const id = nanoid()
    set({
      layers: [{ id, name: 'Layer 1', visible: true, opacity: 1 }],
      activeLayerId: id,
      undoStackSize: 0,
      redoStackSize: 0,
      colorMappings: [],
      generalPrompt: '',
    })
  },
}))
