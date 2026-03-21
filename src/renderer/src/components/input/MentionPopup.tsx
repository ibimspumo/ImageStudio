import { FolderOpen } from 'lucide-react'
import type { AssetCollection } from '../../stores/collections-store'
import type { ImageRef } from '../../types/api'
import { toDisplayUrl } from '../../stores/gallery-store'

export type MentionItem =
  | { type: 'image'; ref: ImageRef }
  | { type: 'collection'; collection: AssetCollection }

interface MentionPopupProps {
  items: MentionItem[]
  onSelectImage: (ref: ImageRef) => void
  onSelectCollection: (collection: AssetCollection) => void
}

export function MentionPopup({ items, onSelectImage, onSelectCollection }: MentionPopupProps) {
  if (items.length === 0) return null

  return (
    <div className="absolute bottom-full left-4 mb-2 modal-glass border border-border-base rounded-xl p-1.5 z-30 animate-scale-in min-w-[220px] max-h-[240px] overflow-y-auto">
      {items.map((item) =>
        item.type === 'image' ? (
          <button
            key={`img-${item.ref.id}`}
            onMouseDown={(e) => { e.preventDefault(); onSelectImage(item.ref) }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left hover:bg-surface-hover transition-colors"
          >
            <img src={item.ref.base64} className="w-7 h-7 rounded-lg object-cover border border-border-dim" alt="" />
            <span className="text-[13px] font-medium text-text-primary">{item.ref.name}</span>
          </button>
        ) : (
          <button
            key={`col-${item.collection.id}`}
            onMouseDown={(e) => { e.preventDefault(); onSelectCollection(item.collection) }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left hover:bg-surface-hover transition-colors"
          >
            <div className="w-7 h-7 rounded-lg bg-accent-dim flex items-center justify-center shrink-0 border border-accent-main/15">
              {item.collection.images[0] ? (
                <img src={toDisplayUrl(item.collection.images[0])} className="w-7 h-7 rounded-lg object-cover" alt="" />
              ) : (
                <FolderOpen className="w-3.5 h-3.5 text-accent-main" />
              )}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[13px] font-medium text-text-primary truncate">@{item.collection.name}</span>
              <span className="text-[10px] text-text-muted">{item.collection.images.length} images</span>
            </div>
          </button>
        )
      )}
    </div>
  )
}
