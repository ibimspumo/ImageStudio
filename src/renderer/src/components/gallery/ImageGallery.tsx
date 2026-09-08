import { isThumbnailImage } from '../../stores/gallery-store'
import { useRef, useEffect, useMemo, useCallback, useState } from 'react'
import { GalleryCard } from './GalleryCard'
import { useJustifiedLayout, parseAspectRatio } from '../../hooks/useJustifiedLayout'
import type { GalleryImage } from '../../stores/gallery-store'

interface ImageGalleryProps {
  images: GalleryImage[]
  onImageClick: (images: GalleryImage[], index: number) => void
  onCreateVariant?: (imageId: string) => void
  onCropImage?: (imageId: string, filePath: string) => void
  onGenerateVideo?: (imageId: string) => void
  /** Thumbnail mode: open the YouTube preview for this image. */
  onPreviewThumbnail?: (images: GalleryImage[], index: number) => void
}

const TARGET_ROW_HEIGHT = 280
const GAP = 12

export function ImageGallery({ images, onImageClick, onCreateVariant, onCropImage, onGenerateVideo, onPreviewThumbnail }: ImageGalleryProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [images.length])

  // Track container width with ResizeObserver
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        setContainerWidth(entry.contentRect.width)
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const completedImages = useMemo(
    () => images.filter((img) => img.filePath && !img.isLoading && !img.error),
    [images]
  )

  const aspectRatios = useMemo(
    () => images.map((img) => {
      if (img.isLoading || img.error) return 1 // square fallback for loading/error
      return parseAspectRatio(img.aspectRatio)
    }),
    [images]
  )

  const { rows, totalHeight } = useJustifiedLayout(aspectRatios, containerWidth, TARGET_ROW_HEIGHT, GAP)

  // Stable callback that GalleryCard can use — avoids inline closure per card
  const handleCardClick = useCallback(
    (imageId: string, filePath: string) => {
      if (!filePath) return
      const idx = completedImages.findIndex((img) => img.id === imageId)
      onImageClick(completedImages, idx >= 0 ? idx : 0)
    },
    [completedImages, onImageClick]
  )

  const handlePreview = useCallback(
    (imageId: string) => {
      if (!onPreviewThumbnail) return
      const thumbnails = completedImages.filter((img) => img.type !== 'video' && isThumbnailImage(img))
      const idx = thumbnails.findIndex((img) => img.id === imageId)
      if (idx >= 0) onPreviewThumbnail(thumbnails, idx)
    },
    [completedImages, onPreviewThumbnail]
  )

  return (
    <div
      ref={scrollRef}
      className="flex-1 min-h-0 overflow-y-auto px-5 md:px-8 pt-2"
      // Measured live in MainContent — the last row always clears the bar.
      style={{ paddingBottom: 'calc(var(--prompt-bar-h, 160px) + 24px)' }}
    >
      <div ref={containerRef} className="w-full relative" style={{ height: totalHeight }}>
        {rows.flatMap((row) =>
          row.items.map((item) => {
            const image = images[item.index]
            if (!image) return null
            return (
              <div
                key={image.id}
                className="absolute"
                style={{
                  left: item.left,
                  top: item.top,
                  width: item.width,
                  height: item.height
                }}
              >
                <GalleryCard
                  image={image}
                  onClick={handleCardClick}
                  onCreateVariant={onCreateVariant}
                  onCropImage={onCropImage}
                  onGenerateVideo={onGenerateVideo}
                  onPreviewThumbnail={onPreviewThumbnail && isThumbnailImage(image) ? handlePreview : undefined}
                />
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
