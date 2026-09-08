import type { useCanvasRenderer } from '../hooks/useCanvasRenderer'
import { useCanvasStore, type CanvasTool } from '../stores/canvas-store'
import { useGalleryStore } from '../stores/gallery-store'
import { useCollectionsStore } from '../stores/collections-store'
import { compressImage } from './image-utils'
import { array, bool, choice, integer, object, str, validate, type Schema } from '../automation/schema'

type Renderer = ReturnType<typeof useCanvasRenderer>
let current: { renderer: Renderer; width: number; height: number; layers: unknown } | undefined

/** The bridge references the mounted UI renderer: there is no second canvas or drawing history. */
export function registerCanvasRenderer(renderer: Renderer): () => void {
  const state = useCanvasStore.getState()
  const registration = { renderer, width: state.canvasWidth, height: state.canvasHeight, layers: state.layers }
  current = registration
  return () => { if (current === registration) current = undefined }
}

export async function getCanvasRenderer(): Promise<Renderer> {
  if (!useCanvasStore.getState().isOpen) useCanvasStore.getState().open()
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    const state = useCanvasStore.getState()
    if (!state.isOpen) throw new Error('Canvas was closed before the operation could run. Open it and retry.')
    if (current && current.width === state.canvasWidth && current.height === state.canvasHeight && current.layers === state.layers) return current.renderer
    await new Promise((resolve) => setTimeout(resolve, 16))
  }
  throw new Error('Canvas renderer is not ready. Keep ImageStudio open and retry.')
}

const point = object({ x: { type: 'number', minimum: 0, maximum: 16384 }, y: { type: 'number', minimum: 0, maximum: 16384 } }, ['x', 'y'])
const layer = str('Existing layer ID. Defaults to the active layer; inspect canvas state to discover IDs.')
export const canvasRenderTools: { name: string; description: string; inputSchema: Schema; readOnly?: boolean }[] = [
  { name: 'canvas_color_mapping', description: 'Set the description for an existing detected color in the shared Canvas Expert panel. Use canvas_detect_colors with updateMappings first, then use an exact returned color string.', inputSchema: object({ color: str('Exact color from get_canvas.colorMappings.'), description: str() }, ['color', 'description']) },
  { name: 'canvas_references', description: 'List/add/remove attached image references or attach/detach a saved collection in the shared Canvas Expert panel. field is __general__ or an exact detected color. add_image accepts a completed gallery image ID or image data URL. remove_image uses its zero-based index. Collection actions use an existing collectionId. list returns reference indexes and collection metadata; use canvas_read_reference to see pixels.', inputSchema: object({ field: str('Default __general__; otherwise exact color from get_canvas.colorMappings.'), action: choice(['list', 'add_image', 'remove_image', 'attach_collection', 'detach_collection']), source: { ...str('Gallery image ID or image data URL; import local files/URLs with import_media first.'), maxLength: 30000000 }, index: integer(0, 10000), collectionId: str() }, ['action']) },
  { name: 'canvas_read_reference', description: 'Return a Canvas Expert reference as native MCP image content for visual inspection. field defaults to __general__. index is the zero-based uploaded-reference index; with collectionId it is the image index inside that attached collection.', inputSchema: object({ field: str(), index: integer(0, 10000), collectionId: str() }, ['index']), readOnly: true },
  { name: 'canvas_draw', description: 'Draw in the live canvas using the same brush, eraser, rectangle, ellipse (circle), or line tools as the UI. Pixel coordinates must lie within canvasWidth/canvasHeight. Brush/eraser use the full point list; shapes require exactly two opposite corners/endpoints. One call is one undo step. Opens the canvas if necessary.', inputSchema: object({ layerId: layer, tool: choice(['brush', 'eraser', 'rectangle', 'circle', 'line']), points: { ...array(point, 10000), minItems: 1 }, color: str('CSS color, defaults to current brush color.'), size: integer(1, 100), fill: bool }, ['points']) },
  { name: 'canvas_import_image', description: 'Import an image into the live active/specified canvas layer, centered and fit without cropping. Undoable. Use a local image path or image data URL; import a remote URL through import_media first. The same import is available in the Canvas toolbar.', inputSchema: object({ layerId: layer, source: { ...str('Absolute local path or data:image/...;base64,...'), maxLength: 30000000 } }, ['source']) },
  { name: 'canvas_export', description: 'Return the current visible canvas composition as native MCP image content for visual inspection/chat display. Optionally save PNG to the ImageStudio image directory. Opens the canvas; a previously closed canvas has the same fresh pixels the UI would show.', inputSchema: object({ save: bool }) },
  { name: 'canvas_undo', description: 'Undo the latest live canvas pixel edit, including edits made by a human.', inputSchema: object({}) },
  { name: 'canvas_redo', description: 'Redo the latest undone live canvas pixel edit.', inputSchema: object({}) },
  { name: 'canvas_clear', description: 'Clear the active or specified layer (undoable), or clear all layers and drawing history exactly like the UI Clear all button.', inputSchema: object({ layerId: layer, all: bool }) },
  { name: 'canvas_detect_colors', description: 'Detect dominant colors in the visible canvas. With updateMappings, update expert color mappings exactly like Detect Colors in the UI, preserving existing descriptions and references.', inputSchema: object({ maxColors: integer(1, 12), updateMappings: bool }) },
]

