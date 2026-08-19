import { ListOrdered } from 'lucide-react'
import { useQueueStore } from '../../stores/queue-store'
import { cn } from '../../lib/utils'

interface QueueButtonProps {
  onClick: () => void
}

export function QueueButton({ onClick }: QueueButtonProps) {
  const pendingCount = useQueueStore((s) => s.items.filter((i) => i.status === 'pending' || i.status === 'active').length)

  return (
    <button
      onClick={onClick}
      className={cn(
        'no-drag relative shrink-0 flex items-center justify-center w-8 h-8 rounded-lg border transition-all',
        pendingCount > 0
          ? 'bg-accent-dim border-accent-main/30 text-accent-main'
          : 'bg-surface-3 border-border-base text-text-secondary hover:text-text-primary hover:bg-surface-4'
      )}
      title="Generation queue"
    >
      <ListOrdered className="w-3.5 h-3.5" />
      {pendingCount > 0 && (
        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-accent-main text-white text-[9px] flex items-center justify-center font-bold">
          {pendingCount}
        </span>
      )}
    </button>
  )
}
