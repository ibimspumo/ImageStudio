import type { GalleryImage } from '../stores/gallery-store'

/** Local retained-media accounting, shared by UI and MCP. This is not the provider account ledger. */
export function getGalleryCosts(images: readonly GalleryImage[], now = Date.now()) {
  const dayStart = new Date(now)
  dayStart.setHours(0, 0, 0, 0)
  const startMs = dayStart.getTime()
  const sum = (items: readonly GalleryImage[], actual: boolean) => items.reduce((total, i) => total + ((i.costSource === 'provider-reported') === actual ? i.cost ?? 0 : 0), 0)
  const today = images.filter(i => i.timestamp >= startMs)
  const confirmedSpendUsd = sum(images, true)
  const estimatedSpendUsd = sum(images, false)
  return {
    currency: 'USD' as const,
    estimateOnly: !images.some(i => i.costSource === 'provider-reported'),
    hasEstimates: images.some(i => i.cost !== undefined && i.costSource !== 'provider-reported'),
    confirmedSpendUsd, estimatedSpendUsd,
    gallerySpendUsd: confirmedSpendUsd + estimatedSpendUsd,
    todaySpendUsd: sum(today, true) + sum(today, false),
    todayConfirmedSpendUsd: sum(today, true),
    todayUnconfirmedSpendUsd: sum(today, false),
    galleryEstimatedSpendUsd: estimatedSpendUsd,
    todayEstimatedSpendUsd: sum(today, false),
    todayStartMs: startMs,
    missingCostCount: images.filter(image => !image.isLoading && image.cost === undefined).length,
    scope: 'Current retained gallery only; deleted images are not counted. Not an account balance.',
  }
}
