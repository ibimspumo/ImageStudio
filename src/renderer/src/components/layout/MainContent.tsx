import { ImageGallery } from '../gallery/ImageGallery'
import { PromptBar } from '../input/PromptBar'
import { useGalleryStore, type GalleryImage } from '../../stores/gallery-store'
import { Sparkles } from 'lucide-react'

interface MainContentProps {
  onImageClick: (images: GalleryImage[], index: number) => void
  onSettingsClick: () => void
  onCollectionsClick: () => void
  onStartChat?: (imageId: string) => void
}

export function MainContent({ onImageClick, onSettingsClick, onCollectionsClick, onStartChat }: MainContentProps) {
  const images = useGalleryStore((s) => s.images)

  return (
    <main className="flex-1 flex flex-col min-w-0 h-full">
      {/* Minimal top bar */}
      <div className="h-12 shrink-0 flex items-center justify-center px-5 drag-region">
        <Sparkles className="w-4 h-4 text-accent-main mr-2" />
        <span className="text-[13px] font-medium text-text-secondary tracking-wide">ImageStudio</span>
      </div>

      {images.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center px-8">
          <div className="w-14 h-14 rounded-2xl bg-accent-dim flex items-center justify-center mb-5">
            <Sparkles className="w-6 h-6 text-accent-main" />
          </div>
          <h1 className="text-[22px] font-semibold text-text-primary mb-2 tracking-tight">
            Generate images
          </h1>
          <p className="text-text-muted text-[14px] max-w-sm text-center leading-relaxed">
            Describe what you want to create. Drop or attach reference images. Generate multiple at once.
          </p>
        </div>
      ) : (
        <ImageGallery images={images} onImageClick={onImageClick} onStartChat={onStartChat} />
      )}

      <PromptBar
        onSettingsClick={onSettingsClick}
        onCollectionsClick={onCollectionsClick}
      />
    </main>
  )
}
