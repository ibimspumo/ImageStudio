import { Plus, X, FolderOpen } from 'lucide-react'
import type { ImageRef } from '../../types/api'
import { toDisplayUrl } from '../../stores/gallery-store'

export interface CollectionRef {
  id: string
  collectionId: string
  name: string
  thumbnail: string
  images: string[]
}

interface AttachmentStripProps {
  imageRefs: ImageRef[]
  collectionRefs: CollectionRef[]
  onRemoveImage: (id: string) => void
  onRemoveCollection: (id: string) => void
  onAddMore: () => void
}

export function AttachmentStrip({
  imageRefs,
  collectionRefs,
  onRemoveImage,
  onRemoveCollection,
  onAddMore,
}: AttachmentStripProps) {
  return (
    <>
      {/* Collection refs */}
      {collectionRefs.length > 0 && (
        <div className="flex items-center gap-2 px-5 pt-3 overflow-x-auto">
          {collectionRefs.map((cRef) => (
            <div key={cRef.id} className="shrink-0 group animate-scale-in flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-accent-main/8 border border-accent-main/20">
              {cRef.thumbnail ? (
                <img src={toDisplayUrl(cRef.thumbnail)} alt="" className="w-5 h-5 rounded object-cover" />
              ) : (
                <FolderOpen className="w-4 h-4 text-accent-main" />
              )}
              <span className="text-[11px] font-medium text-accent-bright">@{cRef.name}</span>
              <span className="text-[10px] text-text-muted">{cRef.images.length}</span>
              <button
                onClick={() => onRemoveCollection(cRef.id)}
                className="w-4 h-4 rounded-full flex items-center justify-center text-text-muted hover:text-danger transition-colors"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Image refs */}
      {imageRefs.length > 0 && (
        <div className="flex items-center gap-2 px-5 pt-4 overflow-x-auto">
          {imageRefs.map((ref) => (
            <div key={ref.id} className="relative shrink-0 group/thumb animate-scale-in">
              <div className="w-12 h-12 rounded-xl overflow-hidden border border-border-base/80 shadow-[0_2px_6px_rgba(0,0,0,0.3)]">
                <img src={ref.base64} alt={ref.name} className="w-full h-full object-cover" />
              </div>
              <button
                onClick={() => onRemoveImage(ref.id)}
                className="absolute -top-1.5 -right-1.5 w-4.5 h-4.5 rounded-full bg-surface-1 border border-border-base flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-all hover:bg-danger hover:border-danger hover:text-white text-text-muted shadow-md"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
          <button
            onClick={onAddMore}
            className="no-drag shrink-0 w-12 h-12 rounded-xl flex items-center justify-center border border-dashed border-border-base text-text-muted hover:text-text-secondary hover:border-border-bright transition-all"
            title="Add more images"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      )}
    </>
  )
}
