import { useEffect, useMemo, useRef } from 'react'
import { ImageGallery } from '../gallery/ImageGallery'
import { PromptBar } from '../input/PromptBar'
import { VideoPromptBar } from '../input/VideoPromptBar'
import { useGalleryStore, isThumbnailImage, isLogoImage, type GalleryImage } from '../../stores/gallery-store'
import { useWorkspaceStore } from '../../stores/workspace-store'
import { useGalleryFilterStore } from '../../stores/gallery-filter-store'
import { GalleryToolbar } from '../gallery/GalleryToolbar'
import { useThumbnailProjectsStore } from '../../stores/thumbnail-projects-store'
import { Image, SearchX } from 'lucide-react'
import { MediaImport } from '../shared/MediaImport'
import { normalizeModelId } from '../../../../shared/image-models'
export type AppMode = 'image' | 'video' | 'thumbnail' | 'logo'
interface MainContentProps {
  onImageClick: (images: GalleryImage[], index: number) => void
  onSettingsClick: () => void
  onCollectionsClick: () => void
  onCreateVariant?: (imageId: string) => void
  onCropImage?: (imageId: string, filePath: string) => void
  onPresetsManage?: () => void
  onQueueClick?: () => void
  onCanvasClick?: () => void
  mode: AppMode
  library?: boolean
  onModeChange: (mode: AppMode) => void
  videoStartFrame?: { base64: string; name: string } | null
  onGenerateVideo?: (imageId: string) => void
  onPreviewThumbnail?: (images: GalleryImage[], index: number) => void
}
export function MainContent({ onImageClick, onSettingsClick, onCollectionsClick, onCreateVariant, onCropImage, onPresetsManage, onQueueClick, onCanvasClick, mode, library=false, onModeChange, videoStartFrame, onGenerateVideo, onPreviewThumbnail }: MainContentProps) {
  const allImages=useGalleryStore(s=>s.images)
  const activeWorkspaceId=useWorkspaceStore(s=>s.activeWorkspaceId)
  const workspaces=useWorkspaceStore(s=>s.workspaces)
  const activeProjectId=useThumbnailProjectsStore(s=>s.activeProjectId)
  const projects=useThumbnailProjectsStore(s=>s.projects)
  const filter=useGalleryFilterStore()
  const images=useMemo(()=>{
    let list=allImages
    if(!library){
      if(mode==='thumbnail')list=list.filter(isThumbnailImage)
      else if(mode==='logo')list=list.filter(isLogoImage)
      else if(mode==='video')list=list.filter(i=>i.type==='video')
    }
    if(!library&&mode==='thumbnail'&&activeProjectId)list=list.filter(i=>i.projectId===activeProjectId)
    else if(!library&&mode!=='thumbnail'&&activeWorkspaceId)list=list.filter(i=>i.workspaceId===activeWorkspaceId)
    const q=filter.searchQuery.trim().toLowerCase()
    if(q)list=list.filter(i=>i.prompt.toLowerCase().includes(q)||i.tags?.some(t=>t.toLowerCase().includes(q)))
    if(filter.favoritesOnly||filter.activeSmartAlbum==='favorites')list=list.filter(i=>i.isFavorite)
    if(filter.filterModels.length)list=list.filter(i=>filter.filterModels.some(m=>normalizeModelId(m)===normalizeModelId(i.model)))
    if(filter.filterAspectRatios.length)list=list.filter(i=>filter.filterAspectRatios.includes(i.aspectRatio))
    if(filter.filterTags.length)list=list.filter(i=>i.tags?.some(t=>filter.filterTags.includes(t)))
    if(filter.filterType==='images')list=list.filter(i=>i.type!=='video')
    if(filter.filterType==='videos'||filter.activeSmartAlbum==='videos')list=list.filter(i=>i.type==='video')
    if(filter.activeSmartAlbum?.startsWith('model:'))list=list.filter(i=>normalizeModelId(i.model)===normalizeModelId(filter.activeSmartAlbum!.slice(6)))
    if(filter.activeSmartAlbum?.startsWith('tag:'))list=list.filter(i=>i.tags?.includes(filter.activeSmartAlbum!.slice(4)))
    if(filter.filterDateRange&&filter.filterDateRange!=='all'||filter.activeSmartAlbum==='today'){
      const start=new Date();start.setHours(0,0,0,0)
      const cutoff=filter.activeSmartAlbum==='today'||filter.filterDateRange==='today'?start.getTime():Date.now()-(filter.filterDateRange==='week'?7:30)*86400000
      list=list.filter(i=>i.timestamp>=cutoff)
    }
    return [...list].sort((a,b)=>filter.sortBy==='oldest'?a.timestamp-b.timestamp:b.timestamp-a.timestamp)
  },[allImages,activeWorkspaceId,activeProjectId,mode,library,filter])
  const allTags=useMemo(()=>[...new Set(allImages.flatMap(i=>i.tags??[]))],[allImages])
  const mainRef=useRef<HTMLElement>(null),promptRef=useRef<HTMLDivElement>(null)
  useEffect(()=>{const bar=promptRef.current,main=mainRef.current;if(!bar||!main)return;const update=()=>main.style.setProperty('--prompt-bar-h',library?'0px':`${bar.getBoundingClientRect().height}px`);const observer=new ResizeObserver(update);observer.observe(bar);update();return()=>observer.disconnect()},[mode,library])
  const activeName=library?undefined:mode==='thumbnail'?projects.find(p=>p.id===activeProjectId)?.title:workspaces.find(w=>w.id===activeWorkspaceId)?.name
  const title=activeName||(library?'Deine Mediathek':{image:'Deine Bilder',video:'Deine Videos',thumbnail:'Deine Thumbnails',logo:'Deine Logos'}[mode])
  const hint=library?'Bilder, Videos und fertige Ergebnisse an einem Ort.':{image:'Deine Ideen, Varianten und fertigen Ergebnisse.',video:'Ein Startbild. Deine Bewegung. Ein neuer Clip.',thumbnail:'Eine klare Bildidee für dein nächstes Video.',logo:'Form, Charakter und Wiedererkennung.'}[mode]
  return <main ref={mainRef} className="flex-1 flex flex-col min-w-0 min-h-0 h-full relative" aria-label={library?'Mediathek':'Erstellungsbereich'}>
    <div className="studio-heading"><div className="min-w-0"><h1 className="truncate">{title}</h1><p>{hint}</p></div><div className="shrink-0"><MediaImport onImported={kind=>{filter.clearFilters();onModeChange(kind)}}/></div></div>
    <GalleryToolbar allTags={allTags} totalCount={allImages.length} filteredCount={images.length}/>
    {images.length?<ImageGallery images={images} onImageClick={onImageClick} onCreateVariant={onCreateVariant} onCropImage={onCropImage} onGenerateVideo={onGenerateVideo} onPreviewThumbnail={onPreviewThumbnail}/>:<div className="flex-1 flex flex-col items-center justify-center px-8 pb-[var(--prompt-bar-h,180px)] min-h-0"><div className="w-12 h-12 rounded-xl bg-surface-3 flex items-center justify-center mb-5">{filter.hasActiveFilters()?<SearchX className="w-6 h-6 text-text-muted"/>:<Image className="w-6 h-6 text-accent-main"/>}</div><h2 className="text-lg font-semibold mb-2">{filter.hasActiveFilters()?'Keine passenden Ergebnisse':activeName?'Hier ist Platz für deine nächste Idee.':library?'Deine Mediathek beginnt hier.':mode==='video'?'Dein erster Clip beginnt mit einem Bild.':'Was möchtest du gestalten?'}</h2><p className="text-[13px] text-text-muted text-center max-w-md">{filter.hasActiveFilters()?'Ändere den Suchbegriff oder setze deine Filter zurück.':library?'Importiere vorhandene Bilder oder Videos, oder erstelle dein erstes Bild im Studio.':mode==='video'?'Wähle ein Startbild aus der Mediathek oder lade eines hoch. Beschreibe anschließend die Bewegung.':'Beschreibe dein Motiv und füge bei Bedarf Personen oder Bilder als Referenz hinzu.'}</p>{filter.hasActiveFilters()&&<button onClick={filter.clearFilters} className="mt-4 text-sm text-accent-main hover:underline">Filter zurücksetzen</button>}</div>}
    <div className="studio-composer-dock" style={{display:library?'none':undefined}}><div ref={promptRef}>{mode==='video'?<VideoPromptBar onSettingsClick={onSettingsClick} initialStartFrame={videoStartFrame}/>:<PromptBar key={mode} thumbnailMode={mode==='thumbnail'} logoMode={mode==='logo'} onSettingsClick={onSettingsClick} onCollectionsClick={onCollectionsClick} onPresetsManage={onPresetsManage} onQueueClick={onQueueClick} onCanvasClick={onCanvasClick}/>}</div></div>
  </main>
}
