import { renderYouTubeThumbnail } from './image-utils'

export type ExportFormat = 'png' | 'jpeg' | 'webp'

const MIME_TYPES: Record<ExportFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

export function convertImage(
  src: string,
  format: ExportFormat,
  quality: number
): Promise<{ dataUrl: string; sizeBytes: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('Canvas not supported')); return }

      // For JPEG, fill with white background (no transparency)
      if (format === 'jpeg') {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      }

      ctx.drawImage(img, 0, 0)

      const mimeType = MIME_TYPES[format]
      const q = format === 'png' ? undefined : quality / 100

      canvas.toBlob(
        (blob) => {
          if (!blob) { reject(new Error('Conversion failed')); return }
          const reader = new FileReader()
          reader.onload = () => {
            resolve({
              dataUrl: reader.result as string,
              sizeBytes: blob.size,
            })
          }
          reader.readAsDataURL(blob)
        },
        mimeType,
        q
      )
    }
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = src
  })
}


/** Shared by thumbnail preview export and automation; fixed YouTube dimensions. */
export async function renderThumbnailExport(src: string) {
  let rendered = await renderYouTubeThumbnail(src, 0.92)
  for (const quality of [0.85, 0.78, 0.7]) {
    if (rendered.bytes <= 2_000_000) break
    rendered = await renderYouTubeThumbnail(src, quality)
  }
  return rendered
}
