import { useMemo } from 'react'

export interface JustifiedItem {
  index: number
  width: number
  height: number
  left: number
  top: number
}

export interface JustifiedRow {
  items: JustifiedItem[]
  height: number
  top: number
}

/**
 * Justified layout algorithm (Google Photos / Flickr style).
 * Fills rows left-to-right, scaling all images in a row to the same height
 * so they span the full container width.
 */
export function computeJustifiedLayout(
  aspectRatios: number[],
  containerWidth: number,
  targetRowHeight: number = 220,
  gap: number = 8
): { rows: JustifiedRow[]; totalHeight: number } {
  if (containerWidth <= 0 || aspectRatios.length === 0) {
    return { rows: [], totalHeight: 0 }
  }

  const rows: JustifiedRow[] = []
  let currentRow: { index: number; ratio: number }[] = []
  let currentRowWidth = 0
  let yOffset = 0

  const finalizeRow = (row: { index: number; ratio: number }[], isLast: boolean) => {
    if (row.length === 0) return

    const totalGap = gap * (row.length - 1)
    const availableWidth = containerWidth - totalGap
    const totalRatio = row.reduce((sum, item) => sum + item.ratio, 0)
    let rowHeight = availableWidth / totalRatio

    // For the last row, don't stretch if it would be too tall
    if (isLast && rowHeight > targetRowHeight * 1.5) {
      rowHeight = targetRowHeight
    }

    const items: JustifiedItem[] = []
    let xOffset = 0

    for (const item of row) {
      const itemWidth = item.ratio * rowHeight
      items.push({
        index: item.index,
        width: itemWidth,
        height: rowHeight,
        left: xOffset,
        top: yOffset
      })
      xOffset += itemWidth + gap
    }

    rows.push({ items, height: rowHeight, top: yOffset })
    yOffset += rowHeight + gap
  }

  for (let i = 0; i < aspectRatios.length; i++) {
    const ratio = aspectRatios[i]
    const widthAtTarget = ratio * targetRowHeight
    currentRow.push({ index: i, ratio })
    currentRowWidth += widthAtTarget

    // Check if adding this image makes the row full
    const totalGap = gap * (currentRow.length - 1)
    if (currentRowWidth + totalGap >= containerWidth) {
      finalizeRow(currentRow, false)
      currentRow = []
      currentRowWidth = 0
    }
  }

  // Finalize last (incomplete) row
  if (currentRow.length > 0) {
    finalizeRow(currentRow, true)
  }

  return { rows, totalHeight: yOffset > 0 ? yOffset - gap : 0 }
}

/** Parse "W:H" string to numeric ratio (width/height). Returns 1 for invalid. */
export function parseAspectRatio(ar: string): number {
  const parts = ar.split(':')
  if (parts.length !== 2) return 1
  const w = parseFloat(parts[0])
  const h = parseFloat(parts[1])
  if (!w || !h || h === 0) return 1
  return w / h
}

export function useJustifiedLayout(
  aspectRatios: number[],
  containerWidth: number,
  targetRowHeight?: number,
  gap?: number
) {
  return useMemo(
    () => computeJustifiedLayout(aspectRatios, containerWidth, targetRowHeight, gap),
    [aspectRatios, containerWidth, targetRowHeight, gap]
  )
}
