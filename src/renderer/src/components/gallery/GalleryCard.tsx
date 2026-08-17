import { useState, useRef, useCallback, memo } from 'react'
import { Download, Copy, Maximize2, X, AlertCircle, MessageSquare, Trash2, FolderInput, Crop, Star, Play, Film, Youtube } from 'lucide-react'
import { useGalleryStore, type GalleryImage, toDisplayUrl } from '../../stores/gallery-store'
import { useWorkspaceStore } from '../../stores/workspace-store'
import { useThumbnailProjectsStore } from '../../stores/thumbnail-projects-store'
import { useSettingsStore } from '../../stores/settings-store'
import { cn } from '../../lib/utils'
import { logger } from '../../lib/logger'
import { neutralImageName } from '../../lib/anti-detection'

interface GalleryCardProps {
  image: GalleryImage
  onClick: (imageId: string, filePath: string) => void
  onStartChat?: (imageId: string) => void
  onCropImage?: (imageId: string, filePath: string) => void
  onGenerateVideo?: (imageId: string) => void
  /** Thumbnail mode: open the YouTube preview instead of the plain lightbox. */
  onPreviewThumbnail?: (imageId: string) => void
}

export const GalleryCard = memo(function GalleryCard({ image, onClick, onStartChat, onCropImage, onGenerateVideo, onPreviewThumbnail }: GalleryCardProps) {
  const removeImage = useGalleryStore((s) => s.removeImage)
  const toggleFavorite = useGalleryStore((s) => s.toggleFavorite)
  const moveToWorkspace = useGalleryStore((s) => s.moveToWorkspace)
  const moveToProject = useGalleryStore((s) => s.moveToProject)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const projects = useThumbnailProjectsStore((s) => s.projects)
  const antiDetection = useSettingsStore((s) => s.antiDetection)
  const isThumbnailMode = !!onPreviewThumbnail
  const [showMoveMenu, setShowMoveMenu] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const isVideo = image.type === 'video'

  const handleMouseEnter = useCallback(() => {
    if (isVideo && videoRef.current) {
      videoRef.current.currentTime = 0
      videoRef.current.play().catch(() => {})
    }
  }, [isVideo])

  const handleMouseLeave = useCallback(() => {
    setShowMoveMenu(false)
    if (isVideo && videoRef.current) {
      videoRef.current.pause()
      videoRef.current.currentTime = 0
    }
  }, [isVideo])

  if (image.isLoading) {
    return (
      <div className="skeleton w-full h-full rounded-2xl relative">
        {image.statusText && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[11px] font-medium text-text-muted/80 bg-surface-1/60 backdrop-blur-sm px-3 py-1.5 rounded-lg">
              {image.statusText}
            </span>
          </div>
        )}
      </div>
    )
  }

  if (image.error) {
    return (
      <div className="w-full h-full rounded-xl bg-surface-2 border border-border-base flex items-center gap-2.5 px-3 py-3 relative group">
        <AlertCircle className="w-4 h-4 text-danger shrink-0" />
        <p className="text-[11px] text-danger leading-tight flex-1 line-clamp-2">{image.error}</p>
        <button onClick={() => removeImage(image.id)} className="p-1 text-text-muted hover:text-danger transition-colors shrink-0 opacity-0 group-hover:opacity-100">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    )
  }

  const displayUrl = toDisplayUrl(image.filePath)

  const handleSave = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      if (isVideo) {
        const name = antiDetection ? neutralImageName('mp4') : `imagestudio-${image.id}.mp4`
        await window.api.exportVideo(image.filePath, name)
      } else {
        const result = await window.api.readImage(image.filePath)
        if (result.success) {
          // Keep the stored file's extension — with anti-detection on it is a JPEG.
          const ext = image.filePath.split('.').pop()?.toLowerCase() || 'png'
          const name = antiDetection ? neutralImageName(ext) : `imagestudio-${image.id}.png`
          await window.api.exportImage(result.base64DataUrl, name)
        }
      }
    } catch (err) { logger.error('GalleryCard', 'Operation failed', err) }
  }

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const result = await window.api.readImage(image.filePath)
      if (result.success) {
        const response = await fetch(result.base64DataUrl)
        const blob = await response.blob()
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
      }
    } catch (err) { logger.error('GalleryCard', 'Operation failed', err) }
  }

  const handleDragStart = (e: React.DragEvent) => {
    // For internal drag-drop, pass file path
    e.dataTransfer.setData('text/plain', image.filePath)
    e.dataTransfer.setData('application/x-imagestudio', image.filePath)
    e.dataTransfer.effectAllowed = 'copy'
  }

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (window.confirm('Delete this image?')) {
      removeImage(image.id)
    }
  }

  const handleMoveClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowMoveMenu(!showMoveMenu)
  }

  // In thumbnail mode the same control files the image under a video instead.
  const handleMove = (e: React.MouseEvent, targetId: string | undefined) => {
    e.stopPropagation()
    if (isThumbnailMode) moveToProject(image.id, targetId)
    else moveToWorkspace(image.id, targetId)
    setShowMoveMenu(false)
  }

  const moveTargets = isThumbnailMode
    ? projects.map((p) => ({ id: p.id, name: p.title, color: p.color }))
    : workspaces.map((w) => ({ id: w.id, name: w.name, color: w.color }))
  const currentTargetId = isThumbnailMode ? image.projectId : image.workspaceId

  const currentWorkspace = isThumbnailMode
    ? projects.find((p) => p.id === image.projectId) ?? null
    : image.workspaceId
      ? workspaces.find((w) => w.id === image.workspaceId)
      : null

  return (
    <div
      className="img-card relative group rounded-2xl overflow-hidden cursor-pointer border border-border-dim/60 animate-fade-up w-full h-full"
      onClick={() => onClick(image.id, image.filePath)}
      draggable={!isVideo}
      onDragStart={isVideo ? undefined : handleDragStart}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {isVideo ? (
        <video
          ref={videoRef}
          src={displayUrl}
          className="w-full h-full object-cover block"
          muted
          loop
          playsInline
          preload="metadata"
          draggable={false}
        />
      ) : (
        <img
          src={displayUrl}
          alt={image.prompt}
          className="w-full h-full object-cover block"
          loading="lazy"
          draggable={false}
        />
      )}

      {/* Video overlay: play icon + duration badge */}
      {isVideo && (
        <>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center border border-white/10">
              <Play className="w-5 h-5 text-white fill-white ml-0.5" />
            </div>
          </div>
          {image.videoDuration && (
            <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm text-white text-[10px] font-medium px-1.5 py-0.5 rounded-md flex items-center gap-1 z-[5]">
              <Film className="w-2.5 h-2.5" />
              {image.videoDuration}s
            </div>
          )}
        </>
      )}

      {currentWorkspace && (
        <div
          className="absolute bottom-0 left-0 right-0 h-[3px] opacity-60"
          style={{ backgroundColor: currentWorkspace.color }}
        />
      )}

      <button
        onClick={(e) => { e.stopPropagation(); toggleFavorite(image.id) }}
        className={cn(
          'btn-interactive absolute top-2 left-2 z-10 p-1.5 rounded-lg bg-black/50 backdrop-blur-md border border-white/5 hover:bg-white/20 transition-colors',
          image.isFavorite ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        )}
        title="Favorite"
      >
        <Star className={cn('w-3.5 h-3.5', image.isFavorite ? 'text-amber-400 fill-amber-400' : 'text-white')} />
      </button>

      <button
        onClick={handleDelete}
        className={cn(
          'btn-interactive absolute right-2 z-10 p-1.5 rounded-lg bg-black/50 backdrop-blur-md border border-white/5 hover:bg-danger/80 transition-colors opacity-0 group-hover:opacity-100',
          isVideo && image.videoDuration ? 'top-10' : 'top-2'
        )}
        title="Delete"
      >
        <Trash2 className="w-3.5 h-3.5 text-white" />
      </button>

      <div className="img-overlay absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent opacity-0 transition-opacity duration-200 flex items-end p-3">
        {/* Anchored to the card, not the button — the card clips its overflow,
            so a button-anchored menu loses whatever sticks out. */}
        {showMoveMenu && moveTargets.length > 0 && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute left-3 right-3 bottom-14 max-h-[min(220px,60%)] overflow-y-auto bg-surface-3 border border-border-base rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.5)] p-1 animate-scale-in z-20"
          >
            <button
              onClick={(e) => handleMove(e, undefined)}
              className={cn(
                'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] text-left transition-colors',
                !currentTargetId
                  ? 'bg-surface-4 text-text-primary font-medium'
                  : 'text-text-secondary hover:bg-surface-4 hover:text-text-primary'
              )}
            >
              <div className="w-2 h-2 rounded-full bg-text-muted/40 shrink-0" />
              {isThumbnailMode ? 'Kein Video' : 'None'}
            </button>
            {moveTargets.map((target) => (
              <button
                key={target.id}
                onClick={(e) => handleMove(e, target.id)}
                className={cn(
                  'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] text-left transition-colors',
                  currentTargetId === target.id
                    ? 'bg-surface-4 text-text-primary font-medium'
                    : 'text-text-secondary hover:bg-surface-4 hover:text-text-primary'
                )}
              >
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: target.color }}
                />
                <span className="truncate">{target.name}</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-1.5 w-full flex-wrap">
          <button onClick={handleSave} className="btn-interactive p-2 rounded-lg bg-white/10 backdrop-blur-md border border-white/5 hover:bg-white/20 transition-colors" title="Save">
            <Download className="w-3.5 h-3.5 text-white" />
          </button>
          <button onClick={handleCopy} className="btn-interactive p-2 rounded-lg bg-white/10 backdrop-blur-md border border-white/5 hover:bg-white/20 transition-colors" title="Copy">
            <Copy className="w-3.5 h-3.5 text-white" />
          </button>
          {onStartChat && !isVideo && (
            <button
              onClick={(e) => { e.stopPropagation(); onStartChat(image.id) }}
              className="btn-interactive p-2 rounded-lg bg-accent-main/20 backdrop-blur-md border border-accent-main/20 hover:bg-accent-main/30 transition-colors"
              title="Edit in chat"
            >
              <MessageSquare className="w-3.5 h-3.5 text-accent-bright" />
            </button>
          )}
          {onCropImage && !isVideo && (
            <button
              onClick={(e) => { e.stopPropagation(); onCropImage(image.id, image.filePath) }}
              className="btn-interactive p-2 rounded-lg bg-white/10 backdrop-blur-md border border-white/5 hover:bg-white/20 transition-colors"
              title="Crop as reference"
            >
              <Crop className="w-3.5 h-3.5 text-white" />
            </button>
          )}
          {onGenerateVideo && !isVideo && (
            <button
              onClick={(e) => { e.stopPropagation(); onGenerateVideo(image.id) }}
              className="btn-interactive p-2 rounded-lg bg-white/10 backdrop-blur-md border border-white/5 hover:bg-white/20 transition-colors"
              title="Generate video from this image"
            >
              <Film className="w-3.5 h-3.5 text-white" />
            </button>
          )}
          {onPreviewThumbnail && (
            <button
              onClick={(e) => { e.stopPropagation(); onPreviewThumbnail(image.id) }}
              className="btn-interactive p-2 rounded-lg bg-danger/25 backdrop-blur-md border border-danger/25 hover:bg-danger/40 transition-colors"
              title="YouTube-Vorschau"
            >
              <Youtube className="w-3.5 h-3.5 text-white" />
            </button>
          )}
          {moveTargets.length > 0 && (
            <div className="relative">
              <button
                onClick={handleMoveClick}
                className={cn(
                  'btn-interactive p-2 rounded-lg backdrop-blur-md border transition-colors',
                  showMoveMenu
                    ? 'bg-white/20 border-white/10'
                    : 'bg-white/10 border-white/5 hover:bg-white/20'
                )}
                title={isThumbnailMode ? 'In Video verschieben' : 'Move to workspace'}
              >
                <FolderInput className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
          )}
          <div className="flex-1" />
          <button onClick={(e) => { e.stopPropagation(); onClick(image.id, image.filePath) }} className="btn-interactive p-2 rounded-lg bg-white/10 backdrop-blur-md border border-white/5 hover:bg-white/20 transition-colors" title="Expand">
            <Maximize2 className="w-3.5 h-3.5 text-white" />
          </button>
        </div>
      </div>
    </div>
  )
})
