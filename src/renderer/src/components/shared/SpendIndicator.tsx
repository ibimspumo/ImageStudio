import { useMemo } from 'react'
import { DollarSign } from 'lucide-react'
import { useGalleryStore } from '../../stores/gallery-store'
import { formatCost } from '../../types/api'

/**
 * What the gallery has cost so far.
 *
 * Adds up the per-generation estimates stored on each image and video. Older
 * images from before cost tracking carry no figure and simply do not count —
 * the number is a running total of what this app knows it generated, not an
 * account balance.
 */
export function SpendIndicator() {
  const images = useGalleryStore((s) => s.images)

  const { total, today, tracked } = useMemo(() => {
    const dayStart = new Date()
    dayStart.setHours(0, 0, 0, 0)
    const startMs = dayStart.getTime()

    let total = 0
    let today = 0
    let tracked = 0
    for (const image of images) {
      if (!image.cost) continue
      tracked++
      total += image.cost
      if (image.timestamp >= startMs) today += image.cost
    }
    return { total, today, tracked }
  }, [images])

  if (total <= 0) return null

  const untracked = images.length - tracked

  return (
    <div
      className="no-drag absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[11px] text-text-muted hover:text-text-secondary transition-colors cursor-default"
      title={[
        `Today: ${formatCost(today)}`,
        `Total: ${formatCost(total)}`,
        untracked > 0 ? `${untracked} older item(s) without a recorded cost` : null,
        'Estimated from fal.ai list prices — fal reports no per-request cost.',
      ]
        .filter(Boolean)
        .join('\n')}
    >
      <DollarSign className="w-3 h-3" />
      <span className="tabular-nums">{formatCost(today).replace('$', '')}</span>
      <span className="opacity-50">heute</span>
    </div>
  )
}
