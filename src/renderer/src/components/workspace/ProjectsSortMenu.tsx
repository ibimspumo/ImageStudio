import { useEffect, useRef, useState } from 'react'
import { ArrowDownWideNarrow, Check, ChevronDown } from 'lucide-react'
import type { ProjectsSort } from '../../../../shared/organization'

const options: { value: ProjectsSort; label: string; description: string }[] = [
  { value: 'created-desc', label: 'Neueste zuerst', description: 'Nach Erstellungsdatum' },
  { value: 'created-asc', label: 'Älteste zuerst', description: 'Nach Erstellungsdatum' },
  { value: 'updated-desc', label: 'Neueste Medien', description: 'Nach Datum des neuesten Mediums' },
  { value: 'name-asc', label: 'Name A–Z', description: 'Alphabetisch sortieren' },
]

export function ProjectsSortMenu({ value, onChange }: { value: ProjectsSort; onChange: (value: ProjectsSort) => void }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    menu.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus()
    const dismiss = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [open])
  return <div ref={root} className="relative" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false) }}>
    <button ref={trigger} aria-label={`Sortieren: ${options.find(option => option.value === value)?.label}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true) } }} className="inline-flex items-center gap-2 rounded-xl border border-border-base bg-surface-1 px-3 py-2.5 text-sm text-text-primary hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-main">
      <ArrowDownWideNarrow size={16} className="text-text-muted" />{options.find(option => option.value === value)?.label}<ChevronDown size={14} className="ml-2 text-text-muted" />
    </button>
    {open && <div ref={menu} role="menu" aria-label="Sortierung" className="absolute left-0 top-full z-30 mt-2 w-72 max-w-[calc(100vw-3rem)] rounded-xl border border-border-base bg-surface-2 p-1.5 shadow-xl" onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus() }
      const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')]
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault()
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
        buttons[next]?.focus()
      }
    }}>
      {options.map(option => <button key={option.value} role="menuitemradio" aria-checked={value === option.value} onClick={() => { onChange(option.value); setOpen(false); trigger.current?.focus() }} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left outline-none hover:bg-surface-hover focus-visible:bg-surface-hover ${value === option.value ? 'bg-accent-dim text-accent-main' : 'text-text-primary'}`}>
        <span className="flex-1"><span className="block text-sm font-medium">{option.label}</span><span className="mt-0.5 block text-xs text-text-muted">{option.description}</span></span>{value === option.value && <Check size={16} />}
      </button>)}
    </div>}
  </div>
}