function activeLayer(layerId?: string): string {
  const state = useCanvasStore.getState()
  const id = layerId ?? state.activeLayerId
  if (!id || !state.layers.some((entry) => entry.id === id)) throw new Error('Canvas layer does not exist; inspect canvas state for available layer IDs.')
  return id
}

function referenceField(field: string = '__general__') {
  const state = useCanvasStore.getState()
  const mapping = field === '__general__' ? undefined : state.colorMappings.find((entry) => entry.color === field)
  if (field !== '__general__' && !mapping) throw new Error('Unknown color field. Use __general__ or an exact color from get_canvas.colorMappings.')
  return { state, field, attachments: mapping?.attachments ?? state.generalAttachments, collections: state.collectionsByField[field] ?? [] }
}

function referenceSummary(field: string) {
  const data = referenceField(field)
  return { field, references: data.attachments.map((source, index) => ({ index, mimeType: source.match(/^data:([^;]+)/)?.[1] ?? 'image' })),
    collections: data.collections.map(({ collectionId, name, images }) => ({ collectionId, name, imageCount: images.length })) }
}

async function localReferenceData(source: string): Promise<string> {
  if (source.startsWith('data:image/')) return source
  const result = await window.api.readImage(source)
  if (!result.success || !result.base64DataUrl) throw new Error(result.error || 'Reference image cannot be read.')
  return result.base64DataUrl
}

async function executeCanvasReferenceCommand(name: string, args: Record<string, unknown>): Promise<unknown> {
  if (name === 'canvas_color_mapping') {
    if (args.color === '__general__') throw new Error('Use update_canvas.generalPrompt for the general description.')
    const { state, field } = referenceField(args.color as string)
    state.updateColorDescription(field, args.description as string)
    return { color: field, description: args.description }
  }
  const { state, field, attachments, collections } = referenceField(args.field as string | undefined)
  const index = args.index as number | undefined
  const collectionId = args.collectionId as string | undefined
  if (name === 'canvas_read_reference') {
    let source: string | undefined
    if (collectionId) {
      const collection = collections.find((entry) => entry.collectionId === collectionId)
      if (!collection) throw new Error('That collection is not attached to this canvas field.')
      source = collection.images[index!]
    } else source = attachments[index!]
    if (!source) throw new Error('Reference index does not exist. Inspect canvas_references with action list first.')
    const dataUrl = await compressImage(await localReferenceData(source), 2048, 0.9)
    return { content: [{ type: 'text', text: JSON.stringify({ field, index, collectionId }) }, { type: 'image', mimeType: 'image/jpeg', data: dataUrl.split(',')[1] }] }
  }
  const action = args.action as string
  if (action === 'list') return referenceSummary(field)
  if (action === 'add_image') {
    if (!args.source) throw new Error('source is required for add_image.')
    let source = args.source as string
    if (!source.startsWith('data:image/')) {
      const image = useGalleryStore.getState().images.find((entry) => entry.id === source)
      if (!image || image.type === 'video' || image.isLoading || !image.filePath) throw new Error('source must be a completed gallery image ID or image data URL; import files/URLs with import_media first.')
      source = image.filePath
    }
    const compressed = await compressImage(await localReferenceData(source))
    // Resolve again after decoding; keep references added concurrently by the user.
    const fresh = referenceField(field)
    if (field === '__general__') fresh.state.setGeneralAttachments([...fresh.attachments, compressed])
    else fresh.state.updateColorAttachments(field, [...fresh.attachments, compressed])
  } else if (action === 'remove_image') {
    if (index === undefined || !attachments[index]) throw new Error('A valid reference index is required for remove_image.')
    const remaining = attachments.filter((_, position) => position !== index)
    if (field === '__general__') state.setGeneralAttachments(remaining)
    else state.updateColorAttachments(field, remaining)
  } else if (action === 'attach_collection') {
    if (!collectionId) throw new Error('collectionId is required for attach_collection.')
    const collection = useCollectionsStore.getState().collections.find((entry) => entry.id === collectionId)
    if (!collection) throw new Error('Collection not found; inspect collections first.')
    if (!collections.some((entry) => entry.collectionId === collectionId)) state.setFieldCollections(field, [...collections, { collectionId, name: collection.name, images: collection.images }])
  } else if (action === 'detach_collection') {
    if (!collectionId || !collections.some((entry) => entry.collectionId === collectionId)) throw new Error('collectionId must identify a collection attached to this field.')
    state.setFieldCollections(field, collections.filter((entry) => entry.collectionId !== collectionId))
  }
  return referenceSummary(field)
}

