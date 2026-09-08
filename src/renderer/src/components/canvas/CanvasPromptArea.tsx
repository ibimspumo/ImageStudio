import { useCanvasStore } from '../../stores/canvas-store'
import { PromptBar } from '../input/PromptBar'
import { cn } from '../../lib/utils'

interface CanvasPromptAreaProps {
  canvasContext: {
    getCanvasBase64: () => string | null
    onClose: () => void
  }
}

export function CanvasPromptArea({ canvasContext }: CanvasPromptAreaProps) {
  const mode = useCanvasStore((s) => s.mode)
  const setMode = useCanvasStore((s) => s.setMode)

  return (
    <div className="shrink-0 border-t border-border-dim">
      {/* Mode toggle */}
      <div className="flex items-center justify-center gap-1 pt-3 pb-1">
        <ModeButton
          label="Skizze als Referenz"
          active={mode === 'simple'}
          onClick={() => setMode('simple')}
        />
        <ModeButton
          label="Farbbereiche beschreiben"
          active={mode === 'expert'}
          onClick={() => setMode('expert')}
        />
      </div>

      {/* Simple mode: show PromptBar. Expert mode: PromptBar hidden, sidebar handles it */}
      {mode === 'simple' && (
        <PromptBar canvasContext={canvasContext} />
      )}

      {mode === 'expert' && (
        <div className="flex items-center justify-center py-3">
          <p className="text-[12px] text-text-secondary">Beschreibe rechts die Farbbereiche und erstelle daraus ein Bild.</p>
        </div>
      )}
    </div>
  )
}

function ModeButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-4 py-1.5 rounded-full text-[12px] font-semibold tracking-wide transition-all',
        active
          ? 'bg-accent-dim text-accent-main'
          : 'text-text-muted hover:text-text-secondary hover:bg-surface-3'
      )}
    >
      {label}
    </button>
  )
}
