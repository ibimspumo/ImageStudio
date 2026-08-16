/**
 * Fitting reference images into what a model actually accepts.
 *
 * Every fal.ai image model caps `image_urls` (14 for the Nano Banana family, 16
 * for GPT Image 2). When the user attaches more than that — usually via a large
 * `@collection` — the extra images are not dropped: the biggest groups are
 * merged into numbered collages until the total fits. The collage labels keep
 * describing which originals went where, so the prompt can still refer to them.
 */

import type { LabeledAttachment } from '../types/api'
import { logger } from './logger'

/** How many source images one collage may hold before it stops being readable. */
const MAX_IMAGES_PER_COLLAGE = 16
/** Pixel size of one collage cell. */
const CELL_SIZE = 512

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image for collage'))
    img.src = src
  })
}

/**
 * Draw images into a labelled grid.
 * Each cell carries the index of the original image so the model can be told
 * "the third image in the collage" and resolve it.
 *
 * @param images  base64 data URLs
 * @param startNumber  number printed on the first cell
 */
export async function createLabeledCollage(
  images: string[],
  startNumber: number
): Promise<string> {
  const loaded = await Promise.all(images.map(loadImage))

  const cols = Math.ceil(Math.sqrt(loaded.length))
  const rows = Math.ceil(loaded.length / cols)

  const canvas = document.createElement('canvas')
  canvas.width = cols * CELL_SIZE
  canvas.height = rows * CELL_SIZE
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#111111'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.imageSmoothingQuality = 'high'

  loaded.forEach((img, i) => {
    const x = (i % cols) * CELL_SIZE
    const y = Math.floor(i / cols) * CELL_SIZE

    // Contain-fit so nothing of the reference is cropped away.
    const scale = Math.min(CELL_SIZE / img.width, CELL_SIZE / img.height)
    const w = img.width * scale
    const h = img.height * scale
    ctx.drawImage(img, x + (CELL_SIZE - w) / 2, y + (CELL_SIZE - h) / 2, w, h)

    // Number badge, top-left of the cell
    const label = String(startNumber + i)
    ctx.font = 'bold 40px sans-serif'
    const textWidth = ctx.measureText(label).width
    ctx.fillStyle = 'rgba(0,0,0,0.75)'
    ctx.fillRect(x + 8, y + 8, textWidth + 24, 52)
    ctx.fillStyle = '#ffffff'
    ctx.textBaseline = 'top'
    ctx.fillText(label, x + 20, y + 16)

    // Cell separator
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'
    ctx.lineWidth = 2
    ctx.strokeRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2)
  })

  return canvas.toDataURL('image/jpeg', 0.9)
}

/** Split `count` items into `parts` chunk sizes that differ by at most one. */
function chunkSizes(count: number, parts: number): number[] {
  const base = Math.floor(count / parts)
  const remainder = count % parts
  return Array.from({ length: parts }, (_, i) => base + (i < remainder ? 1 : 0))
}

/**
 * Reduce labelled groups so the flattened image count fits `maxReferences`.
 *
 * Single-image groups are preserved as-is for as long as possible — those are
 * the user's explicit `[Image 1]` mentions. Multi-image groups (collections)
 * absorb the pressure by collapsing into collages.
 */
export async function packReferencesForModel(
  groups: LabeledAttachment[],
  maxReferences: number
): Promise<{ groups: LabeledAttachment[]; collapsed: boolean; dropped: number }> {
  const total = groups.reduce((sum, g) => sum + g.images.length, 0)
  if (total <= maxReferences) return { groups, collapsed: false, dropped: 0 }

  const singles = groups.filter((g) => g.images.length === 1)
  const multis = groups.filter((g) => g.images.length > 1)

  // Nothing to merge — the user attached more individual images than the model
  // takes, so collage them together rather than dropping any.
  if (multis.length === 0) {
    const keep = maxReferences - 1
    const kept = singles.slice(0, keep)
    const rest = singles.slice(keep)
    const restImages = rest.flatMap((g) => g.images)
    const usable = restImages.slice(0, MAX_IMAGES_PER_COLLAGE)
    const collage = await createLabeledCollage(usable, keep + 1)
    return {
      groups: [
        ...kept,
        {
          label: `Collage of ${usable.length} further reference images, numbered ${keep + 1}–${keep + usable.length}, left to right, top to bottom: ${rest
            .slice(0, usable.length)
            .map((g) => g.label)
            .join(', ')}`,
          images: [collage],
        },
      ],
      collapsed: true,
      dropped: restImages.length - usable.length,
    }
  }

  // Slot budget: every group needs at least one slot; multi-image groups share
  // whatever is left over, proportional to their size.
  let budget = maxReferences - singles.length
  if (budget < multis.length) {
    // Too many single images to keep them all — the collections still need room.
    budget = multis.length
  }

  const multiTotal = multis.reduce((sum, g) => sum + g.images.length, 0)
  const slots = multis.map((g) =>
    Math.max(1, Math.min(g.images.length, Math.floor((g.images.length / multiTotal) * budget)))
  )

  // Hand out any slots left after flooring, largest group first.
  let used = slots.reduce((a, b) => a + b, 0)
  const order = multis
    .map((g, i) => ({ i, size: g.images.length }))
    .sort((a, b) => b.size - a.size)
  while (used < budget) {
    let progressed = false
    for (const { i } of order) {
      if (used >= budget) break
      if (slots[i] < multis[i].images.length) {
        slots[i]++
        used++
        progressed = true
      }
    }
    if (!progressed) break
  }

  // Walk the caller's groups in order, expanding each multi-image group into
  // however many collages its slot budget allows.
  let dropped = 0
  let multiIdx = 0
  const result: LabeledAttachment[] = []

  for (const group of groups) {
    if (group.images.length === 1) {
      result.push(group)
      continue
    }

    const slotCount = slots[multiIdx++]
    if (group.images.length <= slotCount) {
      result.push(group)
      continue
    }

    const sizes = chunkSizes(group.images.length, slotCount)
    let offset = 0

    for (let c = 0; c < sizes.length; c++) {
      const chunk = group.images.slice(offset, offset + sizes[c])
      const usable = chunk.slice(0, MAX_IMAGES_PER_COLLAGE)
      dropped += chunk.length - usable.length

      if (usable.length === 1) {
        // A slot holding a single image stays that image — running it through
        // the collage canvas would only rescale it and stamp a badge on it.
        result.push({
          label: `${group.label} — image ${offset + 1} of ${group.images.length}`,
          images: [usable[0]],
        })
      } else {
        result.push({
          label: `${group.label} — collage of images ${offset + 1}–${offset + usable.length} of ${group.images.length}, numbered in the image, left to right, top to bottom`,
          images: [await createLabeledCollage(usable, offset + 1)],
        })
      }
      offset += sizes[c]
    }
  }

  // Last resort: single images still push us over — collapse the tail.
  const finalTotal = result.reduce((sum, g) => sum + g.images.length, 0)
  if (finalTotal > maxReferences) {
    logger.warn(
      'reference-packing',
      `Still ${finalTotal} references after collaging, trimming to ${maxReferences}`
    )
    const trimmed: LabeledAttachment[] = []
    let count = 0
    for (const group of result) {
      if (count + group.images.length > maxReferences) {
        dropped += group.images.length
        continue
      }
      trimmed.push(group)
      count += group.images.length
    }
    return { groups: trimmed, collapsed: true, dropped }
  }

  return { groups: result, collapsed: true, dropped }
}
