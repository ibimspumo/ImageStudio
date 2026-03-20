import { Sparkles } from 'lucide-react'

export function TitleBar() {
  return (
    <div className="drag-region shrink-0 h-12 flex items-center justify-center px-5 bg-surface-0 relative z-[100] border-b border-border-dim/40">
      <div className="flex items-center gap-2 opacity-60 hover:opacity-80 transition-opacity">
        <Sparkles className="w-3.5 h-3.5 text-accent-main" />
        <span className="text-[12px] font-medium text-text-secondary tracking-[0.08em] uppercase">ImageStudio</span>
      </div>
    </div>
  )
}
