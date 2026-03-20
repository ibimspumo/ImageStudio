import { useState, useRef, useEffect, useCallback } from 'react'
import { Plus, X, Pencil, Trash2, Check } from 'lucide-react'
import { useWorkspaceStore, type Workspace } from '../../stores/workspace-store'
import { useGalleryStore } from '../../stores/gallery-store'
import { cn } from '../../lib/utils'

interface ContextMenuState {
  workspaceId: string
  x: number
  y: number
}

export function WorkspaceBar() {
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const activeId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const setActive = useWorkspaceStore((s) => s.setActiveWorkspace)
  const createWorkspace = useWorkspaceStore((s) => s.createWorkspace)
  const renameWorkspace = useWorkspaceStore((s) => s.renameWorkspace)
  const deleteWorkspace = useWorkspaceStore((s) => s.deleteWorkspace)
  const images = useGalleryStore((s) => s.images)

  const [isCreating, setIsCreating] = useState(false)
  const [createName, setCreateName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  const createInputRef = useRef<HTMLInputElement>(null)
  const editInputRef = useRef<HTMLInputElement>(null)

  // Focus create input when it appears
  useEffect(() => {
    if (isCreating) createInputRef.current?.focus()
  }, [isCreating])

  // Focus edit input when it appears
  useEffect(() => {
    if (editingId) editInputRef.current?.focus()
  }, [editingId])

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [contextMenu])

  const handleCreate = useCallback(() => {
    const name = createName.trim()
    if (!name) { setIsCreating(false); return }
    createWorkspace(name)
    setCreateName('')
    setIsCreating(false)
  }, [createName, createWorkspace])

  const handleRename = useCallback(() => {
    const name = editName.trim()
    if (!name || !editingId) { setEditingId(null); return }
    renameWorkspace(editingId, name)
    setEditingId(null)
  }, [editName, editingId, renameWorkspace])

  const handleContextMenu = useCallback((e: React.MouseEvent, workspaceId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ workspaceId, x: e.clientX, y: e.clientY })
  }, [])

  const startEditing = useCallback((workspace: Workspace) => {
    setEditingId(workspace.id)
    setEditName(workspace.name)
    setContextMenu(null)
  }, [])

  const handleDelete = useCallback((id: string) => {
    // Move images from this workspace back to "All"
    const store = useGalleryStore.getState()
    store.images.forEach((img) => {
      if (img.workspaceId === id) {
        store.moveToWorkspace(img.id, undefined)
      }
    })
    deleteWorkspace(id)
    setContextMenu(null)
  }, [deleteWorkspace])

  // Count images per workspace
  const getCount = (workspaceId: string | null): number => {
    if (workspaceId === null) return images.filter((i) => !i.isLoading && !i.error && i.filePath).length
    return images.filter((i) => i.workspaceId === workspaceId && !i.isLoading && !i.error && i.filePath).length
  }

  // Don't render the bar at all if there are no workspaces and we're not creating one
  if (workspaces.length === 0 && !isCreating) {
    return (
      <div className="no-drag shrink-0 flex items-center justify-center px-5 py-1 relative z-10">
        <button
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] text-text-muted hover:text-text-secondary transition-all hover:bg-surface-3"
          title="Create workspace"
        >
          <Plus className="w-3 h-3" />
          <span>Workspace</span>
        </button>
      </div>
    )
  }

  return (
    <div className="no-drag shrink-0 flex items-center gap-1 px-5 py-1.5 relative z-10 overflow-x-auto">
      {/* "All" tab */}
      <button
        onClick={() => setActive(null)}
        className={cn(
          'shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-medium transition-all',
          activeId === null
            ? 'bg-surface-3 text-text-primary border border-border-base'
            : 'text-text-muted hover:text-text-secondary hover:bg-surface-3/50'
        )}
      >
        <span>All</span>
        <span className={cn(
          'text-[10px] tabular-nums',
          activeId === null ? 'text-text-secondary' : 'text-text-muted'
        )}>
          {getCount(null)}
        </span>
      </button>

      {/* Divider */}
      {workspaces.length > 0 && (
        <div className="w-px h-3.5 bg-border-dim mx-0.5 shrink-0" />
      )}

      {/* Workspace tabs */}
      {workspaces.map((workspace) => {
        const isActive = activeId === workspace.id
        const isEditing = editingId === workspace.id
        const count = getCount(workspace.id)

        if (isEditing) {
          return (
            <div key={workspace.id} className="shrink-0 flex items-center gap-1 px-1 py-0.5 rounded-lg bg-surface-3 border border-border-base animate-scale-in">
              <div
                className="w-2 h-2 rounded-full shrink-0 ml-1"
                style={{ backgroundColor: workspace.color }}
              />
              <input
                ref={editInputRef}
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRename()
                  if (e.key === 'Escape') setEditingId(null)
                }}
                onBlur={handleRename}
                className="w-20 bg-transparent text-[11px] font-medium text-text-primary outline-none px-1"
              />
              <button
                onClick={handleRename}
                className="p-0.5 rounded text-accent-main hover:bg-accent-dim transition-colors"
              >
                <Check className="w-3 h-3" />
              </button>
            </div>
          )
        }

        return (
          <button
            key={workspace.id}
            onClick={() => setActive(workspace.id)}
            onContextMenu={(e) => handleContextMenu(e, workspace.id)}
            className={cn(
              'shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-medium transition-all group',
              isActive
                ? 'text-text-primary border'
                : 'text-text-muted hover:text-text-secondary hover:bg-surface-3/50'
            )}
            style={isActive ? {
              backgroundColor: `${workspace.color}10`,
              borderColor: `${workspace.color}25`,
            } : undefined}
          >
            <div
              className="w-2 h-2 rounded-full shrink-0 transition-transform"
              style={{
                backgroundColor: workspace.color,
                opacity: isActive ? 1 : 0.5,
                transform: isActive ? 'scale(1)' : 'scale(0.85)',
              }}
            />
            <span>{workspace.name}</span>
            {count > 0 && (
              <span className={cn(
                'text-[10px] tabular-nums',
                isActive ? 'text-text-secondary' : 'text-text-muted'
              )}>
                {count}
              </span>
            )}
          </button>
        )
      })}

      {/* Create new workspace */}
      {isCreating ? (
        <div className="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-lg bg-surface-3 border border-border-base animate-scale-in">
          <input
            ref={createInputRef}
            type="text"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate()
              if (e.key === 'Escape') { setIsCreating(false); setCreateName('') }
            }}
            onBlur={handleCreate}
            placeholder="Name..."
            className="w-20 bg-transparent text-[11px] font-medium text-text-primary outline-none placeholder:text-text-muted"
          />
          <button
            onClick={() => { setIsCreating(false); setCreateName('') }}
            className="p-0.5 rounded text-text-muted hover:text-text-secondary transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setIsCreating(true)}
          className="shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-text-muted hover:text-text-secondary hover:bg-surface-3/60 transition-all"
          title="New workspace"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-[100] min-w-[140px] bg-surface-3 border border-border-base rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.5)] p-1 animate-scale-in"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              const ws = workspaces.find((w) => w.id === contextMenu.workspaceId)
              if (ws) startEditing(ws)
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] text-text-secondary hover:bg-surface-4 hover:text-text-primary transition-colors text-left"
          >
            <Pencil className="w-3 h-3" />
            Rename
          </button>
          <button
            onClick={() => handleDelete(contextMenu.workspaceId)}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] text-danger hover:bg-danger/10 transition-colors text-left"
          >
            <Trash2 className="w-3 h-3" />
            Delete
          </button>
        </div>
      )}
    </div>
  )
}
