import { useEffect, useRef, useState } from 'react'
import { Check, Copy, RefreshCw, Plug } from 'lucide-react'
import type { AutomationStatus } from '../../../../shared/automation'
import { cn } from '../../lib/utils'

export function AutomationSection() {
  const [status, setStatus] = useState<AutomationStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [port, setPort] = useState('48765')
  const [showPrompt, setShowPrompt] = useState(false)
  const mounted = useRef(true)
  const lastPort = useRef<number | null>(null)

  useEffect(() => {
    mounted.current = true
    let pending = false
    const refresh = async () => {
      if (pending) return
      pending = true
      try {
        const next = await window.api.getAutomationStatus()
        if (mounted.current) {
          if (lastPort.current !== next.port) setPort(String(next.port))
          lastPort.current = next.port
          setStatus(next)
        }
      } catch (cause) {
        if (mounted.current) setError(String(cause))
      } finally { pending = false }
    }
    void refresh()
    const timer = setInterval(refresh, 3000)
    return () => { mounted.current = false; clearInterval(timer) }
  }, [])

  const update = async (operation: () => Promise<AutomationStatus>) => {
    setBusy(true)
    setError('')
    setCopied(false)
    try {
      const next = await operation()
      if (mounted.current) { setStatus(next); setPort(String(next.port)) }
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : String(cause))
    } finally { if (mounted.current) setBusy(false) }
  }

  const copyPrompt = async () => {
    if (!status?.running) return
    try {
      await navigator.clipboard.writeText(status.setupPrompt)
      setCopied(true)
      setError('')
    } catch {
      setShowPrompt(true)
      setError('Clipboard unavailable. Select and copy the setup prompt below.')
    }
  }

  const validPort = /^\d+$/.test(port) && Number(port) >= 1024 && Number(port) <= 65535
  const ready = status?.running && status.rendererReady
  const buttonClass = 'rounded-lg px-3 py-2 text-[12px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent-main disabled:opacity-40 disabled:cursor-not-allowed'

  return (
    <section aria-labelledby="automation-heading" className="border-t border-border-base pt-5 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 id="automation-heading" className="flex items-center gap-2 text-[13px] font-semibold text-text-primary">
            <Plug className="w-4 h-4 text-accent-main" /> AI connection
          </h3>
          <p className="text-[12px] text-text-secondary leading-relaxed mt-1.5">
            Let Codex, Claude Code and other AI tools work in ImageStudio on this computer.
          </p>
        </div>
        <button
          type="button" role="switch" aria-checked={status?.enabled ?? false} aria-label="Enable local AI connection"
          disabled={busy || !status}
          onClick={() => update(() => window.api.configureAutomation({ enabled: !status?.enabled }))}
          className={cn('relative w-10 h-[22px] rounded-full shrink-0 focus-visible:outline-2 focus-visible:outline-accent-main disabled:opacity-40', status?.enabled ? 'bg-accent-main' : 'bg-surface-4 border border-border-base')}
        >
          <span className={cn('absolute top-[3px] w-4 h-4 rounded-full bg-white', status?.enabled ? 'left-[22px]' : 'left-[3px]')} />
        </button>
      </div>

      <p role="status" className="flex items-center gap-2 text-[12px] text-text-secondary">
        <span className={cn('w-1.5 h-1.5 rounded-full', ready ? 'bg-success' : status?.error ? 'bg-danger' : 'bg-text-secondary')} />
        {!status ? 'Loading connection…' : busy ? 'Updating connection…' : ready ? 'Ready · local access only' : status.running ? 'Waiting for the workspace…' : status.enabled ? 'Connection unavailable' : 'Off'}
      </p>

      {status?.enabled && <>
        <p className="text-[12px] text-text-secondary leading-relaxed">
          Connected tools can generate paid images and videos, edit your library, and explicitly retrieve your API key.
          Changes appear in the app.
        </p>
        <code className="block text-[11px] text-text-secondary break-all select-text">{status.url}</code>
        <button type="button" onClick={copyPrompt} disabled={!ready || busy}
          className={cn(buttonClass, 'w-full flex justify-center items-center gap-2 bg-accent-main text-surface-0 hover:bg-accent-bright')}>
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Setup prompt copied' : 'Copy setup prompt'}
        </button>
        <p className="text-[12px] text-text-secondary leading-relaxed">
          Paste it into your AI tool to set up the connection. Keep ImageStudio open.
          Your tool may need a new session to load MCP; the prompt also includes direct access.
        </p>
        <button type="button" onClick={() => setShowPrompt(!showPrompt)} aria-expanded={showPrompt}
          className="text-[12px] text-accent-main hover:underline focus-visible:outline-2 focus-visible:outline-accent-main">
          {showPrompt ? 'Hide setup prompt' : 'View setup prompt'}
        </button>
        {showPrompt && <textarea aria-label="AI connection setup prompt" readOnly value={status.setupPrompt}
          className="w-full h-48 resize-y rounded-lg bg-surface-2 border border-border-base p-3 text-[11px] leading-relaxed text-text-primary font-mono select-text focus:outline-accent-main" />}
      </>}

      <details className="text-[12px] text-text-secondary">
        <summary className="cursor-pointer py-1 focus-visible:outline-2 focus-visible:outline-accent-main">Connection options</summary>
        <div className="space-y-3 pt-3">
          <div className="flex items-center gap-2">
            <label htmlFor="automation-port" className="shrink-0">Local port</label>
            <input id="automation-port" inputMode="numeric" value={port} onChange={(event) => setPort(event.target.value)}
              className="w-24 min-w-0 rounded-lg bg-surface-2 border border-border-base px-2 py-2 text-text-primary focus:outline-accent-main" />
            <button type="button" disabled={busy || !status || !validPort || Number(port) === status.port}
              onClick={() => update(() => window.api.configureAutomation({ port: Number(port) }))}
              className={cn(buttonClass, 'hover:bg-surface-3 text-text-primary')}>Apply</button>
          </div>
          {!validPort && <p className="text-danger">Use a port between 1024 and 65535.</p>}
          <button type="button" disabled={busy || !status} onClick={() => update(() => window.api.rotateAutomationToken())}
            className={cn(buttonClass, 'flex items-center gap-2 bg-surface-3 text-text-primary hover:bg-surface-4')}>
            <RefreshCw className="w-3.5 h-3.5" /> Reset connection token
          </button>
          <p className="leading-relaxed">Resetting disconnects existing tools. Copy a new setup prompt after changing the port or token. Connection changes apply immediately.</p>
        </div>
      </details>
      {(error || status?.error) && <p role="alert" className="text-[12px] leading-relaxed text-danger break-words">{error || status?.error}</p>}
    </section>
  )
}
