import { BrandIcon } from './BrandIcon'
import { useEffect, useRef, useState } from 'react'
import { X, Eye, EyeOff, KeyRound, SlidersHorizontal, Plug, Monitor } from 'lucide-react'
import { useSettingsStore } from '../../stores/settings-store'
import { UpdateSection } from './UpdateSection'
import { AutomationSection } from './AutomationSection'
import { cn } from '../../lib/utils'

interface SettingsDialogProps { onClose: () => void; embedded?: boolean }
const sections = [
  { id: 'provider', label: 'Anbieter', icon: KeyRound },
  { id: 'generation', label: 'Generierung & Export', icon: SlidersHorizontal },
  { id: 'connection', label: 'KI-Verbindung', icon: Plug },
  { id: 'app', label: 'App', icon: Monitor },
] as const

/** Follow external writes until this field has a local edit. Never expose credential values in conflicts. */
function useSettingDraft<T>(live: T) {
  const [value, setValue] = useState(live)
  const [conflict, setConflict] = useState(false)
  const previous = useRef(live)
  useEffect(() => {
    if (Object.is(previous.current, live)) return
    const oldLive = previous.current
    previous.current = live
    if (Object.is(value, oldLive)) {
      setValue(live)
      setConflict(false)
    } else {
      setConflict(!Object.is(value, live))
    }
  }, [live, value])
  const edit = (next: T) => { setValue(next); if (Object.is(next, live)) setConflict(false) }
  return [value, edit, conflict] as const
}

