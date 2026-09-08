import { useMemo, useState, type FormEvent } from 'react'
import { ArrowUpRight, Archive, FolderOpen, Image, Pencil, Plus, Search, Trash2, Video, X } from 'lucide-react'
import { useWorkspaceStore } from '../../stores/workspace-store'
import { useThumbnailProjectsStore } from '../../stores/thumbnail-projects-store'
import { useGalleryStore, toDisplayUrl, type GalleryImage } from '../../stores/gallery-store'
import { useUiRecentsStore } from '../../stores/ui-recents-store'
import { deleteProjectRetainingMedia, deleteWorkspaceRetainingMedia } from '../../lib/organization-actions'

export interface ProjectsPageProps {
  onOpenLibrary?: () => void
  onSelectWorkspace: (id: string | null) => void
  onSelectProject: (id: string | null) => void
}
type Editor = { kind: 'workspace' | 'project'; id?: string; name: string; angle: string; color: string; heroImageId: string; archived: boolean }
const control = 'w-full rounded-xl border border-border-base bg-surface-0 px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent-main focus:ring-1 focus:ring-accent-main'
const secondary = 'inline-flex items-center justify-center gap-2 rounded-xl border border-border-base px-3 py-2 text-sm text-text-primary transition-colors hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-main'

function Preview({ images, heroId }: { images: GalleryImage[]; heroId?: string }) {
  const hero = useGalleryStore((s) => heroId ? s.images.find((i) => i.id === heroId) : undefined)
  const cover = hero && !hero.isLoading && !hero.error && hero.filePath ? hero : images[0]
  const path = cover?.type === 'video' ? cover.videoThumbnailPath : cover?.filePath
  return <div className="relative aspect-[16/9] overflow-hidden bg-surface-0">
    {path ? <img src={toDisplayUrl(path)} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.025]" /> : <div className="flex h-full items-center justify-center text-text-muted/30"><Image size={36} strokeWidth={1} /></div>}
    <div className="absolute inset-0 bg-gradient-to-t from-black/35 to-transparent" />
    <span className="absolute bottom-3 right-3 rounded-md bg-black/60 px-2 py-1 text-xs text-white">{images.length} Medien</span>
  </div>
}

