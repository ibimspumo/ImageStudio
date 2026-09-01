import { useState } from 'react'
import { BookmarkPlus, Check, FileText, Pencil, Plus, Trash2 } from 'lucide-react'
import { useThumbnailMetaPromptsStore } from '../../stores/thumbnail-meta-prompts-store'
import { cn } from '../../lib/utils'

/**
 * Saved meta prompts for thumbnail mode — e.g. one per channel format. The
 * active one is appended below the system prompt, above the user's prompt.
 * Create, edit and delete live inside the popup; there is no separate dialog.
 */
export function MetaPromptSelector() {
  const [open, setOpen] = useState(false)
  /** null = list view, 'new' = create form, otherwise the id being edited. */
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [draftName, setDraftName] = useState('')
  const [draftText, setDraftText] = useState('')

  const prompts = useThumbnailMetaPromptsStore((s) => s.prompts)
  const activeId = useThumbnailMetaPromptsStore((s) => s.activeId)
  const setActive = useThumbnailMetaPromptsStore((s) => s.setActive)
  const addPrompt = useThumbnailMetaPromptsStore((s) => s.addPrompt)
  const updatePrompt = useThumbnailMetaPromptsStore((s) => s.updatePrompt)
  const removePrompt = useThumbnailMetaPromptsStore((s) => s.removePrompt)

  const active = activeId ? prompts.find((p) => p.id === activeId) : undefined

  const close = () => {
    setOpen(false)
    setEditing(null)
  }

  const startEdit = (id: string | 'new') => {
    if (id === 'new') {
      setDraftName('')
      setDraftText('')
    } else {
      const prompt = prompts.find((p) => p.id === id)
      setDraftName(prompt?.name ?? '')
      setDraftText(prompt?.text ?? '')
    }
    setEditing(id)
  }

  const saveDraft = () => {
    const name = draftName.trim()
    const text = draftText.trim()
    if (!name || !text) return
    if (editing === 'new') addPrompt(name, text)
    else if (editing) updatePrompt(editing, { name, text })
    setEditing(null)
  }

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => (open ? close() : setOpen(true))}
        className={cn(
          'no-drag flex items-center gap-1.5 h-8 px-3 rounded-lg border transition-all text-[12px] font-medium max-w-[180px]',
          active
            ? 'border-accent-main/30 bg-accent-dim text-accent-main'
            : 'bg-surface-3 hover:bg-surface-4 border-border-base text-text-secondary hover:text-text-primary'
        )}
        title={active ? `Meta-Prompt: ${active.name}` : 'Gespeicherten Meta-Prompt anhängen'}
      >
        <FileText className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate">{active ? active.name : 'Meta-Prompt'}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={close} />
          <div className="absolute bottom-full left-0 mb-2 bg-surface-3 border border-border-base rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.5)] p-2 z-30 animate-scale-in w-[320px]">
            {editing !== null ? (
              <div className="flex flex-col gap-2 p-1">
                <div className="px-1 text-[10px] font-medium uppercase tracking-wider text-text-muted">
                  {editing === 'new' ? 'Neuer Meta-Prompt' : 'Meta-Prompt bearbeiten'}
                </div>
                <input
                  autoFocus
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder="Name (z. B. „YouTube Hauptkanal“)"
                  className="no-drag w-full h-8 px-2.5 rounded-lg bg-surface-2 border border-border-base text-[12px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-main/50"
                />
                <textarea
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                  placeholder="Die Regeln für dieses Format — sie landen unterhalb des System-Prompts, über deinem Prompt…"
                  rows={7}
                  className="no-drag w-full px-2.5 py-2 rounded-lg bg-surface-2 border border-border-base text-[12px] leading-relaxed text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-main/50 resize-y"
                />
                <div className="flex items-center justify-end gap-1.5">
                  <button
                    onClick={() => setEditing(null)}
                    className="no-drag h-7 px-2.5 rounded-lg text-[11px] font-medium text-text-secondary hover:text-text-primary hover:bg-surface-4 transition-all"
                  >
                    Abbrechen
                  </button>
                  <button
                    onClick={saveDraft}
                    disabled={!draftName.trim() || !draftText.trim()}
                    className={cn(
                      'no-drag flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[11px] font-semibold transition-all',
                      draftName.trim() && draftText.trim()
                        ? 'bg-accent-main hover:bg-accent-bright text-white'
                        : 'bg-surface-4 text-text-muted cursor-not-allowed'
                    )}
                  >
                    <BookmarkPlus className="w-3 h-3" />
                    Speichern
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="px-2 pb-1.5 text-[10px] font-medium uppercase tracking-wider text-text-muted">
                  Meta-Prompt
                </div>

                <button
                  onClick={() => {
                    setActive(null)
                    close()
                  }}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all',
                    !activeId
                      ? 'bg-accent-dim text-accent-main'
                      : 'text-text-secondary hover:bg-surface-4 hover:text-text-primary'
                  )}
                >
                  <div
                    className={cn(
                      'w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors',
                      !activeId ? 'border-accent-main bg-accent-main/20' : 'border-text-muted/40'
                    )}
                  >
                    {!activeId && <Check className="w-2.5 h-2.5" />}
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-[12px] font-medium">Keiner</span>
                    <span className="text-[10px] text-text-muted">Nur System-Prompt und dein Prompt</span>
                  </div>
                </button>

                {prompts.length > 0 && <div className="h-px bg-border-dim/60 my-1 mx-2" />}

                <div className="max-h-[240px] overflow-y-auto">
                  {prompts.map((prompt) => {
                    const isSelected = prompt.id === activeId
                    return (
                      <div key={prompt.id} className="group flex items-center gap-1">
                        <button
                          onClick={() => {
                            setActive(prompt.id)
                            close()
                          }}
                          className={cn(
                            'flex-1 min-w-0 flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all',
                            isSelected
                              ? 'bg-accent-dim text-accent-main'
                              : 'text-text-secondary hover:bg-surface-4 hover:text-text-primary'
                          )}
                        >
                          <div
                            className={cn(
                              'w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors',
                              isSelected ? 'border-accent-main bg-accent-main/20' : 'border-text-muted/40'
                            )}
                          >
                            {isSelected && <Check className="w-2.5 h-2.5" />}
                          </div>
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className="text-[12px] font-medium truncate">{prompt.name}</span>
                            <span className="text-[10px] text-text-muted truncate">
                              {prompt.text.replace(/\s+/g, ' ').slice(0, 60)}
                            </span>
                          </div>
                        </button>
                        <button
                          onClick={() => startEdit(prompt.id)}
                          className="no-drag shrink-0 flex items-center justify-center w-6 h-6 rounded-md text-text-muted opacity-0 group-hover:opacity-100 hover:text-text-primary hover:bg-surface-4 transition-all"
                          title="Bearbeiten"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => removePrompt(prompt.id)}
                          className="no-drag shrink-0 flex items-center justify-center w-6 h-6 rounded-md text-text-muted opacity-0 group-hover:opacity-100 hover:text-danger hover:bg-surface-4 transition-all mr-1"
                          title="Löschen"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )
                  })}
                </div>

                <div className="h-px bg-border-dim/60 my-1 mx-2" />
                <button
                  onClick={() => startEdit('new')}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-text-secondary hover:bg-surface-4 hover:text-text-primary transition-all"
                >
                  <Plus className="w-4 h-4 shrink-0" />
                  <span className="text-[12px] font-medium">Neuen Meta-Prompt speichern</span>
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
