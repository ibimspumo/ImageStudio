import { useEffect, useState } from 'react'
import { Download, RefreshCw, Check, AlertCircle, RotateCw, ExternalLink, FolderOpen } from 'lucide-react'
import type { UpdateStatus } from '../../../../preload/index.d'
import { cn } from '../../lib/utils'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Update panel: check GitHub Releases, download with progress, install on restart. */
export function UpdateSection() {
  const [status, setStatus] = useState<UpdateStatus | null>(null)

  useEffect(() => {
    window.api.getUpdateStatus().then(setStatus).catch(() => { /* first render can run before main is ready */ })
    return window.api.onUpdateStatus(setStatus)
  }, [])

  const state = status?.state ?? 'idle'
  const busy = state === 'checking' || state === 'downloading'

  const handleCheck = async () => {
    setStatus(await window.api.checkForUpdates())
  }

  const handleDownload = async () => {
    setStatus(await window.api.downloadUpdate())
  }

  const handleInstall = async () => {
    const result = await window.api.installUpdate()
    if (!result.success && result.error) {
      setStatus((prev) => (prev ? { ...prev, state: 'error', error: result.error } : prev))
    }
  }

  return (
    <div className="p-3.5 rounded-xl bg-surface-2 border border-border-dim">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <RotateCw className="w-3.5 h-3.5 text-accent-main" />
          <span className="text-[13px] font-medium text-text-primary">Updates</span>
          <span className="text-[10px] text-text-muted px-1.5 py-0.5 rounded bg-surface-3">
            v{status?.currentVersion ?? '—'}
          </span>
        </div>

        <button
          onClick={handleCheck}
          disabled={busy}
          className="no-drag flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-surface-3 hover:bg-surface-4 border border-border-base text-text-secondary hover:text-text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <RefreshCw className={cn('w-3 h-3', state === 'checking' && 'animate-spin')} />
          {state === 'checking' ? 'Checking…' : 'Check now'}
        </button>
      </div>

      {state === 'not-available' && (
        <p className="text-[11px] text-text-muted flex items-center gap-1.5">
          <Check className="w-3 h-3 text-emerald-400" />
          You are on the latest version.
        </p>
      )}

      {state === 'error' && (
        <p className="text-[11px] text-red-400 flex items-start gap-1.5">
          <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
          <span>{status?.error}</span>
        </p>
      )}

      {(state === 'available' || state === 'downloading' || state === 'downloaded') && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-text-secondary">
              Version <span className="font-medium text-text-primary">{status?.version}</span> is available.
            </p>
            {status?.releaseUrl && (
              <a
                href={status.releaseUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[10px] text-text-muted hover:text-accent-main flex items-center gap-1 shrink-0"
              >
                Release notes <ExternalLink className="w-2.5 h-2.5" />
              </a>
            )}
          </div>

          {status?.releaseNotes && state === 'available' && (
            <p className="text-[10px] text-text-muted leading-relaxed max-h-[80px] overflow-y-auto whitespace-pre-wrap">
              {status.releaseNotes.slice(0, 600)}
            </p>
          )}

          {state === 'downloading' && (
            <div className="space-y-1">
              <div className="h-1.5 rounded-full bg-surface-4 overflow-hidden">
                <div
                  className="h-full bg-accent-main transition-[width] duration-200"
                  style={{ width: `${status?.progress ?? 0}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-text-muted">
                <span>{status?.progress ?? 0}%</span>
                <span>
                  {formatBytes(status?.transferred ?? 0)} / {formatBytes(status?.total ?? 0)}
                  {status?.bytesPerSecond ? ` · ${formatBytes(status.bytesPerSecond)}/s` : ''}
                </span>
              </div>
            </div>
          )}

          {state === 'available' && status?.canInstall && (
            <button
              onClick={handleDownload}
              className="btn-interactive w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-medium bg-accent-main text-white hover:bg-accent-bright transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Download update
            </button>
          )}

          {state === 'available' && !status?.canInstall && (
            <p className="text-[10px] text-text-muted">
              Running from source — install the update from the packaged app or the release page.
            </p>
          )}

          {state === 'downloaded' && (
            <>
              <button
                onClick={handleInstall}
                className="btn-interactive w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-medium bg-accent-main text-white hover:bg-accent-bright transition-colors"
              >
                {status?.installMode === 'restart' ? (
                  <>
                    <RotateCw className="w-3.5 h-3.5" />
                    Restart &amp; install
                  </>
                ) : (
                  <>
                    <FolderOpen className="w-3.5 h-3.5" />
                    Open installer
                  </>
                )}
              </button>

              {/* macOS builds are unsigned, so the update cannot replace the app
                  by itself — say so instead of pretending it restarts. */}
              {status?.installMode === 'open-installer' && (
                <div className="space-y-1">
                  <p className="text-[10px] text-text-muted leading-relaxed">
                    Opens the disk image — drag ImageStudio into Applications, replacing the
                    current version, then reopen it.
                  </p>
                  <button
                    onClick={() => window.api.revealUpdate()}
                    className="text-[10px] text-text-muted hover:text-accent-main transition-colors"
                  >
                    Show the downloaded file
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
