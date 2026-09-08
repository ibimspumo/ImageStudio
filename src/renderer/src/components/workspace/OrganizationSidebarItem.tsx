import { useRef, useState, type ReactNode, type DragEvent } from 'react'
import { Trash2 } from 'lucide-react'
import { deleteProjectRetainingMedia, deleteWorkspaceRetainingMedia } from '../../lib/organization-actions'

interface Props {
  id: string
  name: string
  kind: 'workspace' | 'project'
  active: boolean
  icon: ReactNode
  onSelect: () => void
  onDrop: (event: DragEvent) => void
}

/** Sidebar entry with a local confirmation; deletion uses the same action as MCP. */
export function OrganizationSidebarItem({ id, name, kind, active, icon, onSelect, onDrop }: Props) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const trigger = useRef<HTMLButtonElement>(null)
  const label = kind === 'workspace' ? 'Arbeitsordner' : 'Videoprojekt'
  const cancel = () => { setConfirming(false); setError(''); trigger.current?.focus() }
  const remove = async () => {
    setBusy(true); setError('')
    try {
      await (kind === 'workspace' ? deleteWorkspaceRetainingMedia(id) : deleteProjectRetainingMedia(id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Löschen fehlgeschlagen. Bitte erneut versuchen.')
      setBusy(false)
    }
  }
  return <div className="mb-1">
    <div className="flex items-center gap-0.5">
      <button className="studio-nav-item min-w-0 flex-1 !mb-0" title={`${label}: ${name}`} onClick={onSelect}
        onDragOver={event => { if (event.dataTransfer.types.includes('application/x-imagestudio')) event.preventDefault() }} onDrop={onDrop}>
        {icon}<span className="truncate flex-1">{name}</span>
        {active && <span className="w-1.5 h-1.5 shrink-0 bg-accent-main rounded-full" />}
      </button>
      <button ref={trigger} className="shrink-0 rounded-lg p-2 text-text-muted hover:bg-surface-3 hover:text-red-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-main"
        aria-label={`${label} ${name} löschen`} title={`${label} löschen`} aria-expanded={confirming}
        onClick={() => { setError(''); setConfirming(true) }}><Trash2 size={14} /></button>
    </div>
    {confirming && <section role="alertdialog" aria-label={`${label} löschen bestätigen`} aria-describedby={`delete-organization-${id}`}
      className="mx-1 mb-2 mt-1 rounded-lg border border-border-base bg-surface-0 p-3"
      onKeyDown={event => { if (event.key === 'Escape' && !busy) { event.stopPropagation(); cancel() } }}>
      <p className="break-words text-sm font-medium">„{name}“ löschen?</p>
      <p id={`delete-organization-${id}`} className="mt-2 text-xs leading-relaxed text-text-muted">{kind === 'workspace'
        ? 'Alle Bilder und Videos bleiben unter „Alle Medien“ erhalten. Projektzuordnungen bleiben bestehen.'
        : 'Alle Thumbnails bleiben unter „Alle Thumbnails“ erhalten. Ordnerzuordnungen bleiben bestehen.'}</p>
      {error && <p role="alert" className="mt-2 text-xs text-red-300">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button autoFocus disabled={busy} onClick={cancel} className="rounded-md border border-border-base px-2 py-1.5 text-xs hover:bg-surface-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-main disabled:opacity-40">Abbrechen</button>
        <button disabled={busy} onClick={remove} className="rounded-md border border-red-400/40 px-2 py-1.5 text-xs text-red-300 hover:bg-red-400/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-main disabled:opacity-40">{busy ? 'Löscht …' : 'Löschen'}</button>
      </div>
    </section>}
  </div>
}
