import { create } from 'zustand'

export type MediaTypeFilter = 'all' | 'images' | 'videos'

interface GalleryFilterState {
  searchQuery: string
  filterModels: string[]
  filterAspectRatios: string[]
  filterDateRange: 'today' | 'week' | 'month' | 'all' | null
  sortBy: 'newest' | 'oldest'
  favoritesOnly: boolean
  filterTags: string[]
  activeSmartAlbum: string | null
  filterType: MediaTypeFilter

  setSearchQuery: (q: string) => void
  setFilterModels: (models: string[]) => void
  setFilterAspectRatios: (ratios: string[]) => void
  setFilterDateRange: (range: 'today' | 'week' | 'month' | 'all' | null) => void
  setSortBy: (sort: 'newest' | 'oldest') => void
  setFavoritesOnly: (v: boolean) => void
  setFilterTags: (tags: string[]) => void
  setActiveSmartAlbum: (id: string | null) => void
  setFilterType: (type: MediaTypeFilter) => void
  clearFilters: () => void
  hasActiveFilters: () => boolean
}

export const useGalleryFilterStore = create<GalleryFilterState>((set, get) => ({
  searchQuery: '',
  filterModels: [],
  filterAspectRatios: [],
  filterDateRange: null,
  sortBy: 'newest',
  favoritesOnly: false,
  filterTags: [],
  activeSmartAlbum: null,
  filterType: 'all' as MediaTypeFilter,

  setSearchQuery: (searchQuery) => set({ searchQuery, activeSmartAlbum: null }),
  setFilterModels: (filterModels) => set({ filterModels, activeSmartAlbum: null }),
  setFilterAspectRatios: (filterAspectRatios) => set({ filterAspectRatios, activeSmartAlbum: null }),
  setFilterDateRange: (filterDateRange) => set({ filterDateRange, activeSmartAlbum: null }),
  setSortBy: (sortBy) => set({ sortBy }),
  setFavoritesOnly: (favoritesOnly) => set({ favoritesOnly, activeSmartAlbum: null }),
  setFilterTags: (filterTags) => set({ filterTags, activeSmartAlbum: null }),
  setFilterType: (filterType) => set({ filterType }),
  setActiveSmartAlbum: (activeSmartAlbum) => {
    if (activeSmartAlbum === get().activeSmartAlbum) {
      set({ activeSmartAlbum: null })
    } else {
      set({ activeSmartAlbum })
    }
  },
  clearFilters: () => set({
    searchQuery: '',
    filterModels: [],
    filterAspectRatios: [],
    filterDateRange: null,
    favoritesOnly: false,
    filterTags: [],
    activeSmartAlbum: null,
    filterType: 'all' as MediaTypeFilter,
  }),
  hasActiveFilters: () => {
    const s = get()
    return !!(s.searchQuery || s.filterModels.length || s.filterAspectRatios.length || s.filterDateRange || s.favoritesOnly || s.filterTags.length || s.activeSmartAlbum || s.filterType !== 'all')
  },
}))
