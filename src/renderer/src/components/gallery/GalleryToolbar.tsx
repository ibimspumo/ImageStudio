import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { SlidersHorizontal, ArrowDownWideNarrow, X } from 'lucide-react'
import { useGalleryFilterStore } from '../../stores/gallery-filter-store'
import { AVAILABLE_MODELS, AVAILABLE_VIDEO_MODELS } from '../../types/api'
interface Props { allTags: string[]; totalCount: number; filteredCount: number }
export function GalleryToolbar({ allTags, filteredCount }: Props) {
  const [open,setOpen]=useState(false)
  const dialog=useRef<HTMLDialogElement>(null)
  const f=useGalleryFilterStore()
  useEffect(()=>{if(open)dialog.current?.showModal()},[open])
  const activeCount=[f.filterModels.length>0,f.filterAspectRatios.length>0,!!f.filterDateRange&&f.filterDateRange!=='all',f.filterTags.length>0,f.filterType!=='all',!!f.activeSmartAlbum].filter(Boolean).length
  return <div className="shrink-0 px-4 md:px-7 pb-4 flex items-center gap-1.5 text-[13px] flex-wrap">
    <button className={`px-3 py-1.5 rounded-md ${!f.favoritesOnly?'bg-surface-3 text-text-primary':'text-text-muted hover:bg-surface-3'}`} aria-pressed={!f.favoritesOnly} onClick={()=>{f.setFavoritesOnly(false);f.setActiveSmartAlbum(null)}}>Alle</button>
    <button className={`px-3 py-1.5 rounded-md ${f.favoritesOnly?'bg-surface-3 text-text-primary':'text-text-muted hover:bg-surface-3'}`} aria-pressed={f.favoritesOnly} onClick={()=>f.setFavoritesOnly(!f.favoritesOnly)}>Favoriten</button>
    <span className="ml-auto text-xs text-text-muted tabular-nums">{filteredCount} Ergebnisse</span>
    <button onClick={()=>setOpen(true)} className={`flex gap-2 items-center px-3 py-1.5 rounded-md hover:bg-surface-3 ${activeCount?'text-accent-main':'text-text-secondary'}`}><SlidersHorizontal className="w-4 h-4"/>Filter{activeCount>0&&<span className="text-xs">{activeCount}</span>}</button>
    <button onClick={()=>f.setSortBy(f.sortBy==='newest'?'oldest':'newest')} className="flex gap-2 items-center px-2 py-1.5 text-text-muted rounded-md hover:bg-surface-3" title="Sortierung ändern"><ArrowDownWideNarrow className="w-4 h-4"/><span className="hidden sm:inline">{f.sortBy==='newest'?'Neueste zuerst':'Älteste zuerst'}</span></button>
    {f.hasActiveFilters()&&<button onClick={f.clearFilters} className="text-xs text-accent-main px-2 py-1.5 hover:underline">Zurücksetzen</button>}
    {open&&createPortal(<dialog ref={dialog} aria-label="Mediathek filtern" onClose={()=>setOpen(false)} onClick={e=>{if(e.target===e.currentTarget)dialog.current?.close()}} className="m-auto w-[min(540px,92vw)] max-h-[85vh] overflow-auto rounded-xl border border-border-base bg-surface-1 text-text-primary p-6 backdrop:bg-black/70"><div className="flex items-center mb-6"><h2 className="text-lg font-semibold">Mediathek filtern</h2><button onClick={()=>dialog.current?.close()} aria-label="Filter schließen" className="ml-auto p-2 rounded-lg hover:bg-surface-3"><X className="w-5 h-5"/></button></div><div className="space-y-6">
      <label className="block"><span className="text-text-secondary block mb-2">Medientyp</span><select value={f.filterType} onChange={e=>f.setFilterType(e.target.value as typeof f.filterType)} className="bg-surface-3 rounded-lg px-3 py-2 w-full"><option value="all">Bilder und Videos</option><option value="images">Nur Bilder</option><option value="videos">Nur Videos</option></select></label>
      <fieldset><legend className="text-text-secondary mb-2">Modelle</legend><div className="grid grid-cols-2 gap-2">{[...AVAILABLE_MODELS,...AVAILABLE_VIDEO_MODELS].map(m=><label key={m.id} className="flex items-center gap-2 text-xs p-2 rounded-lg hover:bg-surface-3"><input type="checkbox" checked={f.filterModels.includes(m.id)} onChange={()=>f.setFilterModels(f.filterModels.includes(m.id)?f.filterModels.filter(x=>x!==m.id):[...f.filterModels,m.id])}/>{m.name}</label>)}</div></fieldset>
      <fieldset><legend className="text-text-secondary mb-2">Seitenverhältnis</legend><div className="flex flex-wrap gap-2">{[...new Set(AVAILABLE_MODELS.flatMap(m=>m.aspectRatios??m.uiAspectRatios??[]))].filter(r=>r!=='auto').map(r=><button key={r} onClick={()=>f.setFilterAspectRatios(f.filterAspectRatios.includes(r)?f.filterAspectRatios.filter(x=>x!==r):[...f.filterAspectRatios,r])} aria-pressed={f.filterAspectRatios.includes(r)} className={`px-3 py-2 rounded-md border ${f.filterAspectRatios.includes(r)?'border-accent-main text-accent-main':'border-border-base text-text-secondary'}`}>{r}</button>)}</div></fieldset>
      <label className="block"><span className="text-text-secondary block mb-2">Zeitraum</span><select value={f.filterDateRange??'all'} onChange={e=>f.setFilterDateRange(e.target.value==='all'?null:e.target.value as 'today'|'week'|'month')} className="bg-surface-3 rounded-lg px-3 py-2 w-full"><option value="all">Alle Zeiträume</option><option value="today">Heute</option><option value="week">Letzte 7 Tage</option><option value="month">Letzte 30 Tage</option></select></label>
      {allTags.length>0&&<fieldset><legend className="text-text-secondary mb-2">Tags</legend><div className="flex flex-wrap gap-2">{allTags.map(t=><button key={t} onClick={()=>f.setFilterTags(f.filterTags.includes(t)?f.filterTags.filter(x=>x!==t):[...f.filterTags,t])} aria-pressed={f.filterTags.includes(t)} className={`px-3 py-2 rounded-md ${f.filterTags.includes(t)?'bg-accent-dim text-accent-main':'bg-surface-3'}`}>#{t}</button>)}</div></fieldset>}
      <div className="flex justify-between items-center"><button onClick={f.clearFilters} className="text-text-secondary hover:text-text-primary">Zurücksetzen</button><button onClick={()=>dialog.current?.close()} className="bg-accent-main text-accent-ink px-4 py-2 rounded-lg font-medium">Ergebnisse ansehen</button></div>
    </div></dialog>,document.body)}
  </div>
}
