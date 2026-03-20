import { useMemo } from 'react'
import { ImageGallery } from '../gallery/ImageGallery'
import { PromptBar } from '../input/PromptBar'
import { WorkspaceBar } from '../workspace/WorkspaceBar'
import { useGalleryStore, type GalleryImage } from '../../stores/gallery-store'
import { useWorkspaceStore } from '../../stores/workspace-store'
import { Sparkles } from 'lucide-react'


interface MainContentProps {
  onImageClick: (images: GalleryImage[], index: number) => void
  onSettingsClick: () => void
  onCollectionsClick: () => void
  onStartChat?: (imageId: string) => void
  onCropImage?: (imageId: string, base64: string) => void
}

export function MainContent({ onImageClick, onSettingsClick, onCollectionsClick, onStartChat, onCropImage }: MainContentProps) {
  const allImages = useGalleryStore((s) => s.images)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)

  // Filter images by active workspace
  const images = useMemo(() => {
    if (activeWorkspaceId === null) return allImages
    return allImages.filter((img) => img.workspaceId === activeWorkspaceId)
  }, [allImages, activeWorkspaceId])

  return (
    <main className="flex-1 flex flex-col min-w-0 h-full relative">
      {/* Ambient background orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden z-0">
        <div className="ambient-orb absolute w-[500px] h-[500px] rounded-full blur-[120px] opacity-[0.035] bg-purple-500 -top-40 -right-40" />
        <div className="ambient-orb-2 absolute w-[400px] h-[400px] rounded-full blur-[100px] opacity-[0.025] bg-blue-500 bottom-20 -left-40" />
      </div>

      {/* Workspace bar */}
      <WorkspaceBar />

      {images.length === 0 && allImages.length === 0 ? (
        /* Empty state with aurora atmosphere — only when truly empty */
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
      ) : images.length === 0 && activeWorkspaceId !== null ? (
        /* Empty workspace state */
        <div className="flex-1 flex flex-col items-center justify-center px-8">
          <div className="w-12 h-12 rounded-xl bg-surface-3 border border-border-dim flex items-center justify-center mb-4">
            <Sparkles className="w-5 h-5 text-text-muted" />
          </div>
          <p className="text-[14px] text-text-muted mb-1">This workspace is empty</p>
          <p className="text-[12px] text-text-muted/60">Generate images or move existing ones here</p>
        </div>
      ) : (
        <ImageGallery images={images} onImageClick={onImageClick} onStartChat={onStartChat} onCropImage={onCropImage} />
      )}

      <PromptBar
        onSettingsClick={onSettingsClick}
        onCollectionsClick={onCollectionsClick}
      />
    </main>
  )
}
