import { useState, useRef, useEffect, useCallback } from 'react'
import { Plus, X, Pencil, Trash2, Check, Youtube } from 'lucide-react'
import { useThumbnailProjectsStore, type ThumbnailProject } from '../../stores/thumbnail-projects-store'
import { useGalleryStore, isThumbnailImage } from '../../stores/gallery-store'
import { cn } from '../../lib/utils'

interface ContextMenuState {
  projectId: string
  x: number
  y: number
}

/**
 * The video bar. One pill per video, plus "Alle Thumbnails".
 *
 * A thumbnail can be dropped straight onto a pill — the same internal drag
 * payload the prompt bar already accepts, so dragging works everywhere.
 */
export function ProjectBar() {
  const projects = useThumbnailProjectsStore((s) => s.projects)
  const activeId = useThumbnailProjectsStore((s) => s.activeProjectId)
  const setActive = useThumbnailProjectsStore((s) => s.setActiveProject)
  const createProject = useThumbnailProjectsStore((s) => s.createProject)
  const updateProject = useThumbnailProjectsStore((s) => s.updateProject)
  const deleteProject = useThumbnailProjectsStore((s) => s.deleteProject)
  const images = useGalleryStore((s) => s.images)
  const moveToProject = useGalleryStore((s) => s.moveToProject)

  const [isCreating, setIsCreating] = useState(false)
  const [createTitle, setCreateTitle] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)

  const createInputRef = useRef<HTMLInputElement>(null)
  const editInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isCreating) createInputRef.current?.focus()
  }, [isCreating])

  useEffect(() => {
    if (editingId) editInputRef.current?.focus()
  }, [editingId])

  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [contextMenu])

  const handleCreate = useCallback(() => {
    const title = createTitle.trim()
    if (!title) {
      setIsCreating(false)
      return
    }
    createProject(title)
    setCreateTitle('')
    setIsCreating(false)
  }, [createTitle, createProject])

  const handleRename = useCallback(() => {
    const title = editTitle.trim()
    if (!title || !editingId) {
      setEditingId(null)
      return
    }
    updateProject(editingId, { title })
    setEditingId(null)
  }, [editTitle, editingId, updateProject])

  const handleDelete = useCallback((id: string) => {
    // Thumbnails outlive their project — they fall back to "Alle Thumbnails".
    const store = useGalleryStore.getState()
    store.images.forEach((img) => {
      if (img.projectId === id) store.moveToProject(img.id, undefined)
    })
    deleteProject(id)
    setContextMenu(null)
  }, [deleteProject])

  const startEditing = useCallback((project: ThumbnailProject) => {
    setEditingId(project.id)
    setEditTitle(project.title)
    setContextMenu(null)
  }, [])

  // Only thumbnails count here — the rest of the gallery is a different mode.
  const getCount = (projectId: string | null): number => {
    const done = images.filter((i) => !i.isLoading && !i.error && i.filePath && isThumbnailImage(i))
    if (projectId === null) return done.length
    return done.filter((i) => i.projectId === projectId).length
  }

  /** Accept a thumbnail dropped onto a pill. */
  const handleDrop = useCallback((e: React.DragEvent, projectId: string | undefined) => {
    e.preventDefault()
    setDropTargetId(null)
    const filePath = e.dataTransfer.getData('application/x-imagestudio')
    if (!filePath) return
    const img = useGalleryStore.getState().images.find((i) => i.filePath === filePath)
    if (img) moveToProject(img.id, projectId)
  }, [moveToProject])

  const dropProps = (projectId: string | undefined, key: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (e.dataTransfer.types.includes('application/x-imagestudio')) {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move' as const
        setDropTargetId(key)
      }
    },
    onDragLeave: () => setDropTargetId((prev) => (prev === key ? null : prev)),
    onDrop: (e: React.DragEvent) => handleDrop(e, projectId),
  })

  return (
    <div className="no-drag shrink-0 flex items-center gap-1 px-5 py-1.5 relative z-10 overflow-x-auto">
      <button
        onClick={() => setActive(null)}
        {...dropProps(undefined, 'all')}
        className={cn(
          'shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-medium transition-all border',
          activeId === null
            ? 'bg-surface-3 text-text-primary border-border-base'
            : 'text-text-muted hover:text-text-secondary hover:bg-surface-3/50 border-transparent',
          dropTargetId === 'all' && 'border-accent-main bg-accent-dim text-accent-main'
        )}
      >
        <Youtube className="w-3 h-3" />
        <span>Alle Thumbnails</span>
        <span className="text-[10px] tabular-nums text-text-muted">{getCount(null)}</span>
      </button>

      {projects.length > 0 && <div className="w-px h-3.5 bg-border-dim mx-0.5 shrink-0" />}

      {projects.map((project) => {
        const isActive = activeId === project.id
        const isEditing = editingId === project.id
        const count = getCount(project.id)

        if (isEditing) {
          return (
            <div
              key={project.id}
              className="shrink-0 flex items-center gap-1 px-1 py-0.5 rounded-lg bg-surface-3 border border-border-base animate-scale-in"
            >
              <div className="w-2 h-2 rounded-full shrink-0 ml-1" style={{ backgroundColor: project.color }} />
              <input
                ref={editInputRef}
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRename()
                  if (e.key === 'Escape') setEditingId(null)
                }}
                onBlur={handleRename}
                className="w-40 bg-transparent text-[11px] font-medium text-text-primary outline-none px-1"
              />
              <button onClick={handleRename} className="p-0.5 rounded text-accent-main hover:bg-accent-dim transition-colors">
                <Check className="w-3 h-3" />
              </button>
            </div>
          )
        }

        return (
          <button
            key={project.id}
            onClick={() => setActive(project.id)}
            onContextMenu={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setContextMenu({ projectId: project.id, x: e.clientX, y: e.clientY })
            }}
            {...dropProps(project.id, project.id)}
            className={cn(
              'shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-medium transition-all max-w-[220px] border',
              isActive ? 'text-text-primary' : 'text-text-muted hover:text-text-secondary hover:bg-surface-3/50 border-transparent',
              dropTargetId === project.id && 'ring-1 ring-accent-main'
            )}
            style={
              isActive
                ? { backgroundColor: `${project.color}10`, borderColor: `${project.color}25` }
                : undefined
            }
            title={project.angle ? `${project.title} — ${project.angle}` : project.title}
          >
            <div
              className="w-2 h-2 rounded-full shrink-0 transition-transform"
              style={{
                backgroundColor: project.color,
                opacity: isActive ? 1 : 0.5,
                transform: isActive ? 'scale(1)' : 'scale(0.85)',
              }}
            />
            <span className="truncate">{project.title}</span>
            {count > 0 && (
              <span className={cn('text-[10px] tabular-nums shrink-0', isActive ? 'text-text-secondary' : 'text-text-muted')}>
                {count}
              </span>
            )}
          </button>
        )
      })}

      {isCreating ? (
        <div className="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-lg bg-surface-3 border border-border-base animate-scale-in">
          <input
            ref={createInputRef}
            type="text"
            value={createTitle}
            onChange={(e) => setCreateTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate()
              if (e.key === 'Escape') {
                setIsCreating(false)
                setCreateTitle('')
              }
            }}
            onBlur={handleCreate}
            placeholder="Videotitel…"
            className="w-44 bg-transparent text-[11px] font-medium text-text-primary outline-none placeholder:text-text-muted"
          />
          <button
            onClick={() => {
              setIsCreating(false)
              setCreateTitle('')
            }}
            className="p-0.5 rounded text-text-muted hover:text-text-secondary transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setIsCreating(true)}
          className="shrink-0 flex items-center gap-1 px-2 h-6 rounded-lg text-[11px] text-text-muted hover:text-text-secondary hover:bg-surface-3/60 transition-all"
          title="Neues Video anlegen"
        >
          <Plus className="w-3.5 h-3.5" />
          Video
        </button>
      )}

      {contextMenu && (
        <div
          className="fixed z-[100] min-w-[160px] bg-surface-3 border border-border-base rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.5)] p-1 animate-scale-in"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              const p = projects.find((x) => x.id === contextMenu.projectId)
              if (p) startEditing(p)
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] text-text-secondary hover:bg-surface-4 hover:text-text-primary transition-colors text-left"
          >
            <Pencil className="w-3 h-3" />
            Titel ändern
          </button>
          <button
            onClick={() => handleDelete(contextMenu.projectId)}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] text-danger hover:bg-danger/10 transition-colors text-left"
          >
            <Trash2 className="w-3 h-3" />
            Video löschen
          </button>
        </div>
      )}
    </div>
  )
}
