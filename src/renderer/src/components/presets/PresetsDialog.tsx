import { useState } from 'react'
import { X, Plus, Pencil, Trash2, Lock, ArrowLeft } from 'lucide-react'
import { usePresetsStore, type StylePreset } from '../../stores/presets-store'
import { cn } from '../../lib/utils'

interface PresetsDialogProps {
  onClose: () => void
  embedded?: boolean
  onUsePreset?: (id: string) => void
}

type View = 'list' | 'create' | 'edit'

export function PresetsDialog({ onClose, embedded = false, onUsePreset }: PresetsDialogProps) {
  const { presets, addPreset, updatePreset, removePreset } = usePresetsStore()
  const [search, setSearch] = useState('')
  const [view, setView] = useState<View>('list')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [suffix, setSuffix] = useState('')
  const [icon, setIcon] = useState('')

  const handleCreate = () => {
    if (!name.trim() || !suffix.trim()) return
    addPreset(name.trim(), suffix.trim(), icon || undefined)
    setView('list')
    setName('')
    setSuffix('')
    setIcon('')
  }

  const handleUpdate = () => {
    if (!editingId || !name.trim() || !suffix.trim()) return
    updatePreset(editingId, { name: name.trim(), suffix: suffix.trim(), icon: icon || undefined })
    setView('list')
    setEditingId(null)
    setName('')
    setSuffix('')
    setIcon('')
  }

  const startEdit = (preset: StylePreset) => {
    setEditingId(preset.id)
    setName(preset.name)
    setSuffix(preset.suffix)
    setIcon(preset.icon || '')
    setView('edit')
  }

  return (
    <div className={embedded ? "h-full min-h-0 flex flex-col" : "absolute inset-0 z-50 bg-black/70 flex items-center justify-center animate-overlay-in"} onClick={embedded ? undefined : onClose}>
      <div className={embedded ? "flex flex-col h-full min-h-0" : "bg-surface-1 border border-border-base rounded-2xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col animate-scale-in"} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-7 py-5 border-b border-border-dim">
          <div className="flex items-center gap-2">
            {view !== 'list' && (
              <button onClick={() => { setView('list'); setEditingId(null) }} className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-3 transition-colors">
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <h2 className="text-2xl font-semibold text-text-primary">
              {view === 'list' ? 'Stile' : view === 'create' ? 'Neuer Stil' : 'Stil bearbeiten'}
            </h2>
          </div>
          <button hidden={embedded} aria-label="Schließen" onClick={onClose} className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-3 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {view === 'list' && <div className="px-7 pt-5 space-y-4"><p className="text-[13px] leading-relaxed text-text-secondary max-w-2xl">Speichere wiederkehrende Bildstile. Die Stilbeschreibung ergänzt deinen Prompt beim Erstellen.</p><input aria-label="Stile suchen" value={search} onChange={event => setSearch(event.target.value)} placeholder="Stile suchen…" className="w-full max-w-md bg-surface-2 border border-border-base rounded-lg px-3 py-2.5 text-[13px] text-text-primary placeholder:text-text-secondary outline-none focus:border-accent-main" /></div>}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-7">
          {view === 'list' && (
            <div className="space-y-2">
              {search && !presets.some(item => item.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())) && <p className="py-6 text-[13px] text-text-secondary">Keine Stile gefunden.</p>}
              {presets.filter(item => item.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map((preset) => (
                <div key={preset.id} className="flex items-center gap-3 p-4 rounded-xl bg-surface-2 border border-border-dim group hover:border-border-base transition-colors">
                  <span className="text-[16px] w-6 text-center">{preset.icon || '✦'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-text-primary">{preset.name}</span>
                      {preset.isBuiltIn && <Lock className="w-3 h-3 text-text-muted" />}
                    </div>
                    <p className="text-[13px] text-text-secondary line-clamp-2">{preset.suffix}</p>
                  </div>
                  <div className="flex items-center gap-1 opacity-100 transition-opacity">
                      {onUsePreset && <button onClick={() => onUsePreset(preset.id)} className="px-3 py-2 rounded-lg text-[12px] font-medium text-accent-main hover:bg-surface-4">Verwenden</button>}
                    <button aria-label={`Stil ${preset.name} bearbeiten`} onClick={() => startEdit(preset)} className="p-1.5 rounded-lg hover:bg-surface-3 text-text-muted hover:text-text-primary transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    {!preset.isBuiltIn && (
                      <button aria-label={`Stil ${preset.name} löschen`} onClick={() => removePreset(preset.id)} className="p-1.5 rounded-lg hover:bg-surface-3 text-text-muted hover:text-danger transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}

              <button
                onClick={() => { setEditingId(null); setName(''); setSuffix(''); setIcon(''); setView('create') }}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-border-dim text-text-muted hover:text-text-secondary hover:border-border-base transition-all text-[13px] font-medium"
              >
                <Plus className="w-4 h-4" />
                Eigenen Stil erstellen
              </button>
            </div>
          )}

          {(view === 'create' || view === 'edit') && (
            <div className="space-y-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-medium text-text-muted">Symbol (Emoji)</label>
                <input
                  value={icon}
                  onChange={(e) => setIcon(e.target.value)}
                  placeholder="🎬"
                  className="w-16 h-10 text-center text-[18px] rounded-lg bg-surface-2 border border-border-base text-text-primary outline-none focus:border-accent-main/40 transition-colors"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-medium text-text-muted">Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Mein Stil"
                  className="h-10 px-3 rounded-lg bg-surface-2 border border-border-base text-[13px] text-text-primary outline-none focus:border-accent-main/40 transition-colors placeholder:text-text-muted"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-medium text-text-muted">Stilbeschreibung (wird an den Prompt angehängt)</label>
                <textarea
                  value={suffix}
                  onChange={(e) => setSuffix(e.target.value)}
                  placeholder="cinematic lighting, film grain, dramatic shadows..."
                  rows={3}
                  className="px-3 py-2 rounded-lg bg-surface-2 border border-border-base text-[13px] text-text-primary outline-none focus:border-accent-main/40 transition-colors resize-none placeholder:text-text-muted"
                />
              </div>

              <button
                onClick={view === 'create' ? handleCreate : handleUpdate}
                disabled={!name.trim() || !suffix.trim()}
                className={cn(
                  'w-full py-2.5 rounded-xl text-[13px] font-medium transition-all',
                  name.trim() && suffix.trim()
                    ? 'bg-accent-main text-surface-0 hover:bg-accent-bright'
                    : 'bg-surface-3 text-text-muted cursor-not-allowed'
                )}
              >
                {view === 'create' ? 'Stil erstellen' : 'Änderungen speichern'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
