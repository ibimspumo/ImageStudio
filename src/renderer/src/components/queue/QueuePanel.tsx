import { X, Pause, Play, Trash2, CheckCircle2, AlertCircle, Clock, Loader2 } from 'lucide-react'
import { useQueueStore, type QueueItem } from '../../stores/queue-store'
import { cn } from '../../lib/utils'
import { getModelName } from '../../types/api'

interface QueuePanelProps {
  onClose: () => void
}

function QueueItemCard({ item }: { item: QueueItem }) {
  const { cancelItem, removeFromQueue } = useQueueStore()

  const progress = item.totalCount > 0 ? (item.completedCount / item.totalCount) * 100 : 0

  return (
    <div className="p-3 rounded-xl bg-surface-2 border border-border-dim">
      <div className="flex items-start gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-[12px] text-text-primary truncate">{item.prompt.slice(0, 60)}</p>
          <div className="flex items-center gap-1.5 mt-1">
            {item.models.map((m) => (
              <span key={m} className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-surface-3 text-text-muted">
                {getModelName(m)}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {item.status === 'pending' && (
            <button onClick={() => cancelItem(item.id)} className="p-1 rounded text-text-muted hover:text-danger transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          {(item.status === 'completed' || item.status === 'failed' || item.status === 'cancelled') && (
            <button onClick={() => removeFromQueue(item.id)} className="p-1 rounded text-text-muted hover:text-text-secondary transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-300',
            item.status === 'completed' ? 'bg-success' :
            item.status === 'failed' ? 'bg-danger' :
            item.status === 'cancelled' ? 'bg-text-muted' :
            'bg-accent-main'
          )}
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex items-center justify-between mt-1.5">
        <span className="text-[10px] text-text-muted">{item.completedCount} / {item.totalCount}</span>
        <div className="flex items-center gap-1">
          {item.status === 'pending' && <Clock className="w-3 h-3 text-text-muted" />}
          {item.status === 'active' && <Loader2 className="w-3 h-3 text-accent-main animate-spin" />}
          {item.status === 'completed' && <CheckCircle2 className="w-3 h-3 text-success" />}
          {item.status === 'failed' && <AlertCircle className="w-3 h-3 text-danger" />}
          <span className={cn(
            'text-[10px] font-medium',
            item.status === 'completed' ? 'text-success' :
            item.status === 'failed' ? 'text-danger' :
            item.status === 'active' ? 'text-accent-main' :
            'text-text-muted'
          )}>
            {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
          </span>
        </div>
      </div>
      {item.error && <p className="text-[10px] text-danger mt-1">{item.error}</p>}
    </div>
  )
}

export function QueuePanel({ onClose }: QueuePanelProps) {
  const { items, isProcessing, startProcessing, pauseProcessing, clearCompleted } = useQueueStore()

  const pendingCount = items.filter((i) => i.status === 'pending' || i.status === 'active').length
  const completedCount = items.filter((i) => i.status === 'completed' || i.status === 'failed' || i.status === 'cancelled').length

  return (
    <div className="absolute right-0 top-0 bottom-0 w-[340px] z-40 bg-surface-1 border-l border-border-dim shadow-[0_0_40px_rgba(0,0,0,0.4)] flex flex-col animate-scale-in" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-dim">
        <h3 className="text-[14px] font-semibold text-text-primary">Queue</h3>
        <div className="flex items-center gap-1">
          {pendingCount > 0 && (
            <button
              onClick={isProcessing ? pauseProcessing : startProcessing}
              className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-3 transition-colors"
              title={isProcessing ? 'Pause' : 'Resume'}
            >
              {isProcessing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
          )}
          <button onClick={onClose} className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-3 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-text-muted">
            <Clock className="w-8 h-8 mb-3 opacity-40" />
            <p className="text-[13px]">Queue is empty</p>
            <p className="text-[11px] mt-1 opacity-60">Use "Add to Queue" when generating</p>
          </div>
        ) : (
          items.map((item) => <QueueItemCard key={item.id} item={item} />)
        )}
      </div>

      {completedCount > 0 && (
        <div className="shrink-0 px-4 py-3 border-t border-border-dim">
          <button
            onClick={clearCompleted}
            className="w-full py-2 rounded-lg bg-surface-2 border border-border-dim text-text-muted hover:text-text-secondary hover:border-border-base transition-all text-[12px] font-medium"
          >
            Clear completed ({completedCount})
          </button>
        </div>
      )}
    </div>
  )
}
