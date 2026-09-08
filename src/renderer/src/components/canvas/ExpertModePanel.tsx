import { useCallback } from 'react'
import { RefreshCw, Send, Sparkles } from 'lucide-react'
import { useCanvasStore } from '../../stores/canvas-store'
import { useSharedCanvasRenderer } from './CanvasRendererContext'
import { useImageGeneration } from '../../hooks/useImageGeneration'
import { useSettingsStore } from '../../stores/settings-store'
import { buildCanvasExpertRequest } from '../../lib/canvas-generation'
import { getCombinedCapabilities } from '../../types/api'
import { ColorFieldEditor, type CollectionMention } from './ColorFieldEditor'
import { ModelSelector } from '../input/ModelSelector'
import { ResolutionSelector } from '../input/ResolutionSelector'
import { ImageCountSelector } from '../input/ImageCountSelector'
import { cn } from '../../lib/utils'

export function ExpertModePanel() {
  const colorMappings = useCanvasStore((s) => s.colorMappings)
  const setColorMappings = useCanvasStore((s) => s.setColorMappings)
  const updateColorDescription = useCanvasStore((s) => s.updateColorDescription)
  const updateColorAttachments = useCanvasStore((s) => s.updateColorAttachments)
  const generalPrompt = useCanvasStore((s) => s.generalPrompt)
  const setGeneralPrompt = useCanvasStore((s) => s.setGeneralPrompt)
  const aspectRatio = useCanvasStore((s) => s.aspectRatio)
  const customRatio = useCanvasStore((s) => s.customRatio)
  const close = useCanvasStore((s) => s.close)

  const selectedModels = useCanvasStore((s) => s.expertModels)
  const setSelectedModels = useCanvasStore((s) => s.setExpertModels)
  const resolution = useCanvasStore((s) => s.expertResolution)
  const setResolution = useCanvasStore((s) => s.setExpertResolution)
  const imageCount = useCanvasStore((s) => s.expertImageCount)
  const setImageCount = useCanvasStore((s) => s.setExpertImageCount)
  const generalAttachments = useCanvasStore((s) => s.generalAttachments)
  const setGeneralAttachments = useCanvasStore((s) => s.setGeneralAttachments)
  const collectionsByField = useCanvasStore((s) => s.collectionsByField)
  const setFieldCollections = useCanvasStore((s) => s.setFieldCollections)

  const { detectColors, exportComposite } = useSharedCanvasRenderer()
  const { generate } = useImageGeneration()
  const falApiKey = useSettingsStore((s) => s.falApiKey)
  const caps = getCombinedCapabilities(selectedModels)

  const handleDetectColors = useCallback(() => {
    const colors = detectColors(12)
    const existingMap = new Map(colorMappings.map((m) => [m.color, m]))
    const newMappings = colors.map((color) => existingMap.get(color) || { color, description: '', attachments: [] })
    setColorMappings(newMappings)
  }, [detectColors, colorMappings, setColorMappings])

  const handleCollectionsChange = useCallback((fieldKey: string, collections: CollectionMention[]) => {
    setFieldCollections(fieldKey, collections)
  }, [setFieldCollections])

  const handleSubmit = useCallback(async () => {
    if (!falApiKey) return

    const canvasBase64 = exportComposite()
    if (!canvasBase64) return

    const options = await buildCanvasExpertRequest({ canvasBase64, colorMappings, generalPrompt,
      generalAttachments, collectionsByField, aspectRatio, customRatio, resolution, imageCount, selectedModels })
    generate(options)

    close()
  }, [falApiKey, exportComposite, colorMappings, generalPrompt, generalAttachments, collectionsByField, aspectRatio, customRatio, resolution, imageCount, selectedModels, generate, close])

  const hasColorDescriptions = colorMappings.some((m) => m.description.trim())
  const canSend = !!falApiKey && (!!generalPrompt.trim() || hasColorDescriptions)

  return (
    <div className="w-[300px] bg-surface-1 border-l border-border-dim flex flex-col shrink-0 h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border-dim">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">Expert Mode</span>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto overflow-x-visible px-4 py-3 flex flex-col gap-3">
        {/* Color detection */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleDetectColors}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-3 hover:bg-surface-4 border border-border-dim text-[11px] font-medium text-text-secondary hover:text-text-primary transition-all"
          >
            <RefreshCw className="w-3 h-3" />
            Detect Colors
          </button>
          {colorMappings.length > 0 && (
            <span className="text-[11px] text-text-muted">{colorMappings.length} found</span>
          )}
        </div>

        {/* Color field editors */}
        {colorMappings.length > 0 && (
          <div className="flex flex-col gap-2">
            {colorMappings.map((mapping) => (
              <ColorFieldEditor
                key={mapping.color}
                colorHex={mapping.color}
                placeholder={`What does ${mapping.color} represent?`}
                value={mapping.description}
                onChange={(v) => updateColorDescription(mapping.color, v)}
                collectionMentions={collectionsByField[mapping.color] ?? []}
                attachments={mapping.attachments}
                onAttachmentsChange={(atts) => updateColorAttachments(mapping.color, atts)}
                onCollectionsChange={(cols) => handleCollectionsChange(mapping.color, cols)}
              />
            ))}
          </div>
        )}

        {colorMappings.length === 0 && (
          <div className="flex items-center gap-2 px-3 py-3 rounded-lg bg-surface-2 border border-border-dim">
            <Sparkles className="w-4 h-4 text-text-muted shrink-0" />
            <p className="text-[12px] text-text-muted leading-relaxed">Draw on the canvas, then click "Detect Colors" to map each color to a description.</p>
          </div>
        )}

        {/* General prompt */}
        <div className="border-t border-border-dim pt-3">
          <div className="text-[10px] font-medium uppercase tracking-wider text-text-muted mb-1.5">General Description</div>
          <ColorFieldEditor
            placeholder="Overall scene description..."
            value={generalPrompt}
            onChange={setGeneralPrompt}
            collectionMentions={collectionsByField.__general__ ?? []}
            attachments={generalAttachments}
            onAttachmentsChange={setGeneralAttachments}
            onCollectionsChange={(cols) => handleCollectionsChange('__general__', cols)}
          />
        </div>
      </div>

      {/* Bottom controls - fixed */}
      <div className="shrink-0 border-t border-border-dim px-4 py-3 flex flex-col gap-2">
        <div className="flex items-center gap-1 flex-wrap">
          <ModelSelector selectedModels={selectedModels} onChange={setSelectedModels} compact />
          <div className="w-px h-4 bg-border-dim/40 mx-0.5" />
          <ResolutionSelector value={resolution} onChange={setResolution} available={caps.resolutions} notes={caps.notes} />
          <div className="w-px h-4 bg-border-dim/40 mx-0.5" />
          <ImageCountSelector value={imageCount} onChange={setImageCount} max={caps.maxImagesPerRequest} />
        </div>

        <button
          onClick={handleSubmit}
          disabled={!canSend}
          className={cn(
            'no-drag btn-interactive flex items-center justify-center h-9 rounded-xl transition-all w-full',
            canSend
              ? 'bg-accent-main hover:bg-accent-bright text-white gap-2 glow-accent shadow-lg'
              : 'bg-surface-3 text-text-muted cursor-not-allowed'
          )}
        >
          <Send className="w-4 h-4" />
          <span className="text-[12px] font-semibold tracking-wide">Generate</span>
        </button>
      </div>
    </div>
  )
}
