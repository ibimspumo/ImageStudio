import { ImageCard } from './ImageCard'
import type { GeneratedImage } from '../../types/chat'
import { cn } from '../../lib/utils'

interface ImageGridProps {
  images: GeneratedImage[]
  isLoading?: boolean
  loadingCount?: number
  onImageClick: (src: string) => void
}

export function ImageGrid({ images, isLoading, loadingCount = 1, onImageClick }: ImageGridProps) {
  const count = isLoading ? loadingCount : images.length

  return (
    <div
      className={cn(
        'grid gap-3',
        count === 1 && 'grid-cols-1 max-w-md',
        count === 2 && 'grid-cols-2 max-w-2xl',
        count === 3 && 'grid-cols-2 max-w-2xl',
        count >= 4 && 'grid-cols-2 max-w-2xl'
      )}
    >
      {isLoading
        ? Array.from({ length: loadingCount }, (_, i) => (
            <div key={i} className="skeleton aspect-square rounded-2xl" />
          ))
        : images.map((image, i) => (
            <ImageCard
              key={image.id}
              image={image}
              onClick={() => onImageClick(image.base64DataUrl)}
              index={i}
            />
          ))}
    </div>
  )
}