export function ProjectsPage({ onSelectWorkspace, onSelectProject, onOpenLibrary }: ProjectsPageProps) {
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const projects = useThumbnailProjectsStore((s) => s.projects)
  const images = useGalleryStore((s) => s.images)
  const [query, setQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [deleting, setDeleting] = useState<{ kind: 'workspace' | 'project'; id: string; name: string } | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const complete = useMemo(() => images.filter((i) => i.filePath && !i.isLoading && !i.error), [images])
  const search = query.trim().toLocaleLowerCase('de')
  const folders = workspaces.filter((w) => w.name.toLocaleLowerCase('de').includes(search))
  const videos = projects.filter((p) => (showArchived || !p.archived) && `${p.title} ${p.angle ?? ''}`.toLocaleLowerCase('de').includes(search))
  const start = (kind: Editor['kind']) => { setError(''); setDeleting(null); setEditor({ kind, name: '', angle: '', color: '#c7f36b', heroImageId: '', archived: false }) }
  const selectWorkspace = (id: string | null) => { useWorkspaceStore.getState().setActiveWorkspace(id); if (id) useUiRecentsStore.getState().bumpWorkspace(id); onSelectWorkspace(id) }
  const selectProject = (id: string | null) => { useThumbnailProjectsStore.getState().setActiveProject(id); if (id) useUiRecentsStore.getState().bumpProject(id); onSelectProject(id) }
  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!editor || !editor.name.trim()) return
    setBusy(true); setError('')
    try {
      if (editor.kind === 'workspace') {
        const store = useWorkspaceStore.getState()
        if (editor.id) {
          if (!store.workspaces.some((w) => w.id === editor.id)) throw new Error('Dieser Arbeitsordner wurde inzwischen entfernt.')
          store.renameWorkspace(editor.id, editor.name.trim())
        } else { const id = store.createWorkspace(editor.name.trim()); useUiRecentsStore.getState().bumpWorkspace(id) }
        await store.persistToDisk()
      } else {
        const store = useThumbnailProjectsStore.getState()
        if (editor.id && !store.projects.some((p) => p.id === editor.id)) throw new Error('Dieses Videoprojekt wurde inzwischen entfernt.')
        if (editor.heroImageId && !useGalleryStore.getState().images.some((i) => i.id === editor.heroImageId)) throw new Error('Das ausgewählte Titelbild wurde inzwischen entfernt.')
        const id = editor.id ?? store.createProject(editor.name.trim(), editor.angle.trim())
        store.updateProject(id, { title: editor.name.trim(), angle: editor.angle.trim() || undefined, color: editor.color, archived: editor.archived, heroImageId: editor.heroImageId || undefined })
        if (!editor.id) useUiRecentsStore.getState().bumpProject(id)
        await store.persistToDisk()
      }
      setEditor(null)
    } catch (err) { setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen. Bitte erneut versuchen.') } finally { setBusy(false) }
  }
  const remove = async () => {
    if (!deleting) return
    setBusy(true); setError('')
    try {
      await (deleting.kind === 'workspace' ? deleteWorkspaceRetainingMedia(deleting.id) : deleteProjectRetainingMedia(deleting.id))
      setDeleting(null)
    } catch (err) { setError(err instanceof Error ? err.message : 'Entfernen fehlgeschlagen.') } finally { setBusy(false) }
  }
  return <main className="flex-1 overflow-y-auto px-6 py-7 lg:px-9" aria-label="Projekte">
    <div className="mx-auto max-w-[1440px] space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div><p className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-accent-main">Dein Studio</p><h1 className="text-3xl font-semibold tracking-tight">Projekte</h1><p className="mt-2 text-sm text-text-muted">Gib deinen Ideen einen Platz. Vom ersten Entwurf bis zum finalen Bild.</p></div>
        <label className="relative block w-64"><Search size={16} className="absolute left-3 top-3 text-text-muted" /><span className="sr-only">Projekte und Arbeitsordner durchsuchen</span><input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Projekte durchsuchen …" className={`${control} pl-9`} /></label>
      </header>
      {error && <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-300">{error}</p>}
      {editor && <form onSubmit={save} className="rounded-2xl border border-accent-main/40 bg-surface-1 p-5 space-y-4" aria-label={editor.id ? 'Projekt bearbeiten' : 'Projekt erstellen'}>
        <div className="flex items-center justify-between"><h2 className="font-semibold">{editor.id ? 'Bearbeiten' : editor.kind === 'workspace' ? 'Neuer Arbeitsordner' : 'Neues Videoprojekt'}</h2><button type="button" aria-label="Bearbeitung schließen" disabled={busy} onClick={() => setEditor(null)} className={secondary}><X size={16} /></button></div>
        <label className="block space-y-2 text-sm"><span>{editor.kind === 'workspace' ? 'Name' : 'Videotitel'}</span><input autoFocus required maxLength={200} value={editor.name} onChange={(e) => setEditor({ ...editor, name: e.target.value })} className={control} placeholder={editor.kind === 'workspace' ? 'z. B. AgentZ Kampagne' : 'Worum geht es in deinem Video?'} /></label>
        {editor.kind === 'project' && <>
          <label className="block space-y-2 text-sm"><span>Blickwinkel / Hook <span className="text-text-muted">· optional</span></span><textarea rows={2} className={control} value={editor.angle} onChange={(e) => setEditor({ ...editor, angle: e.target.value })} placeholder="Welche Geschichte soll das Thumbnail erzählen?" /></label>
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex-1 min-w-52 space-y-2 text-sm block"><span>Titelbild</span><select className={control} value={editor.heroImageId} onChange={(e) => setEditor({ ...editor, heroImageId: e.target.value })}><option value="">Automatisch: neuestes Projektbild</option>{complete.map((i) => <option key={i.id} value={i.id}>{i.prompt.slice(0, 65) || 'Ohne Titel'} · {new Date(i.timestamp).toLocaleDateString('de-DE')}</option>)}</select></label>
            <label className="block space-y-2 text-sm"><span>Projektfarbe</span><input type="color" aria-label="Projektfarbe" value={/^#[0-9a-f]{6}$/i.test(editor.color) ? editor.color : '#c7f36b'} onChange={(e) => setEditor({ ...editor, color: e.target.value })} className="block h-10 w-16 cursor-pointer rounded-lg border border-border-base bg-surface-0" /></label>
            <label className="flex items-center gap-2 py-2 text-sm"><input type="checkbox" checked={editor.archived} onChange={(e) => setEditor({ ...editor, archived: e.target.checked })} className="accent-accent-main" />Archiviert</label>
          </div>
        </>}
        <div className="flex justify-end gap-2"><button type="button" className={secondary} disabled={busy} onClick={() => setEditor(null)}>Abbrechen</button><button type="submit" disabled={busy || !editor.name.trim()} className="rounded-xl bg-accent-main px-5 py-2 text-sm font-semibold text-accent-ink disabled:opacity-40">{busy ? 'Speichert …' : 'Speichern'}</button></div>
      </form>}
      {deleting && <section role="alertdialog" aria-label="Entfernen bestätigen" aria-describedby="organization-delete-description" className="rounded-2xl border border-red-400/30 bg-surface-1 p-5"><h2 className="font-semibold">„{deleting.name}“ entfernen?</h2><p id="organization-delete-description" className="mt-2 text-sm text-text-muted">Alle Bilder und Videos bleiben in deiner Mediathek. Nur die Zuordnung wird entfernt.</p><div className="mt-4 flex gap-2"><button className={secondary} disabled={busy} onClick={() => setDeleting(null)}>Abbrechen</button><button className="rounded-xl bg-red-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-40" disabled={busy} onClick={remove}>{busy ? 'Entfernt …' : 'Entfernen'}</button></div></section>}
      <section aria-labelledby="folders-heading">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 id="folders-heading" className="text-lg font-semibold">Arbeitsordner <span className="ml-2 text-sm font-normal text-text-muted">{workspaces.length}</span></h2><p className="mt-1 text-sm text-text-muted">Bilder, Logos und Videos gemeinsam organisieren.</p></div><div className="flex gap-2"><button className={secondary} onClick={() => onOpenLibrary ? onOpenLibrary() : selectWorkspace(null)}>Alle Medien <ArrowUpRight size={14} /></button><button className={secondary} onClick={() => start('workspace')}><Plus size={15} />Arbeitsordner</button></div></div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{folders.map((w) => <article key={w.id} className="group overflow-hidden rounded-2xl border border-border-base bg-surface-1 transition-colors hover:border-accent-main/40">
          <button className="block w-full text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-main" onClick={() => selectWorkspace(w.id)}><Preview images={complete.filter((i) => i.workspaceId === w.id)} /><div className="flex items-center gap-2 px-4 pt-4"><FolderOpen size={16} style={{ color: w.color }} /><h3 className="truncate font-medium">{w.name}</h3><ArrowUpRight size={15} className="ml-auto shrink-0 text-text-muted" /></div></button>
          <div className="flex items-center justify-between px-4 pb-3 pt-2"><span className="text-xs text-text-muted">{new Date(w.createdAt).toLocaleDateString('de-DE')}</span><div className="flex gap-1"><button className="rounded-lg p-2 text-text-muted hover:bg-surface-hover hover:text-text-primary" aria-label={`${w.name} umbenennen`} onClick={() => { setError(''); setDeleting(null); setEditor({ kind: 'workspace', id: w.id, name: w.name, angle: '', color: w.color, heroImageId: '', archived: false }) }}><Pencil size={14} /></button><button className="rounded-lg p-2 text-text-muted hover:bg-red-500/10 hover:text-red-400" aria-label={`${w.name} entfernen`} onClick={() => { setEditor(null); setError(''); setDeleting({ kind: 'workspace', id: w.id, name: w.name }) }}><Trash2 size={14} /></button></div></div>
        </article>)}</div>
        {!folders.length && <div className="rounded-2xl border border-dashed border-border-base py-10 text-center"><FolderOpen className="mx-auto mb-3 text-text-muted" /><p className="text-sm text-text-muted">{search ? 'Keine passenden Arbeitsordner.' : 'Dein erster Arbeitsordner wartet auf eine Idee.'}</p>{!search && <button onClick={() => start('workspace')} className={`${secondary} mt-4`}>Arbeitsordner erstellen</button>}</div>}
      </section>
      <section aria-labelledby="videos-heading">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 id="videos-heading" className="text-lg font-semibold">Videoprojekte <span className="ml-2 text-sm font-normal text-text-muted">{projects.length}</span></h2><p className="mt-1 text-sm text-text-muted">Ein Video. Alle Thumbnail-Ideen. Ein gemeinsamer Kontext.</p></div><div className="flex flex-wrap items-center gap-2"><label className="mr-2 flex items-center gap-2 text-xs text-text-muted"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="accent-accent-main" />Archivierte zeigen</label><button className={secondary} onClick={() => selectProject(null)}>Alle Thumbnails <ArrowUpRight size={14} /></button><button className={secondary} onClick={() => start('project')}><Plus size={15} />Videoprojekt</button></div></div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{videos.map((p) => <article key={p.id} className="group overflow-hidden rounded-2xl border border-border-base bg-surface-1 transition-colors hover:border-accent-main/40">
          <button className="block w-full text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-main" onClick={() => selectProject(p.id)}><Preview images={complete.filter((i) => i.projectId === p.id)} heroId={p.heroImageId} /><div className="px-4 pt-4"><div className="flex items-center gap-2"><Video size={16} style={{ color: p.color }} /><h3 className="truncate font-medium">{p.title}</h3>{p.archived && <Archive size={14} aria-label="Archiviert" className="shrink-0 text-text-muted" />}</div><p className="mt-2 line-clamp-2 min-h-8 text-xs text-text-muted">{p.angle || 'Blickwinkel ergänzen und Ideen entwickeln.'}</p></div></button>
          <div className="flex items-center justify-between px-4 pb-3 pt-1"><span className="text-xs text-text-muted">{new Date(p.createdAt).toLocaleDateString('de-DE')}</span><div className="flex gap-1"><button className="rounded-lg p-2 text-text-muted hover:bg-surface-hover hover:text-text-primary" aria-label={`${p.title} bearbeiten`} onClick={() => { setError(''); setDeleting(null); setEditor({ kind: 'project', id: p.id, name: p.title, angle: p.angle ?? '', color: p.color, heroImageId: p.heroImageId ?? '', archived: !!p.archived }) }}><Pencil size={14} /></button><button className="rounded-lg p-2 text-text-muted hover:bg-red-500/10 hover:text-red-400" aria-label={`${p.title} entfernen`} onClick={() => { setEditor(null); setError(''); setDeleting({ kind: 'project', id: p.id, name: p.title }) }}><Trash2 size={14} /></button></div></div>
        </article>)}</div>
        {!videos.length && <div className="rounded-2xl border border-dashed border-border-base py-10 text-center"><Video className="mx-auto mb-3 text-text-muted" /><p className="text-sm text-text-muted">{search ? 'Keine passenden Videoprojekte.' : projects.length ? 'Keine aktiven Videoprojekte. Blende archivierte Projekte ein.' : 'Starte ein Videoprojekt für deine Thumbnail-Varianten.'}</p>{!search && <button onClick={() => start('project')} className={`${secondary} mt-4`}>Videoprojekt erstellen</button>}</div>}
      </section>
    </div>
  </main>
}
