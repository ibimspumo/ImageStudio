import { useState } from 'react'
import { X, Eye, EyeOff, Check } from 'lucide-react'
import { useSettingsStore } from '../../stores/settings-store'

interface SettingsDialogProps {
  onClose: () => void
}

export function SettingsDialog({ onClose }: SettingsDialogProps) {
  const { apiKey, setApiKey } = useSettingsStore()
  const [localKey, setLocalKey] = useState(apiKey)
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSave = async () => {
    await setApiKey(localKey)
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
        className="modal-glass border border-border-base rounded-2xl w-full max-w-md mx-4 animate-scale-in"
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
              OpenRouter API Key
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={localKey}
                onChange={(e) => setLocalKey(e.target.value)}
                placeholder="sk-or-v1-..."
                className="w-full bg-surface-2 border border-border-base rounded-xl px-4 py-2.5 text-[13px] text-text-primary placeholder:text-text-muted outline-none focus:border-accent-main/40 focus:ring-1 focus:ring-accent-main/20 transition-all pr-10"
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-text-muted mt-2">
              Get your key at openrouter.ai/keys
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-surface-2 border border-border-dim">
            <p className="text-[13px] text-text-secondary">
              <span className="font-medium text-text-primary">Model:</span>{' '}
              Gemini 3.0 Pro Image Preview
            </p>
            <p className="text-[11px] text-text-muted mt-1.5 leading-relaxed">
              Professional image generation with text rendering, multi-image blending, up to 4K output.
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
            disabled={!localKey.trim()}
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
