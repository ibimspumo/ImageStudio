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
      {/* Top bar */}
      <div className="h-12 shrink-0 flex items-center justify-center px-5 drag-region">
        <div className="flex items-center gap-2 opacity-60 hover:opacity-80 transition-opacity">
          <Sparkles className="w-3.5 h-3.5 text-accent-main" />
          <span className="text-[12px] font-medium text-text-secondary tracking-[0.08em] uppercase">ImageStudio</span>
        </div>
      </div>

      {images.length === 0 ? (
        /* Empty state with aurora atmosphere */
        <div className="aurora-bg flex-1 flex flex-col items-center justify-center px-8">
          {/* Floating orb */}
          <div className="relative mb-8">
            <div className="absolute -inset-6 rounded-full bg-accent-main/5 blur-2xl" style={{ animation: 'pulseGlow 4s ease-in-out infinite' }} />
            <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-accent-main/20 to-accent-main/5 border border-accent-main/15 flex items-center justify-center backdrop-blur-sm">
              <Sparkles className="w-7 h-7 text-accent-main" />
            </div>
          </div>
          <h1 className="text-[26px] font-semibold text-text-primary mb-3 tracking-tight">
            What will you create?
          </h1>
          <p className="text-text-muted text-[14px] max-w-md text-center leading-relaxed mb-8">
            Describe your vision, attach references, and generate with Gemini.
          </p>
          {/* Suggestion chips */}
          <div className="flex gap-2 flex-wrap justify-center max-w-lg">
            {['cinematic portrait', 'product mockup', 'abstract art', 'architectural render', 'logo design'].map((s) => (
              <button
                key={s}
                className="no-drag pill-btn px-3.5 py-1.5 rounded-full text-[12px] text-text-muted bg-surface-2/60 border border-border-dim hover:border-border-base hover:text-text-secondary transition-all cursor-default"
              >
                {s}
              </button>
            ))}
          </div>
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
