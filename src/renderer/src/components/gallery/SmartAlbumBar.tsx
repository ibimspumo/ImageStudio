import { useMemo } from 'react'
import { Cpu, Calendar, Star, Hash } from 'lucide-react'
import { type GalleryImage } from '../../stores/gallery-store'
import { useGalleryFilterStore } from '../../stores/gallery-filter-store'
import { getModelName } from '../../types/api'
import { cn } from '../../lib/utils'

interface SmartAlbumBarProps {
  images: GalleryImage[]
}

interface SmartAlbum {
  id: string
  label: string
  icon: React.ReactNode
  count: number
  filter: () => void
}

export function SmartAlbumBar({ images }: SmartAlbumBarProps) {
  const { activeSmartAlbum, setActiveSmartAlbum } = useGalleryFilterStore()

  const albums = useMemo(() => {
    const result: SmartAlbum[] = []

    // Favorites
    const favCount = images.filter((i) => i.isFavorite).length
    if (favCount > 0) {
      result.push({
        id: 'favorites',
        label: 'Favorites',
        icon: <Star className="w-3 h-3" fill="currentColor" />,
        count: favCount,
        filter: () => setActiveSmartAlbum('favorites'),
      })
    }

    // Today
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayCount = images.filter((i) => i.timestamp >= todayStart.getTime()).length
    if (todayCount > 0) {
      result.push({
        id: 'today',
        label: 'Today',
        icon: <Calendar className="w-3 h-3" />,
        count: todayCount,
        filter: () => setActiveSmartAlbum('today'),
      })
    }

    // By model (top 5 with most images)
    const modelCounts = new Map<string, number>()
    for (const img of images) {
      modelCounts.set(img.model, (modelCounts.get(img.model) || 0) + 1)
    }
    const topModels = [...modelCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)

    for (const [model, count] of topModels) {
      if (count >= 2) {
        result.push({
          id: `model:${model}`,
          label: getModelName(model),
          icon: <Cpu className="w-3 h-3" />,
          count,
          filter: () => setActiveSmartAlbum(`model:${model}`),
        })
      }
    }

    // By tag (top 5)
    const tagCounts = new Map<string, number>()
    for (const img of images) {
      if (img.tags) {
        for (const tag of img.tags) {
          tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1)
        }
      }
    }
    const topTags = [...tagCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)

    for (const [tag, count] of topTags) {
      if (count >= 2) {
        result.push({
          id: `tag:${tag}`,
          label: `#${tag}`,
          icon: <Hash className="w-3 h-3" />,
          count,
          filter: () => setActiveSmartAlbum(`tag:${tag}`),
        })
      }
    }

    return result
  }, [images, setActiveSmartAlbum])

  if (albums.length === 0) return null

  return (
    <div className="shrink-0 px-5 pb-1 overflow-x-auto">
      <div className="flex items-center gap-1.5">
        {albums.map((album) => (
          <button
            key={album.id}
            onClick={album.filter}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-medium whitespace-nowrap transition-all',
              activeSmartAlbum === album.id
                ? 'bg-accent-dim border-accent-main/30 text-accent-main'
                : 'bg-surface-2 border-border-dim text-text-muted hover:text-text-secondary hover:border-border-base'
            )}
          >
            {album.icon}
            {album.label}
            <span className="text-[9px] opacity-70">{album.count}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
