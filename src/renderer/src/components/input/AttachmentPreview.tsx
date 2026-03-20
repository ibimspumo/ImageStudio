import { X, ImageIcon } from 'lucide-react'

interface AttachmentPreviewProps {
  attachments: string[]
  onRemove: (index: number) => void
}

export function AttachmentPreview({ attachments, onRemove }: AttachmentPreviewProps) {
  return (
    <div className="flex gap-2.5 overflow-x-auto pb-2">
      {attachments.map((att, i) => (
        <div key={i} className="relative shrink-0 group animate-scale-in">
          <div className="w-16 h-16 rounded-xl overflow-hidden border border-border-base bg-surface-3">
            <img
              src={att}
              alt={`Reference ${i + 1}`}
              className="w-full h-full object-cover"
            />
          </div>
          {/* Badge */}
          <div className="absolute bottom-0 left-0 right-0 bg-black/50 backdrop-blur-sm rounded-b-xl px-1.5 py-0.5 flex items-center gap-1">
            <ImageIcon className="w-2.5 h-2.5 text-white/70" />
            <span className="text-[9px] text-white/70 font-medium">Ref {i + 1}</span>
          </div>
          {/* Remove button */}
          <button
            onClick={() => onRemove(i)}
            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-surface-0 border border-border-base flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-danger hover:border-danger hover:text-white text-text-muted"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  )
}
