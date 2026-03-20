import { Download, Copy, Maximize2, X, AlertCircle, MessageSquare, Trash2 } from 'lucide-react'
import { useGalleryStore, type GalleryImage } from '../../stores/gallery-store'

interface GalleryCardProps {
  image: GalleryImage
  onClick: () => void
  onStartChat?: (imageId: string) => void
}

export function GalleryCard({ image, onClick, onStartChat }: GalleryCardProps) {
  const removeImage = useGalleryStore((s) => s.removeImage)

  if (image.isLoading) {
    return (
      <div className="skeleton aspect-square rounded-2xl mb-2" />
    )
  }

  if (image.error) {
    return (
      <div className="aspect-square rounded-2xl bg-surface-2 border border-border-base flex flex-col items-center justify-center gap-2 px-4 mb-2 relative">
        <AlertCircle className="w-5 h-5 text-danger" />
        <p className="text-[11px] text-danger text-center">{image.error}</p>
        <button onClick={() => removeImage(image.id)} className="absolute top-2 right-2 p-1 text-text-muted hover:text-danger transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    )
  }

  const handleSave = async (e: React.MouseEvent) => {
    e.stopPropagation()
    await window.api.exportImage(image.base64DataUrl, `imagestudio-${image.id}.png`)
  }

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const response = await fetch(image.base64DataUrl)
      const blob = await response.blob()
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
    } catch { /* silent */ }
  }

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', image.base64DataUrl)
    e.dataTransfer.setData('application/x-imagestudio', image.base64DataUrl)
    e.dataTransfer.effectAllowed = 'copy'
  }

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (window.confirm('Delete this image?')) {
      removeImage(image.id)
    }
  }

  return (
    <div
      className="img-card relative group rounded-2xl overflow-hidden cursor-pointer border border-border-dim/60 animate-fade-up mb-2"
      onClick={onClick}
      draggable
      onDragStart={handleDragStart}
    >
      <img
        src={image.base64DataUrl}
        alt={image.prompt}
        className="w-full block"
        loading="lazy"
        draggable={false}
      />

      {/* Delete button — top-right corner */}
      <button
        onClick={handleDelete}
        className="btn-interactive absolute top-2 right-2 z-10 p-1.5 rounded-lg bg-black/50 backdrop-blur-md border border-white/5 hover:bg-danger/80 transition-colors opacity-0 group-hover:opacity-100"
        title="Delete"
      >
        <Trash2 className="w-3.5 h-3.5 text-white" />
      </button>

      {/* Hover overlay */}
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
          <div className="flex-1" />
          <button onClick={(e) => { e.stopPropagation(); onClick() }} className="btn-interactive p-2 rounded-lg bg-white/10 backdrop-blur-md border border-white/5 hover:bg-white/20 transition-colors" title="Expand">
            <Maximize2 className="w-3.5 h-3.5 text-white" />
          </button>
        </div>
      </div>
    </div>
  )
}
