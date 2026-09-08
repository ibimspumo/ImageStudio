import { PromptText } from '../shared/PromptText'
import { useEffect, useState } from 'react'
import { useGalleryStore, toDisplayUrl } from '../../stores/gallery-store'
import { X, Pause, Play, Trash2, CheckCircle2, AlertCircle, Clock, Loader2 } from 'lucide-react'
import { useQueueStore, type QueueItem } from '../../stores/queue-store'
import { cn } from '../../lib/utils'
import { refreshGalleryBilling, useBillingSyncStore } from '../../lib/billing-sync'
import { getGalleryCosts } from '../../lib/gallery-costs'
import { getModelName } from '../../types/api'

interface QueuePanelProps {
  onClose: () => void
  embedded?: boolean
  onOpenImage?: (id: string) => void
}

function QueueItemCard({ item }: { item: QueueItem }) {
  const { cancelItem, removeFromQueue } = useQueueStore()

  const progress = item.totalCount > 0 ? (item.completedCount / item.totalCount) * 100 : 0

  return (
    <div className="p-3 rounded-xl bg-surface-2 border border-border-dim">
      <div className="flex items-start gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-[12px] text-text-primary truncate"><PromptText text={item.prompt} compact/></p>
          <div className="flex items-center gap-1.5 mt-1">
            {item.models.map((m) => (
              <span key={m} className="px-1.5 py-0.5 rounded text-[12px] font-medium bg-surface-3 text-text-muted">
                {getModelName(m)}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {item.status === 'pending' && (
            <button aria-label="Wartenden Auftrag abbrechen" onClick={() => cancelItem(item.id)} className="p-1 rounded text-text-muted hover:text-danger transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          {(item.status === 'completed' || item.status === 'failed' || item.status === 'cancelled') && (
            <button aria-label="Auftrag aus Verlauf entfernen" onClick={() => removeFromQueue(item.id)} className="p-1 rounded text-text-muted hover:text-text-secondary transition-colors">
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
        <span className="text-[12px] text-text-muted">{item.completedCount} / {item.totalCount}</span>
        <div className="flex items-center gap-1">
          {item.status === 'pending' && <Clock className="w-3 h-3 text-text-muted" />}
          {item.status === 'active' && <Loader2 className="w-3 h-3 text-accent-main animate-spin" />}
          {item.status === 'completed' && <CheckCircle2 className="w-3 h-3 text-success" />}
          {item.status === 'failed' && <AlertCircle className="w-3 h-3 text-danger" />}
          <span className={cn(
            'text-[12px] font-medium',
            item.status === 'completed' ? 'text-success' :
            item.status === 'failed' ? 'text-danger' :
            item.status === 'active' ? 'text-accent-main' :
            'text-text-muted'
          )}>
            {{ pending: 'Wartet', active: 'Läuft', completed: 'Abgeschlossen', failed: 'Fehlgeschlagen', cancelled: 'Abgebrochen' }[item.status]}
          </span>
        </div>
      </div>
      {item.error && <p className="text-[12px] text-danger mt-1">{item.error}</p>}
    </div>
  )
}

export function QueuePanel({ onClose, embedded = false, onOpenImage }: QueuePanelProps) {
  const { items, isProcessing, startProcessing, pauseProcessing, clearCompleted } = useQueueStore()

  const images = useGalleryStore(state => state.images)
  const jobs = images.filter(image => image.requestId || image.isLoading || image.error || image.cost !== undefined || image.durationMs !== undefined).slice().sort((a, b) => b.timestamp - a.timestamp)
  const [now, setNow] = useState(Date.now())
  useEffect(() => { if (!jobs.some(job => job.isLoading)) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [jobs.some(job => job.isLoading)])

  const billing = useBillingSyncStore()
  const costs = getGalleryCosts(images, now)
  const pendingCount = items.filter((i) => i.status === 'pending' || i.status === 'active').length
  const completedCount = items.filter((i) => i.status === 'completed' || i.status === 'failed' || i.status === 'cancelled').length

  return (
    <div className={embedded ? "h-full min-h-0 flex flex-col" : "absolute right-0 top-0 bottom-0 w-[440px] max-w-full z-40 bg-surface-1 border-l border-border-dim flex flex-col animate-scale-in"} onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between px-7 py-5 border-b border-border-dim">
        <h3 className="text-2xl font-semibold text-text-primary">Aktivität</h3>
        <div className="flex items-center gap-1">
          {pendingCount > 0 && (
            <button
              onClick={isProcessing ? pauseProcessing : startProcessing}
              className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-3 transition-colors"
              title={isProcessing ? 'Warteschlange nach aktuellem Auftrag pausieren' : 'Warteschlange fortsetzen'}
            >
              {isProcessing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
          )}
          <button hidden={embedded} aria-label="Aktivität schließen" onClick={onClose} className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-3 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-7 space-y-2">
        <div className="pb-6 mb-4 border-b border-border-dim">
          <div className="flex flex-wrap gap-x-8 gap-y-3 text-[14px] text-text-primary"><p>Heute <strong className="font-semibold tabular-nums ml-2">{costs.todaySpendUsd.toFixed(3)} USD</strong></p><p>Gesamt <strong className="font-semibold tabular-nums ml-2">{costs.gallerySpendUsd.toFixed(3)} USD</strong></p></div>
          <p className="mt-2 text-[12px] leading-relaxed text-text-secondary">{costs.confirmedSpendUsd.toFixed(3)} USD von fal.ai bestätigt · {costs.estimatedSpendUsd.toFixed(3)} USD noch geschätzt. Kosten der gespeicherten Medien. Gelöschte Medien zählen nicht mit; dies ist kein Kontostand.{costs.missingCostCount > 0 && ` Für ${costs.missingCostCount} Medien fehlt eine Kostenangabe.`}</p>
        </div>
        <div className="pb-5 flex flex-wrap items-center gap-3"><button disabled={billing.running} onClick={() => void refreshGalleryBilling()} className="px-3 py-2 rounded-lg bg-surface-3 text-text-primary text-[12px] disabled:opacity-50">{billing.running ? 'Kosten werden abgeglichen…' : 'Kosten mit fal.ai abgleichen'}</button><p role="status" className="text-[12px] text-text-secondary">{billing.message}</p></div>
        <h4 className="text-[14px] font-semibold text-text-primary">Generierungen</h4>
        <p className="text-[13px] text-text-secondary pb-4">Live-Status aller Aufträge aus dem Studio und der KI-Verbindung.</p>
        {jobs.length === 0 && <p className="py-6 text-[13px] text-text-secondary">Noch keine Generierungen. Erstelle dein erstes Bild oder Video im Studio.</p>}
        {jobs.map(job => <article key={job.id} className="flex items-start gap-4 py-4 border-b border-border-dim">
          <div className="w-16 h-16 shrink-0 rounded-lg bg-surface-3 overflow-hidden flex items-center justify-center">{job.filePath ? <img src={toDisplayUrl(job.videoThumbnailPath || job.previewPath || job.filePath)} alt="" className="w-full h-full object-cover" /> : job.isLoading ? <Loader2 className="w-5 h-5 text-accent-main animate-spin" /> : <AlertCircle className="w-5 h-5 text-danger" />}</div>
          <div className="min-w-0 flex-1"><p className="text-[14px] text-text-primary line-clamp-2"><PromptText text={job.prompt || 'Generierung'}/></p><p className="text-[12px] text-text-secondary mt-1">{getModelName(job.model)} · {job.type === 'video' ? 'Video' : 'Bild'} · {new Date(job.timestamp).toLocaleString('de-DE')}</p><p className={cn('text-[12px] mt-2', job.error ? 'text-danger' : job.isLoading ? 'text-accent-main' : 'text-text-secondary')}>{job.cancelled ? 'Abgebrochen' : job.error || (job.isLoading ? job.statusText || 'Wird erstellt…' : 'Abgeschlossen')}{job.durationMs !== undefined || job.isLoading || job.completedAt ? ` · ${Math.max(0, Math.round((job.durationMs ?? ((job.completedAt || now) - job.timestamp)) / 1000))} s` : ''}{job.cost != null && ` · ${job.cost.toFixed(3)} USD (${job.costSource === 'provider-reported' ? 'Anbieterangabe' : 'Listenpreis-Schätzung'})`}</p>{job.isLoading && job.progressPercent != null && <p className="mt-1 text-[12px] text-text-secondary">Fortschrittsschätzung: {job.progressPercent} %</p>}</div>
          {onOpenImage && job.filePath && !job.isLoading && !job.error && <button onClick={() => onOpenImage(job.id)} className="shrink-0 self-center text-[12px] text-accent-main hover:bg-surface-3 rounded-lg px-3 py-2">Öffnen</button>}
        </article>)}
        <h4 className="pt-8 text-[14px] font-semibold text-text-primary">Warteschlange</h4>
        <p className="text-[13px] text-text-secondary pb-3">Aufträge werden nacheinander gestartet. Pausieren hält den nächsten Start an; laufende Generierungen laufen weiter.</p>
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-text-muted">
            <Clock className="w-8 h-8 mb-3 opacity-40" />
            <p className="text-[13px]">Die Warteschlange ist leer</p>
            <p className="text-[12px] mt-1 opacity-60">Füge Aufträge beim Erstellen zur Warteschlange hinzu.</p>
          </div>
        ) : (
          items.map((item) => <QueueItemCard key={item.id} item={item} />)
        )}
      </div>

      {completedCount > 0 && (
        <div className="shrink-0 px-7 py-5 border-t border-border-dim">
          <button
            onClick={clearCompleted}
            className="w-full py-2 rounded-lg bg-surface-2 border border-border-dim text-text-muted hover:text-text-secondary hover:border-border-base transition-all text-[12px] font-medium"
          >
            Abgeschlossene Einträge entfernen ({completedCount})
          </button>
        </div>
      )}
    </div>
  )
}
