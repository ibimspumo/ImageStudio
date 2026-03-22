import { create } from 'zustand'

interface GalleryFilterState {
  searchQuery: string
  filterModels: string[]
  filterAspectRatios: string[]
  filterDateRange: 'today' | 'week' | 'month' | 'all' | null
  sortBy: 'newest' | 'oldest'
  favoritesOnly: boolean
  filterTags: string[]
  activeSmartAlbum: string | null

  setSearchQuery: (q: string) => void
  setFilterModels: (models: string[]) => void
  setFilterAspectRatios: (ratios: string[]) => void
  setFilterDateRange: (range: 'today' | 'week' | 'month' | 'all' | null) => void
  setSortBy: (sort: 'newest' | 'oldest') => void
  setFavoritesOnly: (v: boolean) => void
  setFilterTags: (tags: string[]) => void
  setActiveSmartAlbum: (id: string | null) => void
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

  setSearchQuery: (searchQuery) => set({ searchQuery, activeSmartAlbum: null }),
  setFilterModels: (filterModels) => set({ filterModels, activeSmartAlbum: null }),
  setFilterAspectRatios: (filterAspectRatios) => set({ filterAspectRatios, activeSmartAlbum: null }),
  setFilterDateRange: (filterDateRange) => set({ filterDateRange, activeSmartAlbum: null }),
  setSortBy: (sortBy) => set({ sortBy }),
  setFavoritesOnly: (favoritesOnly) => set({ favoritesOnly, activeSmartAlbum: null }),
  setFilterTags: (filterTags) => set({ filterTags, activeSmartAlbum: null }),
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
  }),
  hasActiveFilters: () => {
    const s = get()
    return !!(s.searchQuery || s.filterModels.length || s.filterAspectRatios.length || s.filterDateRange || s.favoritesOnly || s.filterTags.length || s.activeSmartAlbum)
  },
}))
