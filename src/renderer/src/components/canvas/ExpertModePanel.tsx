import { useState, useCallback, useRef } from 'react'
import { RefreshCw, Send, Sparkles } from 'lucide-react'
import { useCanvasStore } from '../../stores/canvas-store'
import { useSharedCanvasRenderer } from './CanvasRendererContext'
import { useImageGeneration } from '../../hooks/useImageGeneration'
import { useSettingsStore } from '../../stores/settings-store'
import { nanoid } from 'nanoid'
import { compressImage, prepareCollectionImages } from '../../lib/image-utils'
import { ColorFieldEditor, type CollectionMention } from './ColorFieldEditor'
import { ModelSelector } from '../input/ModelSelector'
import { ResolutionSelector } from '../input/ResolutionSelector'
import { ImageCountSelector } from '../input/ImageCountSelector'
import type { Resolution } from '../../types/api'
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

  const [selectedModels, setSelectedModels] = useState<string[]>(['google/gemini-3-pro-image-preview'])
  const [resolution, setResolution] = useState<Resolution>('2K')
  const [imageCount, setImageCount] = useState(1)
  const [generalAttachments, setGeneralAttachments] = useState<string[]>([])

  // Collection mentions from all fields, keyed by source (color hex or '__general__')
  const collectionsByFieldRef = useRef<Map<string, CollectionMention[]>>(new Map())

  const { detectColors, exportComposite } = useSharedCanvasRenderer()
  const { generate } = useImageGeneration()
  const apiKey = useSettingsStore((s) => s.apiKey)

  const handleDetectColors = useCallback(() => {
    const colors = detectColors(12)
    const existingMap = new Map(colorMappings.map((m) => [m.color, m]))
    const newMappings = colors.map((color) => existingMap.get(color) || { color, description: '', attachments: [] })
    setColorMappings(newMappings)
  }, [detectColors, colorMappings, setColorMappings])

  const handleCollectionsChange = useCallback((fieldKey: string, collections: CollectionMention[]) => {
    collectionsByFieldRef.current.set(fieldKey, collections)
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!apiKey) return

    const canvasBase64 = exportComposite()
    if (!canvasBase64) return

    const compressedCanvas = await compressImage(canvasBase64, 2048, 0.85)

    // Save sketch to disk for compare functionality
    let canvasSketchPath: string | undefined
    try {
      const sketchFilename = `canvas-sketch-${nanoid()}.png`
      const saveResult = await window.api.saveImage(canvasBase64, sketchFilename)
      if (saveResult.success && saveResult.filePath) {
        canvasSketchPath = saveResult.filePath
      }
    } catch (err) {
      console.error('Failed to save canvas sketch for compare', err)
    }

    // Build color map text
    const colorDescriptions = colorMappings
      .filter((m) => m.description.trim())
      .map((m) => `- ${m.color} regions: "${m.description}"`)
      .join('\n')

    // Build prompt
    const promptParts: string[] = []
    promptParts.push('Generate an image based on the attached color-coded sketch.')
    if (colorDescriptions) {
      promptParts.push(`\nColor map:\n${colorDescriptions}`)
    }
    if (generalPrompt.trim()) {
      promptParts.push(`\nGeneral description: ${generalPrompt.trim()}`)
    }
    promptParts.push('\nEach color in the sketch represents a different element. Create a cohesive, detailed, high-quality image that follows the composition and layout of the sketch.')
    const apiPrompt = promptParts.join('')

    // Build display prompt (shorter, for gallery)
    const displayPrompt = generalPrompt.trim() || colorMappings.filter((m) => m.description.trim()).map((m) => m.description).join(', ') || 'Canvas sketch'

    // Build labeled attachments
    const attachments: string[] = [compressedCanvas]
    const labeledAttachments: { label: string; images: string[] }[] = [
      { label: 'Color-coded reference sketch — each color represents a different element as described in the prompt', images: [compressedCanvas] },
    ]

    // Add color-specific reference images (file uploads)
    for (const mapping of colorMappings) {
      if (mapping.attachments.length > 0 && mapping.description.trim()) {
        for (const att of mapping.attachments) {
          const compressed = await compressImage(att, 2048, 0.85)
          attachments.push(compressed)
          labeledAttachments.push({
            label: `Visual reference for ${mapping.color} regions (${mapping.description})`,
            images: [compressed],
          })
        }
      }
    }

    // Add general attachments (file uploads)
    for (const att of generalAttachments) {
      const compressed = await compressImage(att, 2048, 0.85)
      attachments.push(compressed)
      labeledAttachments.push({
        label: 'Additional visual reference',
        images: [compressed],
      })
    }

    // Deduplicate collection mentions across ALL fields by collectionId
    const seenCollectionIds = new Set<string>()
    const uniqueCollections: { mention: CollectionMention; context: string }[] = []

    for (const [fieldKey, mentions] of collectionsByFieldRef.current.entries()) {
      for (const mention of mentions) {
        if (!seenCollectionIds.has(mention.collectionId)) {
          seenCollectionIds.add(mention.collectionId)
          // Determine context label
          const colorMapping = colorMappings.find((m) => m.color === fieldKey)
          const context = colorMapping
            ? `referenced for ${fieldKey} regions (${colorMapping.description || fieldKey})`
            : 'general reference'
          uniqueCollections.push({ mention, context })
        }
      }
    }

    // Process unique collections and add as labeled attachments (each collection only once)
    for (const { mention, context } of uniqueCollections) {
      const processed = await prepareCollectionImages(mention.images)
      attachments.push(...processed)

      if (mention.images.length <= 5) {
        labeledAttachments.push({
          label: `Collection "${mention.name}" (${mention.images.length} images) — ${context}`,
          images: processed,
        })
      } else {
        const imagesPerGrid = 4
        for (let i = 0; i < processed.length; i++) {
          const startIdx = i * imagesPerGrid + 1
          const endIdx = Math.min(startIdx + imagesPerGrid - 1, mention.images.length)
          labeledAttachments.push({
            label: `Collection "${mention.name}" — grid ${i + 1}/${processed.length} (images ${startIdx}–${endIdx}) — ${context}`,
            images: [processed[i]],
          })
        }
      }
    }

    const resolvedAspectRatio = aspectRatio === 'custom' ? customRatio : aspectRatio

    generate({
      prompt: `Canvas: ${displayPrompt}`,
      apiPrompt,
      aspectRatio: resolvedAspectRatio,
      resolution,
      imageCount,
      attachments,
      labeledAttachments,
      models: selectedModels,
      canvasSketchPath,
    })

    close()
  }, [apiKey, exportComposite, colorMappings, generalPrompt, generalAttachments, aspectRatio, customRatio, resolution, imageCount, selectedModels, generate, close])

  const hasColorDescriptions = colorMappings.some((m) => m.description.trim())
  const canSend = !!apiKey && (!!generalPrompt.trim() || hasColorDescriptions)

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
          <ResolutionSelector value={resolution} onChange={setResolution} />
          <div className="w-px h-4 bg-border-dim/40 mx-0.5" />
          <ImageCountSelector value={imageCount} onChange={setImageCount} />
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
