import { useState } from 'react'
import { X, Eye, EyeOff, Check, Sparkles } from 'lucide-react'
import { useSettingsStore } from '../../stores/settings-store'
import { UpdateSection } from './UpdateSection'
import { cn } from '../../lib/utils'

interface SettingsDialogProps {
  onClose: () => void
}

export function SettingsDialog({ onClose }: SettingsDialogProps) {
  const { falApiKey, setFalApiKey, autoCheckUpdates, antiDetection, setSetting } = useSettingsStore()
  const [localFalKey, setLocalFalKey] = useState(falApiKey)
  const [showFalKey, setShowFalKey] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSave = async () => {
    await setFalApiKey(localFalKey.trim())
    setSaved(true)
    setTimeout(() => {
      setSaved(false)
      onClose()
    }, 600)
  }

  return (
    <div
      className="absolute inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center animate-overlay-in"
      onClick={onClose}
    >
      <div
        className="modal-glass border border-border-base rounded-2xl w-full max-w-md mx-4 animate-scale-in max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-dim">
          <h2 className="text-[15px] font-semibold text-text-primary">Settings</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-3 text-text-muted hover:text-text-primary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-5 space-y-4">
          <div>
            <label className="block text-[13px] font-medium text-text-secondary mb-2">
              fal.ai API Key
            </label>
            <div className="relative">
              <input
                type={showFalKey ? 'text' : 'password'}
                value={localFalKey}
                onChange={(e) => setLocalFalKey(e.target.value)}
                placeholder="key-id:key-secret"
                className="w-full bg-surface-2 border border-border-base rounded-xl px-4 py-2.5 text-[13px] text-text-primary placeholder:text-text-muted outline-none focus:border-accent-main/40 focus:ring-1 focus:ring-accent-main/20 transition-all pr-10"
              />
              <button
                onClick={() => setShowFalKey(!showFalKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
              >
                {showFalKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-text-muted mt-2">
              Get your key at fal.ai/dashboard/keys — used for images, video and reference uploads.
            </p>
          </div>

          {/* Anti-detection post-processing */}
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <label className="text-[13px] font-medium text-text-secondary">
                Anti-detection processing
              </label>
              <p className="text-[11px] text-text-muted leading-snug max-w-[280px]">
                Re-encodes every generated image as JPEG and resamples it by 1 %, so no pixel keeps
                its generator value. Size stays identical. Videos are untouched.
              </p>
            </div>
            <button
              onClick={() => setSetting('antiDetection', !antiDetection)}
              className={cn(
                'relative w-10 h-[22px] rounded-full transition-colors shrink-0 ml-4',
                antiDetection ? 'bg-accent-main' : 'bg-surface-4 border border-border-base'
              )}
            >
              <div
                className={cn(
                  'absolute top-[3px] w-4 h-4 rounded-full bg-white shadow-sm transition-all',
                  antiDetection ? 'left-[22px]' : 'left-[3px]'
                )}
              />
            </button>
          </div>

          {/* Auto update check */}
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <label className="text-[13px] font-medium text-text-secondary">
                Check for updates on launch
              </label>
              <p className="text-[11px] text-text-muted leading-snug max-w-[280px]">
                Ask GitHub for a newer release shortly after start. Downloads never begin on their own.
              </p>
            </div>
            <button
              onClick={() => setSetting('autoCheckUpdates', !autoCheckUpdates)}
              className={cn(
                'relative w-10 h-[22px] rounded-full transition-colors shrink-0 ml-4',
                autoCheckUpdates ? 'bg-accent-main' : 'bg-surface-4 border border-border-base'
              )}
            >
              <div
                className={cn(
                  'absolute top-[3px] w-4 h-4 rounded-full bg-white shadow-sm transition-all',
                  autoCheckUpdates ? 'left-[22px]' : 'left-[3px]'
                )}
              />
            </button>
          </div>

          <UpdateSection />

          {/* About */}
          <div className="p-3.5 rounded-xl bg-surface-2 border border-border-dim">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-3.5 h-3.5 text-accent-main" />
              <span className="text-[13px] font-medium text-text-primary">ImageStudio</span>
            </div>
            <p className="text-[11px] text-text-muted leading-relaxed">
              Open-source AI image &amp; video generation for macOS and Windows. Runs entirely on fal.ai —
              generate, iterate with chat, organize with workspaces, and export in any format.
            </p>
            <p className="text-[10px] text-text-muted/60 mt-2">
              MIT License — github.com/ibimspumo/ImageStudio
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border-dim flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-[13px] text-text-secondary hover:text-text-primary hover:bg-surface-3 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!localFalKey.trim()}
            className="btn-interactive px-4 py-2 rounded-xl text-[13px] font-medium bg-accent-main text-white hover:bg-accent-bright transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5 glow-accent"
          >
            {saved ? (
              <>
                <Check className="w-3.5 h-3.5" />
                Saved
              </>
            ) : (
              'Save'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
