import { logger } from '../lib/logger'
import { PRINT_FORMATS, type PrintFormat } from '../../../shared/print-prompt'
import { useGalleryFilterStore } from '../stores/gallery-filter-store'
import { useGalleryStore } from '../stores/gallery-store'
import { useCanvasStore, type CanvasTool } from '../stores/canvas-store'
import { importMediaToGallery } from '../lib/media-actions'
import { canvasRenderTools, executeCanvasRenderCommand, getCanvasRenderer } from '../lib/canvas-automation'
import { buildCanvasExpertRequest, prepareCanvasSketch, buildCanvasPrompt, CANVAS_SKETCH_REFERENCE_LABEL } from '../lib/canvas-generation'
import { AVAILABLE_MODELS, type AspectRatio, type Resolution } from '../types/api'
import { object, str, bool, choice, integer, array, type Schema } from './schema'
import { type RegisterTool, type AutomationContext, requireItem, requireKey, prepareGeneration, estimateGeneration, type GenerationArgs, imageSummary } from './tools'

export function registerExtraTools(add: RegisterTool, context: AutomationContext): void {
  add<{ query?: string; models?: string[]; aspectRatios?: string[]; dateRange?: 'today' | 'week' | 'month' | 'all'; sortBy?: 'newest' | 'oldest'; favoritesOnly?: boolean; tags?: string[]; type?: 'all' | 'images' | 'videos'; smartAlbum?: string; clear?: boolean }>('gallery_filters', 'Read or update the actual gallery search/filter/sort controls. Omitted fields remain unchanged; empty arrays clear those filters. Empty smartAlbum disables it; clear resets all filters.', object({ query: str(), models: array(str(), 32), aspectRatios: array(str(), 32), dateRange: choice(['today', 'week', 'month', 'all']), sortBy: choice(['newest', 'oldest']), favoritesOnly: bool, tags: array(str(), 100), type: choice(['all', 'images', 'videos']), smartAlbum: str('favorites, today, videos, model:<model ID>, tag:<tag>, or empty'), clear: bool }), args => {
    const s = useGalleryFilterStore.getState()
    if (args.clear) s.clearFilters()
    if (args.query !== undefined) s.setSearchQuery(args.query)
    if (args.models) s.setFilterModels(args.models)
    if (args.aspectRatios) s.setFilterAspectRatios(args.aspectRatios)
    if (args.dateRange) s.setFilterDateRange(args.dateRange === 'all' ? null : args.dateRange)
    if (args.sortBy) s.setSortBy(args.sortBy)
    if (args.favoritesOnly !== undefined) s.setFavoritesOnly(args.favoritesOnly)
    if (args.tags) s.setFilterTags(args.tags)
    if (args.type) s.setFilterType(args.type)
    if (args.smartAlbum !== undefined && useGalleryFilterStore.getState().activeSmartAlbum !== (args.smartAlbum || null)) s.setActiveSmartAlbum(args.smartAlbum || null)
    return Object.fromEntries(Object.entries(useGalleryFilterStore.getState()).filter(([, value]) => typeof value !== 'function'))
  })
  add<{ action: string }>('app_updates', 'Inspect/check/download/install/reveal app updates using the same updater and live status as Settings. status is read-only; check contacts the release service; download starts transferring the available update without provider charges and returns immediately; poll action=status for downloading, downloaded or error. Only one updater operation runs at a time. Status includes state, versions, progress (percent), transferred/total bytes, bytesPerSecond, errors, downloadPath, canInstall, installMode and optional installReason (manual fallback explanation). replace-app stages and replaces a writable macOS app; installing means the helper is waiting for the app to quit. Check first, download when available, then inspect status; install requires a downloaded update with canInstall=true. install may quit/restart ImageStudio and disconnect MCP, or open an installer depending on installMode; reconnect after relaunch. Only install when the user has requested installation. reveal opens the downloaded artifact in the file manager. Failed install/reveal returns an actionable tool error.', object({ action: choice(['status', 'check', 'download', 'install', 'reveal']) }, ['action']), async ({ action }) => {
    if (action === 'status') return window.api.getUpdateStatus()
    if (action === 'check') return window.api.checkForUpdates()
    if (action === 'download') {
      // The shared main-process updater catches provider/network failures into
      // its live status. Do not hold the MCP transport open for the transfer.
      void window.api.downloadUpdate().catch(error => logger.error('Updater', 'Download IPC failed; inspect updater status or reconnect', error))
      return { ...await window.api.getUpdateStatus(), operation: 'download', poll: 'app_updates action=status' }
    }
    const result = action === 'install' ? await window.api.installUpdate() : await window.api.revealUpdate()
    if (!result.success) throw new Error(result.error || `Update ${action} failed. Inspect app_updates action=status and retry when ready.`)
    return result
  })
  add<{ source: string; name?: string; workspaceId?: string; projectId?: string; importMode?: 'print'; printFormat?: PrintFormat }>('import_media', 'Import an image or video from an absolute local file path or HTTP(S) URL into the live gallery. Returns a stable gallery ID usable as generate references or generate_video startImageId. Media is copied into app storage. Explicit importMode=print classifies an image as Print artwork; printFormat optionally sets its intended trim format, otherwise the saved Print format applies. Videos cannot be Print artwork. Actual dimensions and MIME are inspected; this does not resize media or invent generated design metadata.', object({ source: { ...str(), maxLength: 30000000 }, name: str(), workspaceId: str(), projectId: str(), importMode: choice(['print']), printFormat: choice(PRINT_FORMATS.map(format => format.id)) }, ['source']), async args => importMediaToGallery(args))
  add<{ id: string; destination: string; overwrite?: boolean }>('export_media', 'Copy an existing gallery image/video to an explicit absolute destination path without opening a dialog. Preserves original bytes. Use image_export for resized/formatted image exports.', object({ id: str(), destination: str(), overwrite: bool }, ['id', 'destination']), async args => {
    const image = requireItem(useGalleryStore.getState().images, args.id, 'Media')
    if (!image.filePath || image.isLoading) throw new Error('Media is not complete')
    return window.api.automationExportMedia({ filePath: image.filePath, destination: args.destination, overwrite: args.overwrite })
  })
  add<{ id: string }>('read_media', 'Return a completed image/video as a native MCP resource link with local file URI, MIME type, path and size. Display support depends on the client. read_image embeds image pixels; video links can be opened or played by clients with local-file support.', object({ id: str() }, ['id']), async args => {
    const item = requireItem(useGalleryStore.getState().images, args.id, 'Media')
    if (!item.filePath || item.isLoading) throw new Error('Media is not complete')
    const media = await window.api.automationReadMedia({ filePath: item.filePath })
    return { content: [{ type: 'text', text: JSON.stringify({ id: item.id, ...media, duration: item.videoDuration }) }, { type: 'resource_link', uri: media.uri, name: item.filePath.split(/[/\\]/).pop() ?? item.id, mimeType: media.mimeType, size: media.size, description: item.prompt }] }
  }, true)
  add<{ ids: string[]; timeoutMs?: number }>('wait_for_jobs', 'Wait up to 20 seconds for all selected gallery jobs to stop running, returning current metadata even on timeout. Use repeated calls for long generations. Does not cancel or retry jobs.', object({ ids: { ...array(str(), 64), minItems: 1 }, timeoutMs: integer(0, 20000) }, ['ids']), async args => {
    const get = () => args.ids.map(id => requireItem(useGalleryStore.getState().images, id, 'Job'))
    if (get().some(image => image.isLoading) && (args.timeoutMs ?? 10000) > 0) {
      await new Promise<void>(resolve => {
        let timer: ReturnType<typeof setTimeout>
        const unsubscribe = useGalleryStore.subscribe(() => {
          try { if (get().some(image => image.isLoading)) return } catch { /* A removed job also wakes wait. */ }
          clearTimeout(timer); unsubscribe(); resolve()
        })
        timer = setTimeout(() => { unsubscribe(); resolve() }, args.timeoutMs ?? 10000)
      })
    }
    const jobs = get().map(imageSummary)
    return { completed: jobs.every(j => !j.isLoading), jobs }
  }, true)

  for (const tool of canvasRenderTools) add(tool.name, tool.description, tool.inputSchema, (args: Record<string, unknown>) => executeCanvasRenderCommand(tool.name, args), tool.readOnly ?? tool.name === 'canvas_export')
  add('get_canvas', 'Inspect live canvas size, layers, tools, expert prompts and reference counts. Canvas pixels are available through canvas_export.', object({}), () => {
    const state = useCanvasStore.getState()
    return Object.fromEntries(Object.entries(state).filter(([, value]) => typeof value !== 'function').map(([key, value]) => {
      if (key === 'generalAttachments') return [key, { count: state.generalAttachments.length }]
      if (key === 'colorMappings') return [key, state.colorMappings.map(({ attachments, ...mapping }) => ({ ...mapping, attachmentCount: attachments.length }))]
      if (key === 'collectionsByField') return [key, Object.fromEntries(Object.entries(state.collectionsByField).map(([field, collections]) => [field, collections.map(({ images, ...c }) => ({ ...c, imageCount: images.length }))]))]
      return [key, value]
    }))
  }, true)
  const ratio: Schema = { type: 'string', pattern: '^[1-9][0-9]{0,3}:[1-9][0-9]{0,3}$' }
  add<{ mode?: 'simple' | 'expert'; aspectRatio?: string; tool?: CanvasTool; brushColor?: string; brushSize?: number; eraserSize?: number; shapeFill?: boolean; generalPrompt?: string; models?: string[]; resolution?: Resolution; imageCount?: number }>('update_canvas', 'Update actual canvas tools, dimensions, mode, general prompt and expert generation defaults.', object({ mode: choice(['simple', 'expert']), aspectRatio: ratio, tool: choice(['brush', 'eraser', 'rectangle', 'circle', 'line']), brushColor: str(), brushSize: integer(1, 100), eraserSize: integer(1, 100), shapeFill: bool, generalPrompt: str(), models: { ...array(choice(AVAILABLE_MODELS.map(m => m.id)), 8), minItems: 1 }, resolution: choice(['0.5K', '1K', '2K', '4K']), imageCount: integer(1, 4) }), args => {
    const state = useCanvasStore.getState()
    if (args.brushColor && !CSS.supports('color', args.brushColor)) throw new Error('Invalid CSS color')
    if (args.mode) state.setMode(args.mode)
    if (args.aspectRatio) state.setAspectRatio('custom', args.aspectRatio)
    if (args.tool) state.setTool(args.tool)
    if (args.brushColor) state.setBrushColor(args.brushColor)
    if (args.brushSize !== undefined) state.setBrushSize(args.brushSize)
    if (args.eraserSize !== undefined) state.setEraserSize(args.eraserSize)
    if (args.shapeFill !== undefined) state.setShapeFill(args.shapeFill)
    if (args.generalPrompt !== undefined) state.setGeneralPrompt(args.generalPrompt)
    if (args.models) state.setExpertModels(args.models)
    if (args.resolution) state.setExpertResolution(args.resolution)
    if (args.imageCount) state.setExpertImageCount(args.imageCount)
    return { updated: Object.keys(args) }
  })
  add<{ action: string; id?: string; name?: string; opacity?: number; fromIndex?: number; toIndex?: number }>('canvas_layers', 'Add/remove/rename/select/show/hide/reorder live canvas layers, or set their opacity. At least one and at most eight layers are retained.', object({ action: choice(['add', 'remove', 'rename', 'select', 'toggle_visibility', 'opacity', 'reorder']), id: str(), name: str(), opacity: { type: 'number', minimum: 0, maximum: 1 }, fromIndex: integer(0, 7), toIndex: integer(0, 7) }, ['action']), args => {
    const state = useCanvasStore.getState()
    if (args.action === 'add') { if (state.layers.length >= 8) throw new Error('Maximum of 8 canvas layers'); state.addLayer() }
    else if (args.action === 'reorder') {
      if (args.fromIndex === undefined || args.toIndex === undefined || !state.layers[args.fromIndex] || !state.layers[args.toIndex]) throw new Error('fromIndex and toIndex must identify existing layers')
      state.reorderLayers(args.fromIndex, args.toIndex)
    } else {
      const layer = requireItem(state.layers, args.id, 'Layer')
      if (args.action === 'remove') { if (state.layers.length === 1) throw new Error('Cannot remove the final layer'); state.removeLayer(layer.id) }
      if (args.action === 'rename') { if (!args.name?.trim()) throw new Error('name is required'); state.renameLayer(layer.id, args.name) }
      if (args.action === 'select') state.setActiveLayer(layer.id)
      if (args.action === 'toggle_visibility') state.toggleLayerVisibility(layer.id)
      if (args.action === 'opacity') { if (args.opacity === undefined) throw new Error('opacity is required'); state.setLayerOpacity(layer.id, args.opacity) }
    }
    return { layers: useCanvasStore.getState().layers, activeLayerId: useCanvasStore.getState().activeLayerId }
  })
  add<GenerationArgs>('canvas_generate', 'Generate from the actual live canvas using the shared simple/expert UI composers. Expert mode uses the configured color mappings/references; simple mode takes prompt and optional model defaults. This spends credits.', object({ prompt: str(), models: { ...array(choice(AVAILABLE_MODELS.map(m => m.id)), 8), minItems: 1 }, resolution: choice(['0.5K', '1K', '2K', '4K']), imageCount: integer(1, 4) }), async args => {
    requireKey()
    const renderer = await getCanvasRenderer(), state = useCanvasStore.getState()
    const canvasBase64 = renderer.exportComposite()
    if (!canvasBase64) throw new Error('Canvas cannot be exported')
    if (state.mode === 'expert') {
      const options = await buildCanvasExpertRequest({ canvasBase64, colorMappings: state.colorMappings, generalPrompt: args.prompt ?? state.generalPrompt, generalAttachments: state.generalAttachments, collectionsByField: state.collectionsByField, aspectRatio: state.aspectRatio, customRatio: state.customRatio, resolution: (args.resolution ?? state.expertResolution) as Resolution, imageCount: args.imageCount ?? state.expertImageCount, selectedModels: args.models ?? state.expertModels })
      return { jobIds: context.generate(options), ...estimateGeneration(options) }
    }
    if (!args.prompt?.trim()) throw new Error('prompt is required in simple mode; use generate_draft for the visible canvas prompt')
    const options = await prepareGeneration({ ...args, aspectRatio: state.aspectRatio === 'custom' ? state.customRatio : state.aspectRatio })
    const sketch = await prepareCanvasSketch(canvasBase64)
    options.apiPrompt = buildCanvasPrompt(options.prompt, false)
    options.prompt = `Canvas: ${args.prompt}`
    options.attachments = [sketch.compressedCanvas]
    options.labeledAttachments = [{ label: CANVAS_SKETCH_REFERENCE_LABEL, images: [sketch.compressedCanvas] }]
    options.canvasSketchPath = sketch.canvasSketchPath
    return { jobIds: context.generate(options), ...estimateGeneration(options) }
  })
}
