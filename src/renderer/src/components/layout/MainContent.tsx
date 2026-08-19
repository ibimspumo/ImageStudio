import { useMemo } from 'react'
import { ImageGallery } from '../gallery/ImageGallery'
import { PromptBar } from '../input/PromptBar'
import { VideoPromptBar } from '../input/VideoPromptBar'
import { WorkspaceBar } from '../workspace/WorkspaceBar'
import { useGalleryStore, isThumbnailImage, isLogoImage, type GalleryImage } from '../../stores/gallery-store'
import { useWorkspaceStore } from '../../stores/workspace-store'
import { useGalleryFilterStore } from '../../stores/gallery-filter-store'
import { GalleryToolbar } from '../gallery/GalleryToolbar'
import { SmartAlbumBar } from '../gallery/SmartAlbumBar'
import { ProjectBar } from '../thumbnail/ProjectBar'
import { useThumbnailProjectsStore } from '../../stores/thumbnail-projects-store'
import { Sparkles, SearchX, ImageIcon, Film, Youtube, Hexagon } from 'lucide-react'
import { cn } from '../../lib/utils'


export type AppMode = 'image' | 'video' | 'thumbnail' | 'logo'

interface MainContentProps {
  onImageClick: (images: GalleryImage[], index: number) => void
  onSettingsClick: () => void
  onCollectionsClick: () => void
  onStartChat?: (imageId: string) => void
  onCropImage?: (imageId: string, filePath: string) => void
  onPresetsManage?: () => void
  onQueueClick?: () => void
  queuePendingCount?: number
  onCanvasClick?: () => void
  mode: AppMode
  onModeChange: (mode: AppMode) => void
  videoStartFrame?: { base64: string; name: string } | null
  onGenerateVideo?: (imageId: string) => void
  onPreviewThumbnail?: (images: GalleryImage[], index: number) => void
}

