import { OrganizationSidebarItem } from '../workspace/OrganizationSidebarItem'
import { BrandIcon } from '../shared/BrandIcon'
import { Image, Printer, Film, Youtube, Hexagon, Grid2X2, Layers, SlidersHorizontal, Folder, Activity, Settings, Plus, X } from 'lucide-react'
import { useWorkspaceStore } from '../../stores/workspace-store'
import { useThumbnailProjectsStore } from '../../stores/thumbnail-projects-store'
import { useUiRecentsStore } from '../../stores/ui-recents-store'
import { useGalleryStore } from '../../stores/gallery-store'
import type { AppMode } from './MainContent'

declare const __APP_VERSION__: string

export type StudioSection = AppMode | 'library' | 'references' | 'styles' | 'projects' | 'activity' | 'settings'
export const SECTION_LABELS: Record<StudioSection, string> = { image:'Bild', video:'Video', thumbnail:'Thumbnail', logo:'Logo', print:'Print', library:'Mediathek', references:'Referenzen', styles:'Stile & Vorlagen', projects:'Projekte', activity:'Aktivität', settings:'Einstellungen' }
interface Props { section: StudioSection; onNavigate: (section: StudioSection) => void; onSelectWorkspace: (id: string | null) => void; onSelectProject: (id: string | null) => void; open: boolean; onClose: () => void }
export function StudioSidebar({ section, onNavigate, onSelectWorkspace, onSelectProject, open, onClose }: Props) {
  const workspaces = useWorkspaceStore(s => s.workspaces)
  const projects = useThumbnailProjectsStore(s => s.projects)
  const activeWorkspace = useWorkspaceStore(s => s.activeWorkspaceId)
  const activeProject = useThumbnailProjectsStore(s => s.activeProjectId)
  const recents = useUiRecentsStore(s => s.recentProjectIds)
  const runningCount = useGalleryStore(s => s.images.filter(i => i.isLoading).length)
  const entries = [...projects.filter(p => !p.archived)].sort((a,b) => {
    const ai=recents.indexOf(a.id),bi=recents.indexOf(b.id)
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) || b.createdAt-a.createdAt
  }).slice(0,4)
  const nav = (id: StudioSection, Icon: typeof Image) => <button key={id} data-studio-section={id} aria-current={section === id ? 'page' : undefined} className="studio-nav-item" onClick={() => { onNavigate(id); onClose() }}><Icon className="w-[18px] h-[18px] shrink-0" /><span className="truncate">{SECTION_LABELS[id]}</span>{id==='activity'&&runningCount>0&&<span className="ml-auto rounded bg-accent-dim px-1.5 text-accent-main text-xs">{runningCount}</span>}</button>
  const drop = (event: React.DragEvent, id: string, type: 'workspace' | 'project') => {
    event.preventDefault()
    const filePath=event.dataTransfer.getData('application/x-imagestudio')
    const store=useGalleryStore.getState(),image=store.images.find(i=>i.filePath===filePath)
    if(image) type==='workspace' ? store.moveToWorkspace(image.id,id) : store.moveToProject(image.id,id)
  }
  return <>
    {open&&<button className="studio-mobile-toggle fixed inset-0 bg-black/60 z-40" aria-label="Navigation schließen" onClick={onClose}/>}
    <aside className={`studio-sidebar ${open?'is-open':''}`} aria-label="Studio-Navigation">
      <div className="studio-sidebar-brand"><BrandIcon variant="sidebar" className="w-10 h-10 -ml-1"/><strong className="text-[17px] tracking-tight">ImageStudio</strong><button className="studio-mobile-toggle ml-auto" onClick={onClose} aria-label="Navigation schließen"><X className="w-4 h-4"/></button></div>
      <nav className="studio-sidebar-nav" aria-label="Hauptnavigation"><p className="studio-nav-label">Erstellen</p>{nav('image',Image)}{nav('thumbnail',Youtube)}{nav('video',Film)}{nav('logo',Hexagon)}{nav('print',Printer)}<div className="h-5"/>{nav('library',Grid2X2)}{nav('references',Layers)}{nav('styles',SlidersHorizontal)}<div className="h-5"/><div className="flex items-center studio-nav-label"><span>Projekte</span><button className="ml-auto p-1 rounded hover:bg-surface-4" title="Projekte verwalten" aria-label="Projekte verwalten" onClick={()=>onNavigate('projects')}><Plus className="w-4 h-4"/></button></div>{entries.map(p => <OrganizationSidebarItem key={p.id} id={p.id} name={p.title} kind="project"
        active={section === 'thumbnail' && activeProject === p.id}
        icon={<span className="w-2 h-2 rounded-sm shrink-0" style={{ background: p.color }} />}
        onSelect={() => { onSelectProject(p.id); onClose() }} onDrop={e => drop(e, p.id, 'project')} />)}
      {workspaces.slice(-3).map(w => <OrganizationSidebarItem key={w.id} id={w.id} name={w.name} kind="workspace"
        active={activeWorkspace === w.id && section !== 'thumbnail'} icon={<Folder className="w-4 h-4 shrink-0" />}
        onSelect={() => { onSelectWorkspace(w.id); onClose() }} onDrop={e => drop(e, w.id, 'workspace')} />)}{nav('projects',Folder)}</nav>
      <div className="shrink-0 border-t border-border-dim pt-3">{nav('activity',Activity)}{nav('settings',Settings)}<p className="text-xs text-text-muted px-3 pt-3">Lokales Studio <span className="float-right">v{__APP_VERSION__}</span></p></div>
    </aside>
  </>
}