export async function executeCanvasRenderCommand(name: string, args: Record<string, unknown>): Promise<unknown> {
  const definition = canvasRenderTools.find((tool) => tool.name === name)
  if (!definition) throw new Error(`Unknown canvas render command: ${name}`)
  validate(definition.inputSchema, args)
  if (['canvas_color_mapping', 'canvas_references', 'canvas_read_reference'].includes(name)) return executeCanvasReferenceCommand(name, args)
  const renderer = await getCanvasRenderer()
  if (renderer.isDrawing()) throw new Error('A canvas pointer gesture is in progress. Retry after the user finishes drawing.')
  const state = useCanvasStore.getState()
  if (name === 'canvas_draw') {
    const id = activeLayer(args.layerId as string | undefined)
    if (!state.layers.find((entry) => entry.id === id)?.visible) throw new Error('Cannot draw on a hidden layer. Make the layer visible first.')
    const tool = (args.tool ?? state.activeTool) as CanvasTool
    const points = args.points as { x: number; y: number }[]
    if (points.some((p) => p.x > state.canvasWidth || p.y > state.canvasHeight)) throw new Error(`Coordinates exceed canvas bounds (${state.canvasWidth} × ${state.canvasHeight}).`)
    if (!['brush', 'eraser'].includes(tool) && points.length !== 2) throw new Error('Shape tools require exactly two points.')
    const color = (args.color ?? state.brushColor) as string
    if (!CSS.supports('color', color)) throw new Error('Invalid CSS drawing color.')
    const size = (args.size ?? (tool === 'eraser' ? state.eraserSize : state.brushSize)) as number
    const fill = (args.fill ?? state.shapeFill) as boolean
    state.setActiveLayer(id)
    state.setTool(tool)
    state.setBrushColor(color)
    if (tool === 'eraser') state.setEraserSize(size)
    else state.setBrushSize(size)
    state.setShapeFill(fill)
    const first = points[0]
    const last = points[points.length - 1]
    renderer.handlePointerDown(first.x, first.y, id, tool, color, size, size, fill)
    try {
      for (const p of points.slice(1)) renderer.handlePointerMove(p.x, p.y, id, tool, color, size, size, fill)
    } finally {
      renderer.handlePointerUp(last.x, last.y, id, tool, color, size, size, fill)
    }
    return { layerId: id, tool, pointCount: points.length, undoStackSize: useCanvasStore.getState().undoStackSize }
  }
  if (name === 'canvas_import_image') {
    const id = activeLayer(args.layerId as string | undefined)
    const source = args.source as string
    let dataUrl = source
    if (!source.startsWith('data:image/')) {
      if (/^[a-z]+:\/\//i.test(source)) throw new Error('Import remote URLs through import_media, then pass the returned local path.')
      const read = await window.api.readImage(source)
      if (!read.success || !read.base64DataUrl) throw new Error(read.error || 'Image could not be read.')
      dataUrl = read.base64DataUrl
    }
    await renderer.importImage(id, dataUrl)
    return { layerId: id, imported: true }
  }
  if (name === 'canvas_export') {
    const dataUrl = renderer.exportComposite()!
    let filePath: string | undefined
    if (args.save) {
      const result = await window.api.saveImage(dataUrl, `canvas-export-${crypto.randomUUID()}.png`)
      if (!result.success) throw new Error(result.error || 'Canvas export could not be saved.')
      filePath = result.filePath
    }
    return { content: [
      { type: 'text', text: JSON.stringify({ width: state.canvasWidth, height: state.canvasHeight, hasContent: renderer.hasContent(), filePath }) },
      { type: 'image', mimeType: 'image/png', data: dataUrl.split(',')[1] },
    ] }
  }
  if (name === 'canvas_undo') renderer.undo()
  else if (name === 'canvas_redo') renderer.redo()
  else if (name === 'canvas_clear') {
    if (args.all && args.layerId) throw new Error('Choose all or layerId, not both.')
    if (args.all) renderer.clearAll()
    else renderer.clearLayer(activeLayer(args.layerId as string | undefined))
  } else if (name === 'canvas_detect_colors') {
    const colors = renderer.detectColors((args.maxColors as number | undefined) ?? 12)
    if (args.updateMappings) {
      const existing = new Map(state.colorMappings.map((mapping) => [mapping.color, mapping]))
      state.setColorMappings(colors.map((color) => existing.get(color) ?? { color, description: '', attachments: [] }))
    }
    return { colors, colorMappings: useCanvasStore.getState().colorMappings }
  }
  return { undoStackSize: useCanvasStore.getState().undoStackSize, redoStackSize: useCanvasStore.getState().redoStackSize }
}