export function MainContent({ onImageClick, onSettingsClick, onCollectionsClick, onStartChat, onCropImage, onPresetsManage, onQueueClick, queuePendingCount, onCanvasClick, mode, onModeChange, videoStartFrame, onGenerateVideo, onPreviewThumbnail }: MainContentProps) {
  const allImages = useGalleryStore((s) => s.images)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const activeProjectId = useThumbnailProjectsStore((s) => s.activeProjectId)
  const searchQuery = useGalleryFilterStore((s) => s.searchQuery)
  const filterModels = useGalleryFilterStore((s) => s.filterModels)
  const filterAspectRatios = useGalleryFilterStore((s) => s.filterAspectRatios)
  const filterDateRange = useGalleryFilterStore((s) => s.filterDateRange)
  const sortBy = useGalleryFilterStore((s) => s.sortBy)
  const favoritesOnly = useGalleryFilterStore((s) => s.favoritesOnly)
  const filterTags = useGalleryFilterStore((s) => s.filterTags)
  const filterType = useGalleryFilterStore((s) => s.filterType)
  const activeSmartAlbum = useGalleryFilterStore((s) => s.activeSmartAlbum)
  const clearFilters = useGalleryFilterStore((s) => s.clearFilters)

  const thumbnailCount = useMemo(() => allImages.filter(isThumbnailImage).length, [allImages])
  const logoCount = useMemo(() => allImages.filter(isLogoImage).length, [allImages])

  const images = useMemo(() => {
    // Thumbnail mode runs on its own axis: projects instead of workspaces.
    if (mode === 'thumbnail') {
      let thumbs = allImages.filter(isThumbnailImage)
      if (activeProjectId !== null) thumbs = thumbs.filter((img) => img.projectId === activeProjectId)
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        thumbs = thumbs.filter((img) => img.prompt.toLowerCase().includes(q))
      }
      if (favoritesOnly) thumbs = thumbs.filter((img) => img.isFavorite)
      if (sortBy === 'oldest') thumbs = [...thumbs].sort((a, b) => a.timestamp - b.timestamp)
      return thumbs
    }

    // Logo mode keeps the workspace axis — a logo is a normal asset, it just
    // has an alpha channel — and only narrows the gallery to what it produced.
    if (mode === 'logo') {
      let logos = allImages.filter(isLogoImage)
      if (activeWorkspaceId !== null) logos = logos.filter((img) => img.workspaceId === activeWorkspaceId)
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        logos = logos.filter((img) => img.prompt.toLowerCase().includes(q))
      }
      if (favoritesOnly) logos = logos.filter((img) => img.isFavorite)
      if (sortBy === 'oldest') logos = [...logos].sort((a, b) => a.timestamp - b.timestamp)
      return logos
    }

    let filtered = activeWorkspaceId === null ? allImages : allImages.filter((img) => img.workspaceId === activeWorkspaceId)

    // Smart album filter (takes priority — these are predefined filter shortcuts)
    if (activeSmartAlbum) {
      if (activeSmartAlbum === 'favorites') {
        filtered = filtered.filter((img) => img.isFavorite)
      } else if (activeSmartAlbum === 'today') {
        const todayStart = new Date()
        todayStart.setHours(0, 0, 0, 0)
        filtered = filtered.filter((img) => img.timestamp >= todayStart.getTime())
      } else if (activeSmartAlbum === 'videos') {
        filtered = filtered.filter((img) => img.type === 'video')
      } else if (activeSmartAlbum.startsWith('model:')) {
        const model = activeSmartAlbum.slice(6)
        filtered = filtered.filter((img) => img.model === model)
      } else if (activeSmartAlbum.startsWith('tag:')) {
        const tag = activeSmartAlbum.slice(4)
        filtered = filtered.filter((img) => img.tags?.includes(tag))
      }
    }

    // Search query (case-insensitive on prompt + tags)
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter((img) =>
        img.prompt.toLowerCase().includes(q) ||
        img.tags?.some((t) => t.toLowerCase().includes(q))
      )
    }

    // Model filter
    if (filterModels.length > 0) {
      filtered = filtered.filter((img) => filterModels.includes(img.model))
    }

    // Aspect ratio filter
    if (filterAspectRatios.length > 0) {
      filtered = filtered.filter((img) => filterAspectRatios.includes(img.aspectRatio))
    }

    // Date range filter
    if (filterDateRange) {
      const now = Date.now()
      const cutoff = filterDateRange === 'today' ? now - 86400000
        : filterDateRange === 'week' ? now - 604800000
        : filterDateRange === 'month' ? now - 2592000000
        : 0
      if (cutoff > 0) {
        filtered = filtered.filter((img) => img.timestamp >= cutoff)
      }
    }

    // Favorites filter
    if (favoritesOnly) {
      filtered = filtered.filter((img) => img.isFavorite)
    }

    // Tag filter
    if (filterTags.length > 0) {
      filtered = filtered.filter((img) => img.tags?.some((t) => filterTags.includes(t)))
    }

    // Type filter (images / videos / all)
    if (filterType === 'images') {
      filtered = filtered.filter((img) => img.type !== 'video')
    } else if (filterType === 'videos') {
      filtered = filtered.filter((img) => img.type === 'video')
    }

    // Sort
    if (sortBy === 'oldest') {
      filtered = [...filtered].sort((a, b) => a.timestamp - b.timestamp)
    }
    // default 'newest' is already the store order (newest first)

    return filtered
  }, [allImages, activeWorkspaceId, activeSmartAlbum, searchQuery, filterModels, filterAspectRatios, filterDateRange, sortBy, favoritesOnly, filterTags, filterType, mode, activeProjectId])

  const hasActiveFilters = searchQuery || filterModels.length > 0 || filterAspectRatios.length > 0 || filterDateRange || favoritesOnly || filterTags.length > 0 || activeSmartAlbum || filterType !== 'all'

  // Collect all tags for toolbar autocomplete
  const allTags = useMemo(() => {
    const tags = new Set<string>()
    for (const img of allImages) {
      if (img.tags) for (const t of img.tags) tags.add(t)
    }
    return Array.from(tags)
  }, [allImages])

  return (
    <main className="flex-1 flex flex-col min-w-0 h-full relative">
      {/* Ambient background orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden z-0">
        <div className="ambient-orb absolute w-[500px] h-[500px] rounded-full blur-[120px] opacity-[0.035] bg-purple-500 -top-40 -right-40" />
        <div className="ambient-orb-2 absolute w-[400px] h-[400px] rounded-full blur-[100px] opacity-[0.025] bg-blue-500 bottom-20 -left-40" />
      </div>

      {/* Mode toggle + Workspace bar */}
      <div className="flex items-center gap-2 px-4 pt-1">
        <div className="flex gap-0.5 bg-surface-2 rounded-lg p-0.5 border border-border-dim">
          <button
            onClick={() => onModeChange('image')}
            className={cn(
              'no-drag flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-medium transition-all',
              mode === 'image'
                ? 'bg-surface-4 text-text-primary shadow-sm'
                : 'text-text-muted hover:text-text-secondary'
            )}
          >
            <ImageIcon className="w-3 h-3" />
            Image
          </button>
          <button
            onClick={() => onModeChange('video')}
            className={cn(
              'no-drag flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-medium transition-all',
              mode === 'video'
                ? 'bg-surface-4 text-text-primary shadow-sm'
                : 'text-text-muted hover:text-text-secondary'
            )}
          >
            <Film className="w-3 h-3" />
            Video
          </button>
          <button
            onClick={() => onModeChange('thumbnail')}
            className={cn(
              'no-drag flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-medium transition-all',
              mode === 'thumbnail'
                ? 'bg-danger/15 text-danger shadow-sm'
                : 'text-text-muted hover:text-text-secondary'
            )}
          >
            <Youtube className="w-3 h-3" />
            Thumbnail
          </button>
          <button
            onClick={() => onModeChange('logo')}
            className={cn(
              'no-drag flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-medium transition-all',
              mode === 'logo'
                ? 'bg-surface-4 text-text-primary shadow-sm'
                : 'text-text-muted hover:text-text-secondary'
            )}
          >
            <Hexagon className="w-3 h-3" />
            Logo
          </button>
        </div>
      </div>

      {mode === 'thumbnail' ? <ProjectBar /> : <WorkspaceBar />}

      {/* Gallery toolbar & smart albums — only when gallery has images.
          Thumbnail mode keeps search and sorting but drops the smart albums,
          which filter on axes (videos, models) that mean nothing here. */}
      {mode === 'thumbnail' ? (
        thumbnailCount > 0 && (
          <GalleryToolbar allTags={allTags} totalCount={thumbnailCount} filteredCount={images.length} />
        )
      ) : mode === 'logo' ? (
        logoCount > 0 && (
          <GalleryToolbar allTags={allTags} totalCount={logoCount} filteredCount={images.length} />
        )
      ) : allImages.length > 0 ? (
        <>
          <GalleryToolbar allTags={allTags} totalCount={allImages.length} filteredCount={images.length} />
          <SmartAlbumBar images={allImages} />
        </>
      ) : null}

      {mode === 'thumbnail' ? (
        images.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center px-8">
            <div className="w-14 h-14 rounded-2xl bg-danger/10 border border-danger/20 flex items-center justify-center mb-5">
              <Youtube className="w-6 h-6 text-danger" />
            </div>
            <h2 className="text-[18px] font-semibold text-text-primary mb-2">
              {activeProjectId ? 'Noch kein Thumbnail für dieses Video' : 'Noch keine Thumbnails'}
            </h2>
            <p className="text-text-muted text-[13px] max-w-sm text-center leading-relaxed">
              16:9 und 2K sind gesetzt, die Thumbnail-Regeln laufen automatisch mit.
              Beschreibe die eine Idee — Motiv, Emotion, Situation.
            </p>
          </div>
        ) : (
          <ImageGallery
            images={images}
            onImageClick={onImageClick}
            onStartChat={onStartChat}
            onCropImage={onCropImage}
            onPreviewThumbnail={onPreviewThumbnail}
          />
        )
      ) : mode === 'logo' ? (
        images.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center px-8">
            <div className="w-14 h-14 rounded-2xl bg-accent-main/10 border border-accent-main/20 flex items-center justify-center mb-5">
              <Hexagon className="w-6 h-6 text-accent-main" />
            </div>
            <h2 className="text-[18px] font-semibold text-text-primary mb-2">Noch keine Logos</h2>
            <p className="text-text-muted text-[13px] max-w-sm text-center leading-relaxed">
              GPT Image 1.5 liefert hier ein transparentes PNG — kein JPEG, kein weißer Kasten.
              Beschreibe die Marke und die eine Form.
            </p>
          </div>
        ) : (
          <ImageGallery
            images={images}
            onImageClick={onImageClick}
            onStartChat={onStartChat}
            onCropImage={onCropImage}
          />
        )
      ) : allImages.length === 0 ? (
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
            Describe your vision, attach references, and generate with Nano Banana or GPT Image.
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
      ) : images.length === 0 && activeWorkspaceId !== null && !hasActiveFilters ? (
        /* Empty workspace state */
        <div className="flex-1 flex flex-col items-center justify-center px-8">
          <div className="w-12 h-12 rounded-xl bg-surface-3 border border-border-dim flex items-center justify-center mb-4">
            <Sparkles className="w-5 h-5 text-text-muted" />
          </div>
          <p className="text-[14px] text-text-muted mb-1">This workspace is empty</p>
          <p className="text-[12px] text-text-muted/60">Generate images or move existing ones here</p>
        </div>
      ) : images.length === 0 && hasActiveFilters ? (
        /* No filter results state */
        <div className="flex-1 flex flex-col items-center justify-center px-8">
          <div className="w-12 h-12 rounded-xl bg-surface-3 border border-border-dim flex items-center justify-center mb-4">
            <SearchX className="w-5 h-5 text-text-muted" />
          </div>
          <p className="text-[14px] text-text-muted mb-1">No images match your filters</p>
          <button onClick={clearFilters} className="text-[12px] text-accent-main hover:text-accent-bright transition-colors mt-2">
            Clear all filters
          </button>
        </div>
      ) : (
        <ImageGallery images={images} onImageClick={onImageClick} onStartChat={onStartChat} onCropImage={onCropImage} onGenerateVideo={onGenerateVideo} />
      )}

      <div className="absolute bottom-0 left-0 right-0 z-20 pointer-events-none bg-gradient-to-t from-surface-0 via-surface-0/80 to-transparent pt-12">
        <div className="pointer-events-auto">
          {mode === 'video' ? (
            <VideoPromptBar
              onSettingsClick={onSettingsClick}
              initialStartFrame={videoStartFrame}
            />
          ) : mode === 'thumbnail' ? (
            <PromptBar
              key="thumbnail-prompt"
              thumbnailMode
              onSettingsClick={onSettingsClick}
              onCollectionsClick={onCollectionsClick}
              onQueueClick={onQueueClick}
            />
          ) : mode === 'logo' ? (
            <PromptBar
              key="logo-prompt"
              logoMode
              onSettingsClick={onSettingsClick}
              onCollectionsClick={onCollectionsClick}
              onQueueClick={onQueueClick}
            />
          ) : (
            <PromptBar
              key="image-prompt"
              onSettingsClick={onSettingsClick}
              onCollectionsClick={onCollectionsClick}
              onPresetsManage={onPresetsManage}
              onQueueClick={onQueueClick}
              onCanvasClick={onCanvasClick}
            />
          )}
        </div>
      </div>
    </main>
  )
}