export function SettingsDialog({ onClose, embedded = false }: SettingsDialogProps) {
  const settings = useSettingsStore()
  const [section, setSection] = useState<string>('provider')
  const [localFalKey, setLocalFalKey, keyConflict] = useSettingDraft(settings.falApiKey)
  const [antiDetection, setAntiDetection, imageConflict] = useSettingDraft(settings.antiDetection)
  const [autoCheckUpdates, setAutoCheckUpdates, updateConflict] = useSettingDraft(settings.autoCheckUpdates)
  const [localBillingKey, setLocalBillingKey, billingConflict] = useSettingDraft(settings.falBillingApiKey)
  const [showBillingKey, setShowBillingKey] = useState(false)
  const [showFalKey, setShowFalKey] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const conflicts = [billingConflict && 'Abrechnungs-Schlüssel', keyConflict && 'API-Schlüssel', imageConflict && 'JPEG-Nachbearbeitung', updateConflict && 'Update-Suche'].filter(Boolean)
  const dirty = localBillingKey.trim() !== settings.falBillingApiKey || localFalKey.trim() !== settings.falApiKey || antiDetection !== settings.antiDetection || autoCheckUpdates !== settings.autoCheckUpdates
  const handleSave = async () => {
    setBusy(true); setError(''); setSaved(false)
    try {
      if (localFalKey.trim() !== settings.falApiKey) await settings.setFalApiKey(localFalKey.trim())
      if (localBillingKey.trim() !== settings.falBillingApiKey) await settings.setSetting('falBillingApiKey', localBillingKey.trim())
      if (antiDetection !== settings.antiDetection) await settings.setSetting('antiDetection', antiDetection)
      if (autoCheckUpdates !== settings.autoCheckUpdates) await settings.setSetting('autoCheckUpdates', autoCheckUpdates)
      setSaved(true)
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setBusy(false) }
  }
  const reset = () => { setLocalBillingKey(settings.falBillingApiKey); setLocalFalKey(settings.falApiKey); setAntiDetection(settings.antiDetection); setAutoCheckUpdates(settings.autoCheckUpdates); setSaved(false) }
  return (
    <div className={embedded ? 'h-full min-h-0 flex flex-col' : 'absolute inset-0 z-50 bg-black/70 flex items-center justify-center animate-overlay-in'} onClick={embedded ? undefined : onClose}>
      <div role={embedded ? undefined : 'dialog'} aria-modal={embedded ? undefined : true} aria-label="Einstellungen" className={embedded ? 'flex flex-col h-full min-h-0' : 'bg-surface-1 border border-border-base rounded-2xl w-full max-w-4xl mx-5 max-h-[88vh] flex flex-col animate-scale-in'} onClick={e => e.stopPropagation()}>
        <header className="flex items-center justify-between px-7 py-6 border-b border-border-dim">
          <div><h2 className="text-2xl font-semibold text-text-primary">Einstellungen</h2><p className="text-[13px] text-text-secondary mt-1">Dein Studio. Deine Arbeitsweise.</p></div>
          {!embedded && <button aria-label="Einstellungen schließen" onClick={onClose} className="p-2 rounded-lg hover:bg-surface-3 text-text-secondary"><X className="w-5 h-5" /></button>}
        </header>
        <div className="flex flex-1 min-h-0 flex-col sm:flex-row">
          <nav aria-label="Einstellungskategorien" className="sm:w-56 shrink-0 p-4 flex sm:flex-col gap-1 overflow-x-auto border-b sm:border-b-0 sm:border-r border-border-dim">
            {sections.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setSection(id)} aria-current={section === id ? 'page' : undefined} className={cn('flex items-center gap-3 rounded-lg px-3 py-3 text-[13px] text-left whitespace-nowrap transition-colors', section === id ? 'bg-accent-main/10 text-accent-main' : 'text-text-secondary hover:bg-surface-3 hover:text-text-primary')}><Icon className="w-4 h-4 shrink-0" />{label}</button>)}
          </nav>
          <div className="flex-1 overflow-y-auto p-7 space-y-6 min-h-[300px]">
            {section === 'provider' && <section className="space-y-4">
              <div><h3 className="text-lg font-semibold text-text-primary">fal.ai</h3><p className="text-[13px] leading-relaxed text-text-secondary mt-2">Verbindet dein Studio mit den Bild- und Videomodellen. Generierungen werden über dein fal.ai-Konto abgerechnet.</p></div>
              <label htmlFor="fal-api-key" className="block text-[13px] font-medium text-text-primary">API-Schlüssel</label>
              <div className="relative"><input id="fal-api-key" autoComplete="off" type={showFalKey ? 'text' : 'password'} value={localFalKey} onChange={e => setLocalFalKey(e.target.value)} placeholder="key-id:key-secret" className="w-full bg-surface-2 border border-border-base rounded-lg px-4 py-3 pr-12 text-[13px] text-text-primary outline-none focus:border-accent-main" /><button aria-label={showFalKey ? 'Schlüssel verbergen' : 'Schlüssel anzeigen'} type="button" onClick={() => setShowFalKey(!showFalKey)} className="absolute right-3 top-3 text-text-secondary">{showFalKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}</button></div>
              <a href="https://fal.ai/dashboard/keys" target="_blank" rel="noreferrer" className="inline-block text-[13px] text-accent-main hover:underline">API-Schlüssel bei fal.ai verwalten ↗</a>
              <p className="text-[12px] leading-relaxed text-text-secondary">Ein leeres Feld entfernt den gespeicherten Schlüssel. Deine vorhandenen Medien bleiben verfügbar.</p>
              <div className="pt-5 border-t border-border-dim space-y-3"><label htmlFor="fal-billing-key" className="block text-[13px] font-medium text-text-primary">Abrechnung · Admin-Schlüssel (optional)</label><p className="text-[12px] leading-relaxed text-text-secondary">Liest die tatsächlichen fal.ai-Kosten pro Auftrag inklusive Rabatten. fal.ai verlangt hierfür einen Admin-Schlüssel. Ohne separaten Schlüssel wird der API-Schlüssel oben verwendet; fehlende Berechtigungen werden in Aktivität angezeigt.</p><div className="relative"><input id="fal-billing-key" autoComplete="off" type={showBillingKey ? 'text' : 'password'} value={localBillingKey} onChange={e => setLocalBillingKey(e.target.value)} placeholder="Optionaler Admin-Schlüssel" className="w-full bg-surface-2 border border-border-base rounded-lg px-4 py-3 pr-12 text-[13px] text-text-primary outline-none focus:border-accent-main"/><button type="button" aria-label={showBillingKey ? 'Abrechnungs-Schlüssel verbergen' : 'Abrechnungs-Schlüssel anzeigen'} onClick={() => setShowBillingKey(!showBillingKey)} className="absolute right-3 top-3 text-text-secondary">{showBillingKey ? <EyeOff className="w-5 h-5"/> : <Eye className="w-5 h-5"/>}</button></div><p className="text-[12px] text-text-secondary">Wird nur für den lesenden Kostenabgleich verwendet. Leer speichern entfernt diesen Schlüssel.</p></div>
            </section>}
            {section === 'generation' && <section><h3 className="text-lg font-semibold text-text-primary mb-5">Bildverarbeitung</h3><label className="flex items-start justify-between gap-6 cursor-pointer"><span><span className="block text-[14px] font-medium text-text-primary">JPEG-Nachbearbeitung</span><span className="block text-[13px] leading-relaxed text-text-secondary mt-2">Generierte Bilder werden als JPEG neu kodiert und um 1 % neu abgetastet. Die Ausgabegröße bleibt gleich. Transparente Bilder und Videos sind ausgenommen.</span></span><input type="checkbox" checked={antiDetection} onChange={e => setAntiDetection(e.target.checked)} className="mt-1 w-4 h-4 accent-accent-main" /></label><p className="mt-6 text-[12px] text-text-secondary leading-relaxed">Modell, Format und Auflösung wählst du direkt beim Erstellen. Exportoptionen findest du beim jeweiligen Medium.</p></section>}
            {section === 'connection' && <><AutomationSection /><p className="text-[12px] text-text-secondary">Änderungen an der KI-Verbindung gelten sofort.</p></>}
            {section === 'app' && <><label className="flex items-start justify-between gap-6 cursor-pointer"><span><span className="block text-[14px] font-medium text-text-primary">Beim Start nach Updates suchen</span><span className="block text-[13px] text-text-secondary mt-2">Downloads starten erst, wenn du sie auswählst.</span></span><input type="checkbox" checked={autoCheckUpdates} onChange={e => setAutoCheckUpdates(e.target.checked)} className="mt-1 w-4 h-4 accent-accent-main" /></label><UpdateSection /><div className="pt-5 border-t border-border-dim"><div className="flex items-center gap-3"><BrandIcon className="w-12 h-12"/><h3 className="text-[14px] font-semibold text-text-primary">ImageStudio</h3></div><p className="mt-2 text-[13px] leading-relaxed text-text-secondary">Bilder und Videos erstellen, mit Referenzen verfeinern und in Projekten organisieren. Für macOS und Windows.</p><a className="inline-block mt-3 text-[12px] text-accent-main" href="https://github.com/ibimspumo/ImageStudio" target="_blank" rel="noreferrer">Open Source · MIT-Lizenz ↗</a></div></>}
          </div>
        </div>
        {conflicts.length > 0 && <p role="status" className="px-7 py-3 text-[12px] leading-relaxed text-text-secondary border-t border-border-dim">Extern geändert: {conflicts.join(', ')}. Dein Entwurf bleibt erhalten. Speichern übernimmt deinen Entwurf; Verwerfen lädt die aktuellen Werte.</p>}
        <footer className="px-7 py-4 border-t border-border-dim flex items-center justify-between gap-4">
          <p role="status" className={cn('text-[12px]', error ? 'text-danger' : 'text-text-secondary')}>{error || (dirty ? 'Ungespeicherte Änderungen' : saved ? 'Einstellungen gespeichert' : 'Alle Änderungen gespeichert')}</p>
          <div className="flex gap-2 shrink-0"><button disabled={busy || !dirty} onClick={reset} className="px-4 py-2 rounded-lg text-[13px] text-text-secondary hover:bg-surface-3 disabled:opacity-40">Verwerfen</button><button disabled={busy || !dirty} onClick={handleSave} className="px-4 py-2 rounded-lg text-[13px] font-medium bg-accent-main text-surface-0 hover:bg-accent-bright disabled:opacity-40">{busy ? 'Speichert…' : 'Speichern'}</button></div>
        </footer>
      </div>
    </div>
  )
}
