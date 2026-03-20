import { Download, Copy, Maximize2 } from 'lucide-react'
import type { GeneratedImage } from '../../types/chat'

interface ImageCardProps {
  image: GeneratedImage
  onClick: () => void
  index?: number
}

export function ImageCard({ image, onClick, index = 0 }: ImageCardProps) {
  const handleSave = async (e: React.MouseEvent) => {
    e.stopPropagation()
    await window.api.exportImage(image.base64DataUrl, `imagestudio-${image.id}.png`)
  }

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const response = await fetch(image.base64DataUrl)
      const blob = await response.blob()
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob })
      ])
    } catch {
      // silent
    }
  }

  const handleDragStart = (e: React.DragEvent) => {
    if (image.filePath) {
      e.preventDefault()
      window.api.startDrag(image.filePath)
    }
  }

  return (
    <div
      className="img-card relative group rounded-2xl overflow-hidden cursor-pointer border border-border-dim hover:border-border-base transition-all animate-fade-up"
      style={{ animationDelay: `${index * 80}ms` }}
      onClick={onClick}
      draggable={!!image.filePath}
      onDragStart={handleDragStart}
    >
      <img
        src={image.base64DataUrl}
        alt="Generated"
        className="w-full aspect-square object-cover"
        loading="lazy"
      />

      {/* Hover overlay */}
      <div className="img-overlay absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity duration-200 flex items-end p-3">
        <div className="flex items-center gap-1.5 w-full">
          <button
            onClick={handleSave}
            className="p-2 rounded-lg bg-white/10 backdrop-blur-md hover:bg-white/20 transition-colors"
            title="Save"
          >
            <Download className="w-4 h-4 text-white" />
          </button>
          <button
            onClick={handleCopy}
            className="p-2 rounded-lg bg-white/10 backdrop-blur-md hover:bg-white/20 transition-colors"
            title="Copy"
          >
            <Copy className="w-4 h-4 text-white" />
          </button>
          <div className="flex-1" />
          <button
            onClick={(e) => { e.stopPropagation(); onClick() }}
            className="p-2 rounded-lg bg-white/10 backdrop-blur-md hover:bg-white/20 transition-colors"
            title="Expand"
          >
            <Maximize2 className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>
    </div>
  )
}
