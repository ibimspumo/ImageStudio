import { nanoid } from 'nanoid'
import { compressImage, collectionImagesAsBase64 } from './image-utils'
import type { GenerateOptions } from '../hooks/useImageGeneration'
import type { CanvasCollectionMention, ColorMapping } from '../stores/canvas-store'
import type { AspectRatio, Resolution } from '../types/api'

export const CANVAS_SKETCH_REFERENCE_LABEL = 'Reference sketch drawn by the user — generate a detailed image based on this sketch, following its composition, layout, and color placement'

type CollectionMention = CanvasCollectionMention

export interface CanvasExpertInput {
  canvasBase64: string
  colorMappings: ColorMapping[]
  generalPrompt: string
  generalAttachments: string[]
  collectionsByField: Record<string, CanvasCollectionMention[]>
  aspectRatio: AspectRatio
  customRatio: string
  resolution: Resolution
  imageCount: number
  selectedModels: string[]
}

/** Shared by the Expert panel and MCP; prompt, reference labels and sketch storage stay identical. */
export async function buildCanvasExpertRequest(input: CanvasExpertInput): Promise<GenerateOptions> {
  const { canvasBase64, colorMappings, generalPrompt, generalAttachments, collectionsByField,
    aspectRatio, customRatio, resolution, imageCount, selectedModels } = input
  const { compressedCanvas, canvasSketchPath } = await prepareCanvasSketch(canvasBase64)

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

  for (const [fieldKey, mentions] of Object.entries(collectionsByField)) {
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
    const images = await collectionImagesAsBase64(mention.images)
    attachments.push(...images)
    labeledAttachments.push({
      label: `Collection "@${mention.name}" (${images.length} image${images.length === 1 ? '' : 's'}) — ${context}`,
      images,
    })
  }

  const resolvedAspectRatio = aspectRatio === 'custom' ? customRatio : aspectRatio

  return {
    prompt: `Canvas: ${displayPrompt}`,
    apiPrompt,
    aspectRatio: resolvedAspectRatio,
    resolution,
    imageCount,
    attachments,
    labeledAttachments,
    models: selectedModels,
    canvasSketchPath,
  }

}

/** Sketch preparation shared by both UI generation modes and automation. */
export async function prepareCanvasSketch(canvasBase64: string): Promise<{ compressedCanvas: string; canvasSketchPath?: string }> {
  const compressedCanvas = await compressImage(canvasBase64, 2048, 0.85)
  let canvasSketchPath: string | undefined
  try {
    const result = await window.api.saveImage(canvasBase64, `canvas-sketch-${nanoid()}.png`)
    if (result.success && result.filePath) canvasSketchPath = result.filePath
  } catch (error) {
    console.error('Failed to save canvas sketch for compare', error)
  }
  return { compressedCanvas, canvasSketchPath }
}

export function buildCanvasPrompt(finalPrompt: string, hasUserRefs: boolean): string {
  const refNote = hasUserRefs
    ? ' The user has also attached additional reference images — use them as visual guidance.'
    : ''
  return `Generate an image based on the attached sketch. The sketch shows the composition, shapes, and color layout. Create a detailed, high-quality image that matches the sketch's layout: ${finalPrompt}${refNote}`
}
