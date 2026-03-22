import { useState } from 'react'
import { X, Plus, Pencil, Trash2, Lock, ArrowLeft } from 'lucide-react'
import { usePresetsStore, type StylePreset } from '../../stores/presets-store'
import { cn } from '../../lib/utils'

interface PresetsDialogProps {
  onClose: () => void
}

type View = 'list' | 'create' | 'edit'

export function PresetsDialog({ onClose }: PresetsDialogProps) {
  const { presets, addPreset, updatePreset, removePreset } = usePresetsStore()
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
    <div className="absolute inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center animate-overlay-in" onClick={onClose}>
      <div className="bg-surface-1 border border-border-base rounded-2xl shadow-[0_24px_80px_rgba(0,0,0,0.6)] w-full max-w-lg max-h-[80vh] flex flex-col animate-scale-in" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-dim">
          <div className="flex items-center gap-2">
            {view !== 'list' && (
              <button onClick={() => { setView('list'); setEditingId(null) }} className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-3 transition-colors">
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <h2 className="text-[15px] font-semibold text-text-primary">
              {view === 'list' ? 'Style Presets' : view === 'create' ? 'New Preset' : 'Edit Preset'}
            </h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-3 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {view === 'list' && (
            <div className="space-y-2">
              {presets.map((preset) => (
                <div key={preset.id} className="flex items-center gap-3 p-3 rounded-xl bg-surface-2 border border-border-dim group hover:border-border-base transition-colors">
                  <span className="text-[16px] w-6 text-center">{preset.icon || '✦'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-text-primary">{preset.name}</span>
                      {preset.isBuiltIn && <Lock className="w-3 h-3 text-text-muted" />}
                    </div>
                    <p className="text-[11px] text-text-muted truncate">{preset.suffix}</p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => startEdit(preset)} className="p-1.5 rounded-lg hover:bg-surface-3 text-text-muted hover:text-text-primary transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    {!preset.isBuiltIn && (
                      <button onClick={() => removePreset(preset.id)} className="p-1.5 rounded-lg hover:bg-surface-3 text-text-muted hover:text-danger transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}

              <button
                onClick={() => setView('create')}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-border-dim text-text-muted hover:text-text-secondary hover:border-border-base transition-all text-[13px] font-medium"
              >
                <Plus className="w-4 h-4" />
                New Custom Preset
              </button>
            </div>
          )}

          {(view === 'create' || view === 'edit') && (
            <div className="space-y-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-medium uppercase tracking-wider text-text-muted">Icon (emoji)</label>
                <input
                  value={icon}
                  onChange={(e) => setIcon(e.target.value)}
                  placeholder="🎬"
                  className="w-16 h-10 text-center text-[18px] rounded-lg bg-surface-2 border border-border-base text-text-primary outline-none focus:border-accent-main/40 transition-colors"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-medium uppercase tracking-wider text-text-muted">Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Style"
                  className="h-10 px-3 rounded-lg bg-surface-2 border border-border-base text-[13px] text-text-primary outline-none focus:border-accent-main/40 transition-colors placeholder:text-text-muted"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-medium uppercase tracking-wider text-text-muted">Suffix (appended to prompt)</label>
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
                    ? 'bg-accent-main text-white hover:bg-accent-bright'
                    : 'bg-surface-3 text-text-muted cursor-not-allowed'
                )}
              >
                {view === 'create' ? 'Create Preset' : 'Save Changes'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
