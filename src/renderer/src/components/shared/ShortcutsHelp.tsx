import { X } from 'lucide-react'

interface ShortcutsHelpProps {
  onClose: () => void
}

const SHORTCUTS = [
  { keys: ['G'], description: 'Focus prompt bar' },
  { keys: ['⌘', 'F'], description: 'Focus search' },
  { keys: ['S'], description: 'Toggle favorites filter' },
  { keys: ['?'], description: 'Show this help' },
  { keys: ['⌘', '↵'], description: 'Generate image' },
  { keys: ['Esc'], description: 'Close modal / dialog' },
  { keys: ['←', '→'], description: 'Navigate images in lightbox' },
  { keys: ['F'], description: 'Toggle favorite (in lightbox)' },
  { keys: ['R'], description: 'Reuse prompt (in lightbox)' },
  { keys: ['E'], description: 'Export image (in lightbox)' },
  { keys: ['Delete'], description: 'Delete image (in lightbox)' },
]

export function ShortcutsHelp({ onClose }: ShortcutsHelpProps) {
  return (
    <div className="absolute inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center animate-overlay-in" onClick={onClose}>
      <div className="bg-surface-2 border border-border-base rounded-2xl shadow-[0_24px_80px_rgba(0,0,0,0.6)] w-full max-w-md animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-dim">
          <h2 className="text-[15px] font-semibold text-text-primary">Keyboard Shortcuts</h2>
          <button onClick={onClose} className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-3 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-2">
          {SHORTCUTS.map((s, i) => (
            <div key={i} className="flex items-center justify-between py-1.5">
              <span className="text-[13px] text-text-secondary">{s.description}</span>
              <div className="flex items-center gap-1">
                {s.keys.map((k, j) => (
                  <kbd key={j} className="inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 rounded-md bg-surface-3 text-text-muted border border-border-dim text-[11px] font-medium">
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
