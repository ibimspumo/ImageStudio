import { useMemo } from 'react'
import { DollarSign } from 'lucide-react'
import { estimateImageCost, formatCost, getModel } from '../../types/api'

interface CostEstimateProps {
  /** Every model the request will hit — each one is billed separately. */
  models: string[]
  aspectRatio: string
  resolution: string
  imageCount: number
  quality?: string
  imageSize?: { width: number; height: number }
}

/**
 * What the pending request will cost, per fal.ai's published list prices.
 *
 * fal returns no billing data with a generation, so this is arithmetic, not a
 * reading — hence the `≈`. The per-model breakdown sits in the tooltip so the
 * number can be checked against the model pages.
 */
export function CostEstimate({
  models,
  aspectRatio,
  resolution,
  imageCount,
  quality,
  imageSize,
}: CostEstimateProps) {
  const { total, breakdown } = useMemo(() => {
    const rows = models.map((id) => ({
      name: getModel(id).name,
      note: getModel(id).pricing.note,
      cost: estimateImageCost(id, {
        aspectRatio,
        resolution,
        quality,
        imageSize,
        count: imageCount,
      }),
    }))
    return { total: rows.reduce((sum, r) => sum + r.cost, 0), breakdown: rows }
  }, [models, aspectRatio, resolution, imageCount, quality, imageSize])

  if (total <= 0) return null

  const title = [
    ...breakdown.map((r) => `${r.name}: ${formatCost(r.cost)} — ${r.note}`),
    'Estimate from fal.ai list prices — fal reports no per-request cost.',
  ].join('\n')

  return (
    <span className="inline-flex items-center gap-0.5 text-text-muted" title={title}>
      <DollarSign className="w-2.5 h-2.5" />
      {'≈ '}
      {formatCost(total).replace('$', '')}
      {imageCount > 1 && <span className="opacity-60">{` (${imageCount}×)`}</span>}
    </span>
  )
}
