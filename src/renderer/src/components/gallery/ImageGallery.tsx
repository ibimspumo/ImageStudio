import { useRef, useEffect, useMemo } from 'react'
import { GalleryCard } from './GalleryCard'
import type { GalleryImage } from '../../stores/gallery-store'

interface ImageGalleryProps {
  images: GalleryImage[]
  onImageClick: (images: GalleryImage[], index: number) => void
  onStartChat?: (imageId: string) => void
  onCropImage?: (imageId: string, filePath: string) => void
}

export function ImageGallery({ images, onImageClick, onStartChat, onCropImage }: ImageGalleryProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [images.length])

  const completedImages = useMemo(
    () => images.filter((img) => img.filePath && !img.isLoading && !img.error),
    [images]
  )
  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 pb-4">
      <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
        {images.map((image) => (
          <GalleryCard
            key={image.id}
            image={image}
            onClick={() => {
              if (image.filePath) {
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
