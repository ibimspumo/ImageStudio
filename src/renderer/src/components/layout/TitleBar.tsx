import { Activity, ChevronRight, Menu, Search, X } from 'lucide-react'
import { useGalleryFilterStore } from '../../stores/gallery-filter-store'
import { useGalleryStore } from '../../stores/gallery-store'
import { SECTION_LABELS, type StudioSection } from './StudioSidebar'
interface Props { section: StudioSection; context?: string; onOverview: () => void; onStudio: () => void; onMenu: () => void; onActivity: () => void; onSearch: () => void }
export function TitleBar({ section, context, onOverview, onStudio, onMenu, onActivity, onSearch }: Props) {
  const searchQuery=useGalleryFilterStore(s=>s.searchQuery)
  const setSearch=useGalleryFilterStore(s=>s.setSearchQuery)
  const running=useGalleryStore(s=>s.images.filter(i=>i.isLoading).length)
  return <header className="studio-topbar drag-region">
    <button onClick={onMenu} className="studio-mobile-toggle p-2 hover:bg-surface-3 rounded-lg" aria-label="Navigation öffnen"><Menu className="w-5 h-5"/></button>
    <nav aria-label="Breadcrumb" className="no-drag flex items-center gap-2 min-w-0 text-[13px]">
      <button onClick={onStudio} className="hidden lg:inline text-text-muted hover:text-text-primary rounded px-1 py-2" title="Gesamte Mediathek öffnen">Studio</button>
      <ChevronRight aria-hidden="true" className="hidden lg:inline w-4 h-4 text-text-muted"/>
      {context ? <><button onClick={onOverview} className="font-medium whitespace-nowrap rounded px-1 py-2 hover:bg-surface-3 hover:text-accent-main" aria-label={({image:'Alle Bilder anzeigen',thumbnail:'Alle Thumbnails anzeigen',video:'Alle Videos anzeigen',logo:'Alle Logos anzeigen'} as Partial<Record<StudioSection,string>>)[section]??'Gesamtübersicht anzeigen'}>{SECTION_LABELS[section]}</button><ChevronRight aria-hidden="true" className="w-4 h-4 shrink-0 text-text-muted"/><span aria-current="page" className="truncate text-text-secondary max-w-[240px]">{context}</span></> : <span aria-current="page" className="font-medium whitespace-nowrap">{SECTION_LABELS[section]}</span>}
    </nav>
    <label className="no-drag flex items-center gap-2 ml-auto min-w-0 rounded-lg px-2 py-2 focus-within:bg-surface-3"><Search className="w-4 h-4 shrink-0 text-text-muted"/><input id="studio-search" aria-label="Mediathek durchsuchen" value={searchQuery} onChange={e=>{setSearch(e.target.value);onSearch()}} placeholder="Suchen …" className="w-24 lg:w-44 bg-transparent text-[13px] min-w-0 outline-none"/>{searchQuery?<button aria-label="Suche leeren" onClick={()=>setSearch('')}><X className="w-3.5 h-3.5"/></button>:<kbd className="hidden lg:block text-[11px] text-text-muted border border-border-base rounded px-1">⌘ K</kbd>}</label>
    <button onClick={onActivity} className="no-drag flex items-center gap-2 text-text-secondary hover:text-text-primary text-[13px] px-2 py-2 rounded-lg hover:bg-surface-3"><Activity className="w-4 h-4"/><span className="hidden lg:inline">Aktivität</span>{running>0&&<span className="bg-accent-main text-accent-ink text-xs px-1.5 rounded">{running}</span>}</button>
  </header>
}
