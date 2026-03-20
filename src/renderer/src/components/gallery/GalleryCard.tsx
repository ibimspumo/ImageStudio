import { Download, Copy, Maximize2, X, AlertCircle, MessageSquare } from 'lucide-react'
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
      <div className="break-inside-avoid">
        <div className="skeleton aspect-square rounded-2xl" />
        <p className="text-[11px] text-text-muted mt-1.5 px-1 truncate">{image.prompt}</p>
      </div>
    )
  }

  if (image.error) {
    return (
      <div className="break-inside-avoid">
        <div className="aspect-square rounded-2xl bg-surface-2 border border-border-base flex flex-col items-center justify-center gap-2 px-4">
          <AlertCircle className="w-5 h-5 text-danger" />
          <p className="text-[11px] text-danger text-center">{image.error}</p>
        </div>
        <div className="flex items-center justify-between mt-1.5 px-1">
          <p className="text-[11px] text-text-muted truncate flex-1">{image.prompt}</p>
          <button onClick={() => removeImage(image.id)} className="p-0.5 text-text-muted hover:text-danger transition-colors">
            <X className="w-3 h-3" />
          </button>
        </div>
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

  return (
    <div className="break-inside-avoid">
      <div
        className="img-card relative group rounded-2xl overflow-hidden cursor-pointer border border-border-dim hover:border-border-base transition-all animate-fade-up"
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

        {/* Hover overlay */}
        <div className="img-overlay absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity duration-200 flex items-end p-3">
          <div className="flex items-center gap-1.5 w-full">
            <button onClick={handleSave} className="p-2 rounded-lg bg-white/10 backdrop-blur-md hover:bg-white/20 transition-colors" title="Save">
              <Download className="w-4 h-4 text-white" />
            </button>
            <button onClick={handleCopy} className="p-2 rounded-lg bg-white/10 backdrop-blur-md hover:bg-white/20 transition-colors" title="Copy">
              <Copy className="w-4 h-4 text-white" />
            </button>
            {onStartChat && (
              <button
                onClick={(e) => { e.stopPropagation(); onStartChat(image.id) }}
                className="p-2 rounded-lg bg-white/10 backdrop-blur-md hover:bg-white/20 transition-colors"
                title="Chat"
              >
                <MessageSquare className="w-4 h-4 text-white" />
              </button>
            )}
            <div className="flex-1" />
            <button onClick={(e) => { e.stopPropagation(); onClick() }} className="p-2 rounded-lg bg-white/10 backdrop-blur-md hover:bg-white/20 transition-colors" title="Expand">
              <Maximize2 className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>
      </div>
      <p className="text-[11px] text-text-muted mt-1.5 px-1 truncate">{image.prompt}</p>
    </div>
  )
}
