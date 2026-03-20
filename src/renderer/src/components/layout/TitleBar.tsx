import { Sparkles } from 'lucide-react'

interface TitleBarProps {
  onSettingsClick: () => void
}

export function TitleBar({ onSettingsClick }: TitleBarProps) {
  return (
    <div className="drag-region h-12 flex items-center justify-center border-b border-border-primary bg-bg-secondary/50 backdrop-blur-xl shrink-0">
      {/* Spacer for traffic lights */}
      <div className="w-[78px]" />
      <div className="flex-1 flex items-center justify-center gap-2">
        <Sparkles className="w-4 h-4 text-accent" />
        <span className="text-sm font-medium text-text-primary tracking-wide">
          ImageStudio
        </span>
      </div>
      <div className="w-[78px]" />
    </div>
  )
}
