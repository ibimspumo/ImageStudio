import { useEffect, useRef, useState } from 'react'
import { getLiveDraft } from './automation/live-drafts'
import { useAutomationBridge } from './automation/useAutomationBridge'
import { useSettingsStore } from './stores/settings-store'
import { useGalleryStore, type GalleryImage, toDisplayUrl } from './stores/gallery-store'
import { useCollectionsStore } from './stores/collections-store'
import { useWorkspaceStore } from './stores/workspace-store'
import { useCropStore } from './stores/crop-store'
import { usePresetsStore } from './stores/presets-store'
import { useQueueStore } from './stores/queue-store'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { ErrorBoundary } from './components/shared/ErrorBoundary'
import { TitleBar } from './components/layout/TitleBar'
import { MainContent, type AppMode } from './components/layout/MainContent'
import { StudioSidebar, type StudioSection } from './components/layout/StudioSidebar'
import { SettingsDialog } from './components/shared/SettingsDialog'
import { ImageViewer } from './components/shared/ImageViewer'
import { CropModal } from './components/shared/CropModal'
import { CollectionsDialog } from './components/collections/CollectionsDialog'
import { PresetsDialog } from './components/presets/PresetsDialog'
import { ShortcutsHelp } from './components/shared/ShortcutsHelp'
import { ImageCompare } from './components/shared/ImageCompare'
import { QueuePanel } from './components/queue/QueuePanel'
import { CanvasModal } from './components/canvas/CanvasModal'
import { useCanvasStore } from './stores/canvas-store'
import { ThumbnailPreviewModal } from './components/thumbnail/ThumbnailPreviewModal'
import { useThumbnailProjectsStore } from './stores/thumbnail-projects-store'
import { useThumbnailMetaPromptsStore } from './stores/thumbnail-meta-prompts-store'
import { useUiRecentsStore } from './stores/ui-recents-store'
import { useGalleryFilterStore } from './stores/gallery-filter-store'
import { ProjectsPage } from './components/workspace/ProjectsPage'
import { prepareImageVariant } from './lib/studio-actions'
import { logger } from './lib/logger'

