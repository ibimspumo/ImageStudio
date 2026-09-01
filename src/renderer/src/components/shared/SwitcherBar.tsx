import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check, ChevronDown, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { cn } from '../../lib/utils'

export interface SwitcherItem {
  id: string
  name: string
  color: string
  count: number
}

interface SwitcherBarProps {
  items: SwitcherItem[]
  activeId: string | null
  /** Most-recently-used ids, newest first — drives the quick-access pills. */
  recentIds: string[]
  allLabel: string
  allIcon?: ReactNode
  allCount: number
  /** Noun for creating and labelling, e.g. "Video" or "Workspace". */
  entityLabel: string
  searchPlaceholder: string
  onSelect: (id: string | null) => void
  onCreate: (name: string) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  /** Internal image drag payload dropped on a pill or list row. */
  onDropImage?: (filePath: string, targetId: string | undefined) => void
}

const DRAG_TYPE = 'application/x-imagestudio'

/**
 * One switcher instead of a pill per entry: the bar shows the active entry
 * plus the recently used ones, everything else lives in a searchable panel
 * (⌘P). Scales to any number of projects without horizontal scrolling, and
 * the pills stay drop targets for gallery drags.
 */
export function SwitcherBar({
  items,
  activeId,
  recentIds,
  allLabel,
  allIcon,
  allCount,
  entityLabel,
  searchPlaceholder,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onDropImage,
}: SwitcherBarProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  const searchRef = useRef<HTMLInputElement>(null)
  const editRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const active = activeId ? items.find((i) => i.id === activeId) ?? null : null

  // Quick-access pills: recents first (minus the active one), topped up with
  // the newest entries so the row is useful before any history exists.
  const quickItems = useMemo(() => {
    const seen = new Set<string>(activeId ? [activeId] : [])
    const picked: SwitcherItem[] = []
    for (const id of recentIds) {
      if (seen.has(id)) continue
      const item = items.find((i) => i.id === id)
      if (item) {
        picked.push(item)
        seen.add(id)
      }
      if (picked.length >= 4) return picked
    }
    for (let i = items.length - 1; i >= 0 && picked.length < 4; i--) {
      if (!seen.has(items[i].id)) {
        picked.push(items[i])
        seen.add(items[i].id)
      }
    }
    return picked
  }, [items, recentIds, activeId])

  const trimmed = query.trim()
  const filtered = useMemo(() => {
    if (!trimmed) return items
    const q = trimmed.toLowerCase()
    return items.filter((i) => i.name.toLowerCase().includes(q))
  }, [items, trimmed])

  const canCreate = trimmed.length > 0 && !items.some((i) => i.name.toLowerCase() === trimmed.toLowerCase())

  // The keyboard walks one flat list: "All", the matches, then the create row.
  type Row = { kind: 'all' } | { kind: 'item'; item: SwitcherItem } | { kind: 'create' }
  const rows = useMemo<Row[]>(() => {
    const r: Row[] = []
    if (!trimmed) r.push({ kind: 'all' })
    for (const item of filtered) r.push({ kind: 'item', item })
    if (canCreate) r.push({ kind: 'create' })
    return r
  }, [trimmed, filtered, canCreate])

  useEffect(() => setHighlight(0), [query, open])
  useEffect(() => {
    if (open) requestAnimationFrame(() => searchRef.current?.focus())
    else {
      setQuery('')
      setEditingId(null)
    }
  }, [open])
  useEffect(() => {
    if (editingId) requestAnimationFrame(() => editRef.current?.select())
  }, [editingId])

  // ⌘P toggles the panel — only one switcher is mounted per mode.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const close = useCallback(() => setOpen(false), [])

  const pick = useCallback(
    (row: Row | undefined) => {
      if (!row) return
      if (row.kind === 'all') onSelect(null)
      else if (row.kind === 'item') onSelect(row.item.id)
      else if (trimmed) onCreate(trimmed)
      close()
    },
    [onSelect, onCreate, trimmed, close]
  )

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => Math.min(h + 1, rows.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      pick(rows[highlight])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      close()
    }
  }

  const commitRename = () => {
    const name = editName.trim()
    if (editingId && name) onRename(editingId, name)
    setEditingId(null)
  }

  const dropProps = (key: string, targetId: string | undefined) =>
    onDropImage
      ? {
          onDragOver: (e: React.DragEvent) => {
            if (e.dataTransfer.types.includes(DRAG_TYPE)) {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move' as const
              setDropTarget(key)
            }
          },
          onDragLeave: () => setDropTarget((prev) => (prev === key ? null : prev)),
          onDrop: (e: React.DragEvent) => {
            e.preventDefault()
            setDropTarget(null)
            const filePath = e.dataTransfer.getData(DRAG_TYPE)
            if (filePath) onDropImage(filePath, targetId)
          },
        }
      : {}

  return (
    <div className="no-drag shrink-0 flex flex-wrap items-center gap-1 px-5 py-1.5 relative z-30">
      {/* "All" pill */}
      <button
        onClick={() => onSelect(null)}
        {...dropProps('all', undefined)}
        className={cn(
          'shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-medium transition-all border',
          activeId === null
            ? 'bg-surface-3 text-text-primary border-border-base'
            : 'text-text-muted hover:text-text-secondary hover:bg-surface-3/50 border-transparent',
          dropTarget === 'all' && 'ring-1 ring-accent-main border-accent-main/40'
        )}
      >
        {allIcon}
        <span>{allLabel}</span>
        <span className="text-[10px] tabular-nums text-text-muted">{allCount}</span>
      </button>

      <div className="w-px h-3.5 bg-border-dim mx-0.5 shrink-0" />

      {/* Switcher button — the active entry, or a quiet entry point */}
      <div className="relative shrink-0">
        <button
          onClick={() => setOpen(!open)}
          {...(active ? dropProps('active', active.id) : {})}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-medium transition-all border max-w-[240px]',
            active
              ? 'text-text-primary'
              : 'text-text-muted hover:text-text-secondary hover:bg-surface-3/50 border-transparent',
            dropTarget === 'active' && 'ring-1 ring-accent-main'
          )}
          style={
            active ? { backgroundColor: `${active.color}10`, borderColor: `${active.color}25` } : undefined
          }
          title={`${entityLabel} wechseln (⌘P)`}
        >
          {active ? (
            <>
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: active.color }} />
              <span className="truncate">{active.name}</span>
              {active.count > 0 && (
                <span className="text-[10px] tabular-nums text-text-secondary shrink-0">{active.count}</span>
              )}
            </>
          ) : (
            <span>{entityLabel} wählen</span>
          )}
          <ChevronDown className={cn('w-3 h-3 shrink-0 opacity-60 transition-transform duration-200', open && 'rotate-180')} />
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-30" onClick={close} />
            <div
              ref={panelRef}
              className="absolute top-full left-0 mt-1.5 w-[300px] bg-surface-3 border border-border-base rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.5)] p-1.5 z-40 animate-scale-in"
            >
              <div className="flex items-center justify-between px-2 pt-1 pb-1.5">
                <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
                  {entityLabel} wechseln
                </span>
                <span className="text-[10px] text-text-muted/70">⌘P</span>
              </div>

              <div className="flex items-center gap-2 h-8 px-2.5 mx-0.5 mb-1 rounded-lg bg-surface-4 border border-border-base focus-within:border-accent-main/50 transition-colors">
                <Search className="w-3.5 h-3.5 text-text-muted shrink-0" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder={searchPlaceholder}
                  className="flex-1 min-w-0 bg-transparent text-[12px] text-text-primary outline-none placeholder:text-text-muted"
                />
              </div>

              <div className="max-h-[280px] overflow-y-auto">
                {rows.map((row, idx) => {
                  if (row.kind === 'all') {
                    return (
                      <button
                        key="__all"
                        onClick={() => pick(row)}
                        onMouseMove={() => setHighlight(idx)}
                        className={cn(
                          'w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[12px] text-left transition-colors',
                          highlight === idx ? 'bg-surface-4 text-text-primary' : 'text-text-secondary'
                        )}
                      >
                        <span className="w-2 h-2 rounded-full bg-text-muted/40 shrink-0" />
                        <span className="flex-1 truncate">{allLabel}</span>
                        <span className="text-[10px] tabular-nums text-text-muted">{allCount}</span>
                        {activeId === null && <Check className="w-3 h-3 text-accent-main shrink-0" />}
                      </button>
                    )
                  }

                  if (row.kind === 'create') {
                    return (
                      <button
                        key="__create"
                        onClick={() => pick(row)}
                        onMouseMove={() => setHighlight(idx)}
                        className={cn(
                          'w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[12px] text-left transition-colors',
                          highlight === idx ? 'bg-surface-4 text-text-primary' : 'text-text-muted'
                        )}
                      >
                        <Plus className="w-3.5 h-3.5 shrink-0" />
                        <span className="flex-1 truncate">
                          Neues {entityLabel} „{trimmed}" anlegen
                        </span>
                      </button>
                    )
                  }

                  const item = row.item
                  if (editingId === item.id) {
                    return (
                      <div
                        key={item.id}
                        className="flex items-center gap-2.5 px-2.5 py-1 rounded-lg bg-surface-4"
                      >
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                        <input
                          ref={editRef}
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitRename()
                            if (e.key === 'Escape') setEditingId(null)
                            e.stopPropagation()
                          }}
                          onBlur={commitRename}
                          className="flex-1 min-w-0 bg-transparent text-[12px] text-text-primary outline-none py-0.5"
                        />
                        <button
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={commitRename}
                          className="p-1 rounded text-accent-main hover:bg-accent-dim transition-colors"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                      </div>
                    )
                  }

                  return (
                    <div
                      key={item.id}
                      onMouseMove={() => setHighlight(idx)}
                      {...dropProps(`row-${item.id}`, item.id)}
                      className={cn(
                        'group/row flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer',
                        highlight === idx ? 'bg-surface-4' : '',
                        dropTarget === `row-${item.id}` && 'ring-1 ring-accent-main'
                      )}
                      onClick={() => pick(row)}
                    >
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                      <span
                        className={cn(
                          'flex-1 truncate text-[12px] text-left',
                          highlight === idx ? 'text-text-primary' : 'text-text-secondary'
                        )}
                      >
                        {item.name}
                      </span>
                      <span className="text-[10px] tabular-nums text-text-muted group-hover/row:hidden">
                        {item.count > 0 ? item.count : ''}
                      </span>
                      {item.id === activeId && (
                        <Check className="w-3 h-3 text-accent-main shrink-0 group-hover/row:hidden" />
                      )}
                      <span className="hidden group-hover/row:flex items-center gap-0.5 shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditingId(item.id)
                            setEditName(item.name)
                          }}
                          className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
                          title="Umbenennen"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onDelete(item.id)
                          }}
                          className="p-1 rounded text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                          title={`${entityLabel} löschen — Bilder fallen zurück auf „${allLabel}"`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </span>
                    </div>
                  )
                })}

                {rows.length === 0 && (
                  <div className="px-2.5 py-3 text-[11px] text-text-muted text-center">
                    Nichts gefunden
                  </div>
                )}
              </div>

              <div className="border-t border-border-dim mt-1 pt-1.5 px-2 pb-1 text-[10px] text-text-muted/70">
                ↑↓ wählen · ⏎ öffnen · Tippen legt Neues an
              </div>
            </div>
          </>
        )}
      </div>

      {/* Recently used — stays a one-click, drag-and-drop target row */}
      {quickItems.map((item) => (
        <button
          key={item.id}
          onClick={() => onSelect(item.id)}
          {...dropProps(item.id, item.id)}
          className={cn(
            'shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all border border-transparent max-w-[160px]',
            'text-text-muted hover:text-text-secondary hover:bg-surface-3/50',
            dropTarget === item.id && 'ring-1 ring-accent-main'
          )}
          title={item.name}
        >
          <span className="w-2 h-2 rounded-full shrink-0 opacity-50" style={{ backgroundColor: item.color }} />
          <span className="truncate">{item.name}</span>
          {item.count > 0 && <span className="text-[10px] tabular-nums shrink-0">{item.count}</span>}
        </button>
      ))}

      <button
        onClick={() => setOpen(true)}
        className="shrink-0 flex items-center gap-1 px-2 h-6 rounded-lg text-[11px] text-text-muted hover:text-text-secondary hover:bg-surface-3/60 transition-all"
        title={`Neues ${entityLabel} anlegen — Namen ins Suchfeld tippen`}
      >
        <Plus className="w-3.5 h-3.5" />
        {entityLabel}
      </button>
    </div>
  )
}
