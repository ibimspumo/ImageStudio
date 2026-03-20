import { useRef, useEffect, useMemo } from 'react'
import { GalleryCard } from './GalleryCard'
import type { GalleryImage } from '../../stores/gallery-store'

interface ImageGalleryProps {
  images: GalleryImage[]
  onImageClick: (images: GalleryImage[], index: number) => void
  onStartChat?: (imageId: string) => void
  onCropImage?: (imageId: string, base64: string) => void
}

export function ImageGallery({ images, onImageClick, onStartChat, onCropImage }: ImageGalleryProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Scroll to top when new images are added (they prepend)
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [images.length])

  // All completed image data URLs for the lightbox
  const completedImages = useMemo(
    () => images.filter((img) => img.base64DataUrl && !img.isLoading && !img.error),
    [images]
  )
  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 pb-4">
      <div className="max-w-6xl mx-auto columns-2 md:columns-3 lg:columns-4 xl:columns-5 gap-2">
        {images.map((image) => (
          <GalleryCard
            key={image.id}
            image={image}
            onClick={() => {
              if (image.base64DataUrl) {
                const idx = completedImages.findIndex((img) => img.id === image.id)
                onImageClick(completedImages, idx >= 0 ? idx : 0)
              }
            }}
            onStartChat={onStartChat}
            onCropImage={onCropImage}
          />
        ))}
      </div>
    </div>
  )
}
