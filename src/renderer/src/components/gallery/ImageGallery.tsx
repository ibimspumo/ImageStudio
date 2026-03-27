import { useRef, useEffect, useMemo, useCallback, useState } from 'react'
import { GalleryCard } from './GalleryCard'
import { useJustifiedLayout, parseAspectRatio } from '../../hooks/useJustifiedLayout'
import type { GalleryImage } from '../../stores/gallery-store'

interface ImageGalleryProps {
  images: GalleryImage[]
  onImageClick: (images: GalleryImage[], index: number) => void
  onStartChat?: (imageId: string) => void
  onCropImage?: (imageId: string, filePath: string) => void
}

const TARGET_ROW_HEIGHT = 240
const GAP = 8

export function ImageGallery({ images, onImageClick, onStartChat, onCropImage }: ImageGalleryProps) {
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

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 pb-4">
      <div ref={containerRef} className="max-w-6xl mx-auto relative" style={{ height: totalHeight }}>
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
                  onStartChat={onStartChat}
                  onCropImage={onCropImage}
                />
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
