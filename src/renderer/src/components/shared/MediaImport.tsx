import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Import, X } from 'lucide-react'
import { importMediaToGallery } from '../../lib/media-actions'

export function MediaImport({ onImported }: { onImported: (kind: 'image' | 'video') => void }) {
  const [open, setOpen] = useState(false)
  const [source, setSource] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const media = await importMediaToGallery({ source })
      onImported(media.type ?? 'image')
      setSource('')
      setOpen(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally { setBusy(false) }
  }

  return (
    <div className="relative ml-auto no-drag">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] text-text-secondary hover:text-text-primary hover:bg-surface-3 focus-visible:outline-accent-main">
        <Import className="w-3.5 h-3.5" /> Import
      </button>
      {open && createPortal(<div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-5" onClick={() => !busy && setOpen(false)}><form role="dialog" aria-modal="true" aria-label="Medien importieren" onClick={event => event.stopPropagation()} onSubmit={submit} className="w-full max-w-lg rounded-xl border border-border-base bg-surface-1 p-6 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="media-import-source" className="text-[13px] font-medium text-text-primary">Bild oder Video importieren</label>
          <button type="button" aria-label="Import schließen" onClick={() => setOpen(false)} className="text-text-secondary hover:text-text-primary"><X className="w-4 h-4" /></button>
        </div>
        <input id="media-import-source" autoFocus value={source} onChange={event => setSource(event.target.value)}
          placeholder="Medien-URL oder lokalen Dateipfad einfügen"
          className="w-full bg-surface-2 border border-border-base rounded-lg px-3 py-2 text-[12px] text-text-primary placeholder:text-text-secondary select-text focus:outline-accent-main" />
        <p className="text-[12px] text-text-secondary leading-relaxed">Verwende einen direkten Medienlink oder einen absoluten Dateipfad. Das Original wird in deine Mediathek kopiert und ist auch für verbundene KI-Werkzeuge verfügbar.</p>
        {error && <p role="alert" className="text-[12px] text-danger break-words">{error}</p>}
        <button type="submit" disabled={busy || !source.trim()}
          className="w-full rounded-lg bg-accent-main text-surface-0 hover:bg-accent-bright px-3 py-2 text-[12px] font-medium disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-accent-main">
          {busy ? 'Importiert…' : 'Zur Mediathek hinzufügen'}
        </button>
      </form></div>, document.body)}
    </div>
  )
}
