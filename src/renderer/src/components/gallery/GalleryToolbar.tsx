import { useState, useRef } from 'react'
import { Search, SlidersHorizontal, Star, ArrowUpDown, X } from 'lucide-react'
import { useGalleryFilterStore } from '../../stores/gallery-filter-store'
import { AVAILABLE_MODELS } from '../../types/api'
import { cn } from '../../lib/utils'

interface GalleryToolbarProps {
  allTags: string[]
  totalCount: number
  filteredCount: number
}

export function GalleryToolbar({ allTags, totalCount, filteredCount }: GalleryToolbarProps) {
  const [showFilters, setShowFilters] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const {
    searchQuery, setSearchQuery,
    filterModels, setFilterModels,
    filterAspectRatios, setFilterAspectRatios,
    filterDateRange, setFilterDateRange,
    sortBy, setSortBy,
    favoritesOnly, setFavoritesOnly,
    filterTags, setFilterTags,
    clearFilters, hasActiveFilters,
  } = useGalleryFilterStore()

  const isFiltered = hasActiveFilters()
  const activeFilterCount = [
    filterModels.length > 0,
    filterAspectRatios.length > 0,
    !!filterDateRange,
    filterTags.length > 0,
  ].filter(Boolean).length

  const toggleModel = (id: string) => {
    setFilterModels(
      filterModels.includes(id)
        ? filterModels.filter((m) => m !== id)
        : [...filterModels, id]
    )
  }

  const toggleAspectRatio = (r: string) => {
    setFilterAspectRatios(
      filterAspectRatios.includes(r)
        ? filterAspectRatios.filter((a) => a !== r)
        : [...filterAspectRatios, r]
    )
  }

  const toggleTag = (t: string) => {
    setFilterTags(
      filterTags.includes(t)
        ? filterTags.filter((x) => x !== t)
        : [...filterTags, t]
    )
  }

  const RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '2:3', '3:2']
  const DATE_RANGES = [
    { value: 'today' as const, label: 'Today' },
    { value: 'week' as const, label: 'This Week' },
    { value: 'month' as const, label: 'This Month' },
  ]

  return (
    <div className="shrink-0 px-5 pt-2 pb-1 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {/* Search */}
        <div className="flex items-center gap-2 flex-1 max-w-[300px] h-8 px-3 rounded-lg bg-surface-2 border border-border-dim focus-within:border-border-base transition-colors">
          <Search className="w-3.5 h-3.5 text-text-muted shrink-0" />
          <input
            ref={searchRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search prompts & tags..."
            className="flex-1 bg-transparent text-[12px] text-text-primary outline-none placeholder:text-text-muted"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="p-0.5 text-text-muted hover:text-text-secondary">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Filter button */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={cn(
            'flex items-center gap-1.5 h-8 px-3 rounded-lg border text-[11px] font-medium transition-all',
            showFilters || activeFilterCount > 0
              ? 'bg-accent-dim border-accent-main/30 text-accent-main'
              : 'bg-surface-2 border-border-dim text-text-secondary hover:text-text-primary hover:border-border-base'
          )}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Filters
          {activeFilterCount > 0 && (
            <span className="ml-0.5 w-4 h-4 rounded-full bg-accent-main text-white text-[9px] flex items-center justify-center font-bold">
              {activeFilterCount}
            </span>
          )}
        </button>

        {/* Favorites toggle */}
        <button
          onClick={() => setFavoritesOnly(!favoritesOnly)}
          className={cn(
            'flex items-center justify-center w-8 h-8 rounded-lg border transition-all',
            favoritesOnly
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
              : 'bg-surface-2 border-border-dim text-text-muted hover:text-text-secondary hover:border-border-base'
          )}
          title="Show favorites only"
        >
          <Star className="w-3.5 h-3.5" fill={favoritesOnly ? 'currentColor' : 'none'} />
        </button>

        {/* Sort */}
        <button
          onClick={() => setSortBy(sortBy === 'newest' ? 'oldest' : 'newest')}
          className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-surface-2 border border-border-dim text-text-secondary hover:text-text-primary hover:border-border-base transition-all text-[11px] font-medium"
          title={`Sort: ${sortBy === 'newest' ? 'Newest first' : 'Oldest first'}`}
        >
          <ArrowUpDown className="w-3.5 h-3.5" />
          {sortBy === 'newest' ? 'Newest' : 'Oldest'}
        </button>

        {/* Result count + clear */}
        {isFiltered && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-[11px] text-text-muted">{filteredCount} of {totalCount}</span>
            <button
              onClick={clearFilters}
              className="text-[11px] text-accent-main hover:text-accent-bright transition-colors"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* Expanded filters panel */}
      {showFilters && (
        <div className="flex flex-col gap-3 p-3 rounded-xl bg-surface-2 border border-border-dim animate-fade-up">
          {/* Models */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted">Model</span>
            <div className="flex flex-wrap gap-1">
              {AVAILABLE_MODELS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => toggleModel(m.id)}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-[10px] font-medium border transition-all',
                    filterModels.includes(m.id)
                      ? 'bg-accent-dim border-accent-main/30 text-accent-main'
                      : 'bg-surface-3 border-border-dim text-text-muted hover:text-text-secondary'
                  )}
                >
                  {m.name}
                </button>
              ))}
            </div>
          </div>

          {/* Aspect Ratios */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted">Aspect Ratio</span>
            <div className="flex flex-wrap gap-1">
              {RATIOS.map((r) => (
                <button
                  key={r}
                  onClick={() => toggleAspectRatio(r)}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-[10px] font-medium border transition-all',
                    filterAspectRatios.includes(r)
                      ? 'bg-accent-dim border-accent-main/30 text-accent-main'
                      : 'bg-surface-3 border-border-dim text-text-muted hover:text-text-secondary'
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Date range */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted">Date</span>
            <div className="flex flex-wrap gap-1">
              {DATE_RANGES.map((d) => (
                <button
                  key={d.value}
                  onClick={() => setFilterDateRange(filterDateRange === d.value ? null : d.value)}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-[10px] font-medium border transition-all',
                    filterDateRange === d.value
                      ? 'bg-accent-dim border-accent-main/30 text-accent-main'
                      : 'bg-surface-3 border-border-dim text-text-muted hover:text-text-secondary'
                  )}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tags */}
          {allTags.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted">Tags</span>
              <div className="flex flex-wrap gap-1">
                {allTags.slice(0, 20).map((t) => (
                  <button
                    key={t}
                    onClick={() => toggleTag(t)}
                    className={cn(
                      'px-2.5 py-1 rounded-md text-[10px] font-medium border transition-all',
                      filterTags.includes(t)
                        ? 'bg-accent-dim border-accent-main/30 text-accent-main'
                        : 'bg-surface-3 border-border-dim text-text-muted hover:text-text-secondary'
                    )}
                  >
                    #{t}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
