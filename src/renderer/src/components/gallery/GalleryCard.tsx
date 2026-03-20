import { useState } from 'react'
import { Download, Copy, Maximize2, X, AlertCircle, MessageSquare, Trash2, FolderInput, Crop } from 'lucide-react'
import { useGalleryStore, type GalleryImage, toDisplayUrl } from '../../stores/gallery-store'
import { useWorkspaceStore } from '../../stores/workspace-store'
import { cn } from '../../lib/utils'

interface GalleryCardProps {
  image: GalleryImage
  onClick: () => void
  onStartChat?: (imageId: string) => void
  onCropImage?: (imageId: string, filePath: string) => void
}

export function GalleryCard({ image, onClick, onStartChat, onCropImage }: GalleryCardProps) {
  const removeImage = useGalleryStore((s) => s.removeImage)
  const moveToWorkspace = useGalleryStore((s) => s.moveToWorkspace)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const [showMoveMenu, setShowMoveMenu] = useState(false)

  if (image.isLoading) {
    return (
      <div className="skeleton aspect-square rounded-2xl" />
    )
  }

  if (image.error) {
    return (
      <div className="rounded-xl bg-surface-2 border border-border-base flex items-center gap-2.5 px-3 py-3 relative group">
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
    // Read base64 from disk for export dialog
    try {
      const result = await window.api.readImage(image.filePath)
      if (result.success) {
        await window.api.exportImage(result.base64DataUrl, `imagestudio-${image.id}.png`)
      }
    } catch { /* silent */ }
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
    } catch { /* silent */ }
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

  const handleMove = (e: React.MouseEvent, workspaceId: string | undefined) => {
    e.stopPropagation()
    moveToWorkspace(image.id, workspaceId)
    setShowMoveMenu(false)
  }

  const currentWorkspace = image.workspaceId
    ? workspaces.find((w) => w.id === image.workspaceId)
    : null

  return (
    <div
      className="img-card relative group rounded-2xl overflow-hidden cursor-pointer border border-border-dim/60 animate-fade-up"
      onClick={onClick}
      draggable
      onDragStart={handleDragStart}
      onMouseLeave={() => setShowMoveMenu(false)}
    >
      <img
        src={displayUrl}
        alt={image.prompt}
        className="w-full block"
        loading="lazy"
        draggable={false}
      />

      {currentWorkspace && (
        <div
          className="absolute bottom-0 left-0 right-0 h-[3px] opacity-60"
          style={{ backgroundColor: currentWorkspace.color }}
        />
      )}

      <button
        onClick={handleDelete}
        className="btn-interactive absolute top-2 right-2 z-10 p-1.5 rounded-lg bg-black/50 backdrop-blur-md border border-white/5 hover:bg-danger/80 transition-colors opacity-0 group-hover:opacity-100"
        title="Delete"
      >
        <Trash2 className="w-3.5 h-3.5 text-white" />
      </button>

      <div className="img-overlay absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent opacity-0 transition-opacity duration-200 flex items-end p-3">
        <div className="flex items-center gap-1.5 w-full">
          <button onClick={handleSave} className="btn-interactive p-2 rounded-lg bg-white/10 backdrop-blur-md border border-white/5 hover:bg-white/20 transition-colors" title="Save">
            <Download className="w-3.5 h-3.5 text-white" />
          </button>
          <button onClick={handleCopy} className="btn-interactive p-2 rounded-lg bg-white/10 backdrop-blur-md border border-white/5 hover:bg-white/20 transition-colors" title="Copy">
            <Copy className="w-3.5 h-3.5 text-white" />
          </button>
          {onStartChat && (
            <button
              onClick={(e) => { e.stopPropagation(); onStartChat(image.id) }}
              className="btn-interactive p-2 rounded-lg bg-accent-main/20 backdrop-blur-md border border-accent-main/20 hover:bg-accent-main/30 transition-colors"
              title="Edit in chat"
            >
              <MessageSquare className="w-3.5 h-3.5 text-accent-bright" />
            </button>
          )}
          {onCropImage && (
            <button
              onClick={(e) => { e.stopPropagation(); onCropImage(image.id, image.filePath) }}
              className="btn-interactive p-2 rounded-lg bg-white/10 backdrop-blur-md border border-white/5 hover:bg-white/20 transition-colors"
              title="Crop as reference"
            >
              <Crop className="w-3.5 h-3.5 text-white" />
            </button>
          )}
          {workspaces.length > 0 && (
            <div className="relative">
              <button
                onClick={handleMoveClick}
                className={cn(
                  'btn-interactive p-2 rounded-lg backdrop-blur-md border transition-colors',
                  showMoveMenu
                    ? 'bg-white/20 border-white/10'
                    : 'bg-white/10 border-white/5 hover:bg-white/20'
                )}
                title="Move to workspace"
              >
                <FolderInput className="w-3.5 h-3.5 text-white" />
              </button>
              {showMoveMenu && (
                <div className="absolute bottom-full left-0 mb-2 min-w-[140px] bg-surface-3 border border-border-base rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.5)] p-1 animate-scale-in z-20">
                  <button
                    onClick={(e) => handleMove(e, undefined)}
                    className={cn(
                      'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] text-left transition-colors',
                      !image.workspaceId
                        ? 'bg-surface-4 text-text-primary font-medium'
                        : 'text-text-secondary hover:bg-surface-4 hover:text-text-primary'
                    )}
                  >
                    <div className="w-2 h-2 rounded-full bg-text-muted/40 shrink-0" />
                    None
                  </button>
                  {workspaces.map((ws) => (
                    <button
                      key={ws.id}
                      onClick={(e) => handleMove(e, ws.id)}
                      className={cn(
                        'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] text-left transition-colors',
                        image.workspaceId === ws.id
                          ? 'bg-surface-4 text-text-primary font-medium'
                          : 'text-text-secondary hover:bg-surface-4 hover:text-text-primary'
                      )}
                    >
                      <div
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: ws.color }}
                      />
                      {ws.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="flex-1" />
          <button onClick={(e) => { e.stopPropagation(); onClick() }} className="btn-interactive p-2 rounded-lg bg-white/10 backdrop-blur-md border border-white/5 hover:bg-white/20 transition-colors" title="Expand">
            <Maximize2 className="w-3.5 h-3.5 text-white" />
          </button>
        </div>
      </div>
    </div>
  )
}
