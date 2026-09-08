import { useState } from 'react'
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
      {open && <form onSubmit={submit} className="absolute right-0 top-full mt-2 z-40 w-[min(360px,80vw)] rounded-xl border border-border-base bg-surface-1 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="media-import-source" className="text-[13px] font-medium text-text-primary">Import image or video</label>
          <button type="button" aria-label="Close import" onClick={() => setOpen(false)} className="text-text-secondary hover:text-text-primary"><X className="w-4 h-4" /></button>
        </div>
        <input id="media-import-source" autoFocus value={source} onChange={event => setSource(event.target.value)}
          placeholder="Paste a media URL or local file path"
          className="w-full bg-surface-2 border border-border-base rounded-lg px-3 py-2 text-[12px] text-text-primary placeholder:text-text-secondary select-text focus:outline-accent-main" />
        <p className="text-[12px] text-text-secondary leading-relaxed">Use a direct media link or an absolute file path. The original is copied into your library and can be used in the app or by connected AI tools.</p>
        {error && <p role="alert" className="text-[12px] text-danger break-words">{error}</p>}
        <button type="submit" disabled={busy || !source.trim()}
          className="w-full rounded-lg bg-accent-main text-surface-0 hover:bg-accent-bright px-3 py-2 text-[12px] font-medium disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-accent-main">
          {busy ? 'Importing…' : 'Add to library'}
        </button>
      </form>}
    </div>
  )
}
