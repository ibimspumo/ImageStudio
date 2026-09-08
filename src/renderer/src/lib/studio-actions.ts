import { useGalleryStore } from '../stores/gallery-store'
import { useCropStore } from '../stores/crop-store'
import { DEFAULT_LOGO_MODEL, getModel, normalizeModelId } from '../types/api'

/** UI and MCP navigate(create_variant) share this exact source-reference draft. */
export function prepareImageVariant(imageId: string): void {
  const image = useGalleryStore.getState().images.find(item => item.id === imageId)
  if (!image?.filePath || image.isLoading || image.error || image.type === 'video') {
    throw new Error('Wähle ein fertig erstelltes Bild für eine neue Variante.')
  }
  const normalizedModel = normalizeModelId(image.model)
  const model = image.hasAlpha && !getModel(normalizedModel).supportsBackground ? DEFAULT_LOGO_MODEL : normalizedModel
  useCropStore.getState().setPendingReuse(
    '[Image 1] als Ausgangsbild verwenden. ',
    [image.filePath], undefined, image.seed,
    { model, aspectRatio: image.aspectRatio, resolution: image.resolution, background: image.hasAlpha ? 'transparent' : undefined },
  )
}