interface ViewerState { images: GalleryImage[]; index: number }
const isMode = (target: string): target is AppMode => ['image','video','thumbnail','logo','print'].includes(target)
export default function App() {
  const [ready,setReady]=useState(false)
  const [pendingCollection,setPendingCollection]=useState<string|null>(null)
  const hydration=useRef<Promise<void>|null>(null)
  const [section,setSection]=useState<StudioSection>('image')
  const [settingsVisited,setSettingsVisited]=useState(false)
  useEffect(()=>{if(section==='settings')setSettingsVisited(true)},[section])
  const [mode,setMode]=useState<AppMode>('image')
  const [sidebarOpen,setSidebarOpen]=useState(false)
  const [viewer,setViewer]=useState<ViewerState|null>(null)
  const [crop,setCrop]=useState<{imageId:string;filePath:string}|null>(null)
  const [compare,setCompare]=useState<[GalleryImage,GalleryImage]|null>(null)
  const [thumbnailPreview,setThumbnailPreview]=useState<ViewerState|null>(null)
  const [shortcuts,setShortcuts]=useState(false)
  const [videoStartFrame,setVideoStartFrame]=useState<{base64:string;name:string}|null>(null)
  const [error,setError]=useState<string|null>(null)
  const galleryImages=useGalleryStore(s=>s.images)
  const canvasOpen=useCanvasStore(s=>s.isOpen)
  const workspaceId=useWorkspaceStore(s=>s.activeWorkspaceId)
  const workspaces=useWorkspaceStore(s=>s.workspaces)
  const projectId=useThumbnailProjectsStore(s=>s.activeProjectId)
  const projects=useThumbnailProjectsStore(s=>s.projects)

  useEffect(()=>{
    const reconcile=(state:ViewerState|null):ViewerState|null=>{
      if(!state)return null
      const currentId=state.images[state.index]?.id
      const live=new Map(galleryImages.map(image=>[image.id,image]))
      const images=state.images.flatMap(image=>{const item=live.get(image.id);return item?[item]:[]})
      if(!images.length)return null
      const currentIndex=images.findIndex(image=>image.id===currentId)
      const index=currentIndex<0?Math.min(state.index,images.length-1):currentIndex
      if(index===state.index&&images.length===state.images.length&&images.every((image,i)=>image===state.images[i]))return state
      return {images,index}
    }
    setViewer(reconcile)
    setThumbnailPreview(reconcile)
  },[galleryImages])

  useEffect(()=>{
    let cancelled=false
    hydration.current??=window.api.migrate().catch(err=>logger.error('App','Migration failed',err)).then(async()=>{
      await Promise.all([useSettingsStore.getState().hydrate(),useGalleryStore.getState().loadFromDisk(),useCollectionsStore.getState().loadFromDisk(),useWorkspaceStore.getState().loadFromDisk(),usePresetsStore.getState().loadFromDisk(),useQueueStore.getState().loadFromDisk(),useThumbnailProjectsStore.getState().loadFromDisk(),useThumbnailMetaPromptsStore.getState().loadFromDisk(),useUiRecentsStore.getState().loadFromDisk()])
    })
    void hydration.current.then(()=>{if(!cancelled){setReady(true);if(!useSettingsStore.getState().falApiKey)setSection('settings')}})
    return()=>{cancelled=true}
  },[])

  const navigateSection=(target:StudioSection)=>{setSection(target);if(isMode(target)){setMode(target);if(target==='image')setVideoStartFrame(null)}}
  const navigateOverview=(target:StudioSection)=>{
    if(target==='thumbnail')useThumbnailProjectsStore.getState().setActiveProject(null)
    else if(isMode(target)||target==='library')useWorkspaceStore.getState().setActiveWorkspace(null)
    if(isMode(target)||target==='library')useGalleryFilterStore.getState().clearFilters()
    navigateSection(target)
  }
  const selectWorkspace=(id:string|null)=>{useWorkspaceStore.getState().setActiveWorkspace(id);if(id)useUiRecentsStore.getState().bumpWorkspace(id);useGalleryFilterStore.getState().clearFilters();navigateSection('image')}
  const selectProject=(id:string|null)=>{useThumbnailProjectsStore.getState().setActiveProject(id);if(id)useUiRecentsStore.getState().bumpProject(id);useGalleryFilterStore.getState().clearFilters();navigateSection('thumbnail')}
  useEffect(()=>{
    if(!pendingCollection||mode==='video')return
    const draft=getLiveDraft(mode)
    const attached=(draft.read().collections as Array<{collectionId:string}>|undefined)??[]
    void draft.update({collectionIds:[...new Set([...attached.map(c=>c.collectionId),pendingCollection])]}).catch(err=>setError(err instanceof Error?err.message:'Referenz konnte nicht hinzugefügt werden.'))
    setPendingCollection(null)
  },[pendingCollection,mode])
  const showImage=(images:GalleryImage[],index:number)=>setViewer({images,index})
  const createVariant=(id:string)=>{prepareImageVariant(id);setMode(useGalleryStore.getState().images.find(i=>i.id===id)?.isPrint?'print':'image');setSection(useGalleryStore.getState().images.find(i=>i.id===id)?.isPrint?'print':'image');setViewer(null);setThumbnailPreview(null)}
  const safeVariant=(id:string)=>{try{createVariant(id)}catch(err){setError(err instanceof Error?err.message:'Variante konnte nicht vorbereitet werden.')}}
  const reusePrompt=(image:GalleryImage)=>{useCropStore.getState().setPendingReuse(image.prompt,image.attachments,image.negativePrompt,image.seed,{labeledAttachments:(image.generationOptions && 'labeledAttachments' in image.generationOptions ? image.generationOptions.labeledAttachments : undefined),thumbnailStyle:image.thumbnailStyle as import("../../shared/thumbnail-prompt").ThumbnailStyle|undefined,thumbnailCompositing:image.thumbnailCompositing,isPrint:image.isPrint,printFormat:image.printFormat,printStyle:image.printStyle,printMetaPrompt:image.printMetaPrompt,model:image.model,aspectRatio:image.aspectRatio,resolution:image.resolution,background:image.hasAlpha?'transparent':(image.generationOptions && 'background' in image.generationOptions ? image.generationOptions.background : undefined),imageSize:(image.generationOptions && 'imageSize' in image.generationOptions ? image.generationOptions.imageSize : undefined),quality:(image.generationOptions && 'quality' in image.generationOptions ? image.generationOptions.quality : undefined),outputFormat:(image.generationOptions && 'outputFormat' in image.generationOptions ? image.generationOptions.outputFormat : undefined),outputCompression:(image.generationOptions && 'outputCompression' in image.generationOptions ? image.generationOptions.outputCompression : undefined)});setViewer(null);navigateSection(image.isPrint?'print':image.isLogo?'logo':(image.thumbnailStyle!=null||image.projectId)?'thumbnail':'image')}
  const openCrop=(imageId:string,filePath:string)=>{setCrop({imageId,filePath});setViewer(null)}
  const openCompare=(image:GalleryImage)=>{
    const images=useGalleryStore.getState().images
    // Legacy parent IDs remain readable after retiring masked editing.
    let parent=images.find(i=>i.id===image.inpaintSourceId)
    if(!parent&&image.attachments?.length)parent=images.find(i=>i.filePath===image.attachments![0]&&i.id!==image.id)
    if(!parent&&image.canvasSketchPath)parent={id:`canvas-sketch-${image.id}`,filePath:image.canvasSketchPath,prompt:'Ursprüngliche Skizze',aspectRatio:image.aspectRatio,resolution:image.resolution,timestamp:image.timestamp,model:'sketch'}
    if(!parent)throw new Error('Für dieses Bild ist kein Ausgangsbild zum Vergleichen gespeichert.')
    setCompare([parent,image]);setViewer(null)
  }
  const generateVideo=async(id:string)=>{
    const image=useGalleryStore.getState().images.find(i=>i.id===id)
    if(!image?.filePath)return
    try{const result=await window.api.readImage(image.filePath);if(!result.success||!result.base64DataUrl)throw new Error(result.error||'Das Startbild konnte nicht geladen werden.');setVideoStartFrame({base64:result.base64DataUrl,name:image.filePath.split(/[/\\]/).pop()||'Startbild'});setMode('video');setSection('video');setViewer(null)}catch(err){setError(err instanceof Error?err.message:'Startbild konnte nicht geladen werden.')}
  }
  const closePanels=()=>{setViewer(null);setCrop(null);setCompare(null);setThumbnailPreview(null);setShortcuts(false);useCanvasStore.getState().close();setSection(mode)}
  useAutomationBridge(ready,{
    getView:()=>({mode,section,viewerImageId:viewer?.images[viewer.index]?.id,settingsOpen:section==='settings',collectionsOpen:section==='references',presetsOpen:section==='styles',queueOpen:section==='activity',canvasOpen,cropImageId:crop?.imageId,thumbnailPreviewImageId:thumbnailPreview?.images[thumbnailPreview.index]?.id}),
    navigate:async(target,id)=>{
      const aliases:Record<string,StudioSection>={collections:'references',presets:'styles',queue:'activity'}
      if(target==='workspace')selectWorkspace(id||null)
      else if(target==='project')selectProject(id||null)
      else if(isMode(target))navigateOverview(target)
      else if(aliases[target])navigateSection(aliases[target])
      else if(['library','references','styles','projects','activity','settings'].includes(target))navigateOverview(target as StudioSection)
      else if(target==='canvas')useCanvasStore.getState().open()
      else if(target==='close_panels')closePanels()
      else if(['crop','compare','reuse_prompt','create_variant'].includes(target)&&id){
        const image=useGalleryStore.getState().images.find(i=>i.id===id)
        if(!image?.filePath||image.type==='video')throw new Error('Ein fertig erstelltes Bild ist erforderlich.')
        if(target==='crop')openCrop(image.id,image.filePath)
        if(target==='compare')openCompare(image)
        if(target==='reuse_prompt')reusePrompt(image)
        if(target==='create_variant')createVariant(id)
      }else if(['viewer','thumbnail_preview'].includes(target)&&id){const images=useGalleryStore.getState().images,index=images.findIndex(i=>i.id===id);if(index<0)throw new Error('Das Bild wurde nicht gefunden.');if(target==='viewer')setViewer({images,index});else{const image=images[index];if(image.type==='video'||image.isLoading||image.error||!image.filePath)throw new Error('Die Thumbnail-Vorschau benötigt ein fertig erstelltes Bild.');const previews=images.filter(i=>i.type!=='video'&&!i.isLoading&&!i.error&&!!i.filePath);setThumbnailPreview({images:previews,index:previews.findIndex(i=>i.id===id)})}}
    },
  })
  useKeyboardShortcuts({focusSearch:()=>document.getElementById('studio-search')?.focus(),focusPromptBar:()=>{setSection(mode);requestAnimationFrame(()=>document.querySelector<HTMLElement>('.prompt-editor')?.focus())},toggleFavoritesFilter:()=>useGalleryFilterStore.getState().setFavoritesOnly(!useGalleryFilterStore.getState().favoritesOnly),showShortcutsHelp:()=>setShortcuts(v=>!v)})
  useEffect(()=>{const listener=(e:KeyboardEvent)=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();document.getElementById('studio-search')?.focus()}if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='p'){e.preventDefault();setSection('projects')}};document.addEventListener('keydown',listener);return()=>document.removeEventListener('keydown',listener)},[])
  const galleryVisible=isMode(section)||section==='library'
  const context=section==='thumbnail'?projects.find(p=>p.id===projectId)?.title:isMode(section)?workspaces.find(w=>w.id===workspaceId)?.name:undefined
  return <ErrorBoundary><div className="studio-shell">
    <StudioSidebar section={section} onNavigate={navigateOverview} onSelectWorkspace={selectWorkspace} onSelectProject={selectProject} open={sidebarOpen} onClose={()=>setSidebarOpen(false)}/>
    <TitleBar section={section} context={context} onOverview={()=>navigateOverview(section)} onStudio={()=>navigateOverview('library')} onMenu={()=>setSidebarOpen(v=>!v)} onActivity={()=>navigateSection('activity')} onSearch={()=>{if(!galleryVisible)navigateSection('library')}}/>
    <div className="studio-workarea">
      {/* Keep the draft mounted when organizing media; changing sections never discards typed text. */}
      <div className="min-h-0 flex-1 flex flex-col" style={{display:galleryVisible?undefined:'none'}}><MainContent mode={mode} library={section==='library'} onModeChange={navigateSection} onImageClick={showImage} onSettingsClick={()=>navigateSection('settings')} onCollectionsClick={()=>navigateSection('references')} onCreateVariant={safeVariant} onCropImage={openCrop} onPresetsManage={()=>navigateSection('styles')} onQueueClick={()=>navigateSection('activity')} onCanvasClick={()=>useCanvasStore.getState().open()} videoStartFrame={videoStartFrame} onGenerateVideo={generateVideo} onPreviewThumbnail={(images,index)=>setThumbnailPreview({images,index})}/></div>
      {section==='references'&&<CollectionsDialog embedded onUseCollection={id=>{if(mode==='video')navigateSection('image');else navigateSection(mode);setPendingCollection(id)}} onClose={()=>setSection(mode)}/>}
      {section==='styles'&&<PresetsDialog embedded onUsePreset={id=>{usePresetsStore.getState().setActivePreset(id);navigateSection('image')}} onClose={()=>setSection(mode)}/>}
      {section==='activity'&&<QueuePanel embedded onOpenImage={id=>{const images=useGalleryStore.getState().images;const index=images.findIndex(i=>i.id===id);if(index>=0)setViewer({images,index})}} onClose={()=>setSection(mode)}/>}
      {(settingsVisited||section==='settings')&&<div className="h-full min-h-0" style={{display:section==='settings'?undefined:'none'}}><SettingsDialog embedded onClose={()=>setSection(mode)}/></div>}
      {section==='projects'&&<ProjectsPage onOpenLibrary={()=>navigateOverview('library')} onSelectWorkspace={selectWorkspace} onSelectProject={selectProject}/>}
      {viewer&&<ImageViewer images={viewer.images} currentIndex={viewer.index} onClose={()=>setViewer(null)} onNavigate={index=>setViewer(v=>v?{...v,index}:null)} onCreateVariant={safeVariant} onReusePrompt={reusePrompt} onCropImage={openCrop} onCompare={image=>{try{openCompare(image)}catch(err){setError(err instanceof Error?err.message:'Vergleich nicht verfügbar.')}}}/>}
      {crop&&<CropModal imageSrc={toDisplayUrl(crop.filePath)} sourceImageId={crop.imageId} onCrop={(base64,id)=>{useCropStore.getState().addPendingRef(base64,id);setCrop(null);navigateSection('image')}} onClose={()=>setCrop(null)}/>}
      {compare&&<ImageCompare imageA={compare[0]} imageB={compare[1]} onClose={()=>setCompare(null)}/>}
      {thumbnailPreview&&<ThumbnailPreviewModal images={thumbnailPreview.images} index={thumbnailPreview.index} onNavigate={index=>setThumbnailPreview(v=>v?{...v,index}:null)} onClose={()=>setThumbnailPreview(null)}/>}
      {shortcuts&&<ShortcutsHelp onClose={()=>setShortcuts(false)}/>}
      {canvasOpen&&<CanvasModal/>}
      {error&&<div role="alert" className="absolute bottom-5 left-5 right-5 z-[90] flex items-center gap-4 p-4 rounded-xl bg-surface-3 border border-danger text-sm"><span className="flex-1">{error}</span><button onClick={()=>setError(null)} className="text-danger">Schließen</button></div>}
    </div>
  </div></ErrorBoundary>
}
