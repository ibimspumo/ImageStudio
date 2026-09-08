import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { Plus, Send, XCircle, Settings, ImageIcon, Volume2, VolumeX, Lock } from 'lucide-react'
import { useVideoGeneration } from '../../hooks/useVideoGeneration'
import { useSettingsStore } from '../../stores/settings-store'
import { AVAILABLE_VIDEO_MODELS, DEFAULT_VIDEO_MODEL, estimateVideoCost } from '../../types/api'
import type { AspectRatio, FalAspectRatio } from '../../types/api'
import { cn } from '../../lib/utils'
import { logger } from '../../lib/logger'
import { compressImage } from '../../lib/image-utils'
import { useLiveDraft } from '../../automation/live-drafts'
import { rejectDraftFields, resolveDraftReference } from '../../automation/draft-tools'
import { REFERENCE_PROMPT_GUIDANCE } from '../../../../shared/reference-mentions'
import { VideoModelSelector } from './VideoModelSelector'
import { DurationSelector } from './DurationSelector'
import { TuneMenu, TuneGroup, TuneOption, TuneRow, TuneRatioOptions } from './TunePanel'

interface VideoPromptBarProps {
  onSettingsClick?: () => void
  initialStartFrame?: { base64: string; name: string } | null
}

/**
 * The video prompt bar — same shell as the image bar: prompt card, slim
 * controls (model · duration · options · generate) in a stable composer.
 * No @-mentions or collections, the video API takes exactly one start frame.
 */
export function VideoPromptBar({ onSettingsClick, initialStartFrame }: VideoPromptBarProps) {
  const [selectedModel, setSelectedModel] = useState(useSettingsStore.getState().defaultVideoModel || DEFAULT_VIDEO_MODEL)
  const [duration, setDuration] = useState(5)
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9')
  const [customRatio, setCustomRatio] = useState('4:3')
  const [resolution, setResolution] = useState('720p')
  const [generateAudio, setGenerateAudio] = useState(true)
  const [cameraFixed, setCameraFixed] = useState(false)
  const [startFrame, setStartFrame] = useState<{ base64: string; name: string } | null>(initialStartFrame ?? null)
  const editorRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { generateVideo } = useVideoGeneration()
  const falApiKey = useSettingsStore((s) => s.falApiKey)

  const hydrated = useSettingsStore(s => s.hydrated)
  const defaultsHydrated = useRef(useSettingsStore.getState().hydrated)
  useEffect(() => {
    if (!hydrated || defaultsHydrated.current) return
    defaultsHydrated.current = true
    setSelectedModel(useSettingsStore.getState().defaultVideoModel || DEFAULT_VIDEO_MODEL)
  }, [hydrated])

  // Get model config for dynamic options
  const modelConfig = AVAILABLE_VIDEO_MODELS.find((m) => m.id === selectedModel)
  const durationOptions = modelConfig?.durations ?? [5, 10]

  const resolutionOptions = modelConfig?.resolutions ?? ['720p']
  // Video models accept a narrower set of ratios than the image models do
  const aspectRatioOptions = (modelConfig?.aspectRatios ?? ['16:9', '9:16', '1:1']) as FalAspectRatio[]

  // Clamp duration and resolution if model changes
  useEffect(() => {
    if (!durationOptions.includes(duration)) {
      setDuration(modelConfig?.defaultDuration ?? durationOptions[0])
    }
    if (!resolutionOptions.includes(resolution)) {
      setResolution(modelConfig?.defaultResolution ?? resolutionOptions[0])
    }
  }, [selectedModel, duration, durationOptions, resolution, resolutionOptions, modelConfig])

  // Accept initial start frame from parent
  useEffect(() => {
    if (initialStartFrame) {
      setStartFrame(initialStartFrame)
    }
  }, [initialStartFrame])

  // ── Prompt text extraction ────────────────────────────────────────

  const getPromptText = useCallback((): string => {
    const editor = editorRef.current
    if (!editor) return ''
    let text = ''
    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent || ''
      } else if (node instanceof HTMLElement) {
        if (node.tagName === 'BR') {
          text += '\n'
        } else {
          for (const child of Array.from(node.childNodes)) walk(child)
        }
      }
    }
    for (const child of Array.from(editor.childNodes)) walk(child)
    return text.trim()
  }, [])

  // The editor is a contenteditable — its text lives in the DOM, so it is
  // mirrored into state on input, same as the image bar, to keep the Generate
  // button and the collapsed preview in sync.
  const [promptText, setPromptText] = useState('')
  const handleEditorInput = useCallback(() => setPromptText(getPromptText()), [getPromptText])

  // ── Submit ────────────────────────────────────────────────────────

  const handleSubmit = useCallback(() => {
    const prompt = getPromptText()
    if (!prompt || !startFrame || !falApiKey) return

    return generateVideo({
      prompt,
      model: selectedModel,
      duration,
      aspectRatio: aspectRatio === 'custom' ? customRatio : aspectRatio,
      resolution,
      startFrameBase64: startFrame.base64,
      generateAudio,
      cameraFixed: cameraFixed || undefined,
    })

    // Keep prompt text (same behavior as image PromptBar)
  }, [getPromptText, startFrame, falApiKey, generateVideo, selectedModel, duration, aspectRatio, customRatio, resolution, generateAudio, cameraFixed])

  useLiveDraft({
    mode: 'video',
    read: () => ({
      mode: 'video', prompt: getPromptText(), model: selectedModel, duration,
      aspectRatio: aspectRatio === 'custom' ? customRatio : aspectRatio, resolution, generateAudio, cameraFixed,
      startFrame: startFrame ? { id: 'startFrame', name: startFrame.name, mimeType: /^data:([^;]+)/.exec(startFrame.base64)?.[1] } : null,
      referenceRule: REFERENCE_PROMPT_GUIDANCE.video,
      capabilities: modelConfig, ready: !!getPromptText() && !!startFrame && !!useSettingsStore.getState().falApiKey,
      estimatedCostUsd: estimateVideoCost(selectedModel, duration, generateAudio), costIsEstimate: true,
    }),
    update: async patch => {
      rejectDraftFields(patch, ['prompt', 'model', 'duration', 'aspectRatio', 'resolution', 'generateAudio', 'cameraFixed', 'startFrame', 'clearStartFrame'])
      const model = AVAILABLE_VIDEO_MODELS.find(m => m.id === (patch.model ?? selectedModel))
      if (!model) throw new Error('Unknown video model; inspect get_capabilities')
      if (patch.duration !== undefined && !model.durations.includes(patch.duration)) throw new Error(`Duration must be one of ${model.durations.join(', ')} seconds`)
      if (patch.resolution !== undefined && !model.resolutions.includes(patch.resolution)) throw new Error(`Resolution must be one of ${model.resolutions.join(', ')}`)
      if (patch.generateAudio !== undefined && !model.supportsAudio) throw new Error('This model has no audio control')
      if (patch.cameraFixed !== undefined && !model.supportsCameraFixed) throw new Error('This model has no fixed camera control')
      if (patch.startFrame && patch.clearStartFrame) throw new Error('Specify startFrame or clearStartFrame, not both')
      const frame = patch.startFrame === undefined ? undefined : await compressImage(await resolveDraftReference(patch.startFrame), 1024)
      if (patch.prompt !== undefined && editorRef.current) { editorRef.current.textContent = patch.prompt; setPromptText(patch.prompt.trim()) }
      if (patch.model !== undefined) setSelectedModel(patch.model)
      if (patch.duration !== undefined) setDuration(patch.duration)
      else if (!model.durations.includes(duration)) setDuration(model.defaultDuration)
      if (patch.resolution !== undefined) setResolution(patch.resolution)
      else if (!model.resolutions.includes(resolution)) setResolution(model.defaultResolution)
      if (patch.aspectRatio !== undefined) {
        if (model.aspectRatios.includes(patch.aspectRatio as FalAspectRatio)) setAspectRatio(patch.aspectRatio as AspectRatio)
        else { setAspectRatio('custom'); setCustomRatio(patch.aspectRatio) }
      }
      if (patch.generateAudio !== undefined) setGenerateAudio(patch.generateAudio)
      if (patch.cameraFixed !== undefined) setCameraFixed(patch.cameraFixed)
      if (frame !== undefined) setStartFrame({ base64: frame, name: 'Startbild' })
      if (patch.clearStartFrame) setStartFrame(null)
    },
    submit: handleSubmit,
    readReference: id => id === 'startFrame' ? startFrame?.base64 : undefined,
  })

  const handleEditorKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSubmit()
      return
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault()
      document.execCommand('insertLineBreak')
    }
  }, [handleSubmit])

  // ── File handling ─────────────────────────────────────────────────

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const reader = new FileReader()
      reader.onload = async () => {
        const base64 = reader.result as string
        const compressed = await compressImage(base64, 1024)
        setStartFrame({ base64: compressed, name: file.name })
      }
      reader.readAsDataURL(file)
    } catch (err) {
      logger.error('VideoPromptBar', 'Failed to read file', err)
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    const filePath = e.dataTransfer.getData('text/plain')
    if (filePath && (filePath.endsWith('.png') || filePath.endsWith('.jpg') || filePath.endsWith('.jpeg') || filePath.endsWith('.webp'))) {
      try {
        const result = await window.api.readImage(filePath)
        if (result.success && result.base64DataUrl) {
          const compressed = await compressImage(result.base64DataUrl, 1024)
          setStartFrame({ base64: compressed, name: 'Startbild' })
          return
        }
      } catch (err) {
        logger.error('VideoPromptBar', 'Failed to read dropped file', err)
      }
    }
    const file = e.dataTransfer.files?.[0]
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = async () => {
        const base64 = reader.result as string
        const compressed = await compressImage(base64, 1024)
        setStartFrame({ base64: compressed, name: file.name })
      }
      reader.readAsDataURL(file)
    }
  }, [])

  const canSend = !!promptText && !!startFrame && !!falApiKey
  const hasContent = !!promptText || !!startFrame

  // Live cost estimate
  const estimatedCost = useMemo(
    () => estimateVideoCost(selectedModel, duration, generateAudio),
    [selectedModel, duration, generateAudio]
  )

  const defaultResolution = modelConfig?.defaultResolution ?? resolutionOptions[0]
  const tuneBadge = [
    resolution !== defaultResolution,
    aspectRatio !== '16:9',
    !!modelConfig?.supportsAudio && !generateAudio,
    cameraFixed,
  ].filter(Boolean).length

  return (
    <div className="shrink-0 flex flex-col items-center px-6 pb-6 pt-3">
      <div className="w-full max-w-[1100px] relative">
        <div
          className="prompt-card studio-composer relative border border-border-base rounded-xl"
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
        >
              {/* Prompt editor */}
              <div className="px-5 pt-5 pb-4">
                <div
                  ref={editorRef}
                  role="textbox"
                  aria-label="Videobeschreibung"
                  aria-multiline="true"
                  contentEditable
                  suppressContentEditableWarning
                  className="prompt-editor min-h-[60px] max-h-[160px] overflow-y-auto text-[14px] text-text-primary leading-relaxed outline-none"
                  data-placeholder="Beschreibe Bewegung, Handlung und Kamerafahrt …"
                  onInput={handleEditorInput}
                  onKeyDown={handleEditorKeyDown}
                />
              </div>

              {/* Startbild preview */}
              {startFrame ? (
                <div className="flex items-center gap-2 px-5 pb-4">
                  <div className="relative w-16 h-10 rounded-lg overflow-hidden border border-border-dim shrink-0">
                    <img src={startFrame.base64} alt="Startbild" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-[12px] font-medium text-text-secondary">Startbild</span>
                  </div>
                  <button
                    aria-label="Startbild entfernen"
                    onClick={() => setStartFrame(null)}
                    className="p-1 text-text-muted hover:text-text-primary transition-colors"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-5 pb-4">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-dashed border-border-base bg-surface-2 hover:bg-surface-3 cursor-pointer transition-colors"
                  >
                    <ImageIcon className="w-3.5 h-3.5 text-text-muted" />
                    <span className="text-[12px] text-text-muted">Startbild hinzufügen · erforderlich</span>
                  </button>
                </div>
              )}

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileSelect}
              />

              {/* Separator */}
              <div className="mx-4 h-px bg-border-dim/60" />

              {/* Controls — model · duration · Tune, same shape as the image bar */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-2 px-5 py-3">
                <VideoModelSelector selectedModel={selectedModel} onChange={setSelectedModel} />

                <div className="w-px h-4 bg-border-dim/40 mx-0.5 shrink-0" />

                <DurationSelector value={duration} options={durationOptions} onChange={setDuration} />

                <TuneMenu badge={tuneBadge} width={340} summary={`${aspectRatio === 'custom' ? customRatio : aspectRatio} · ${resolution}`}>
                  {(close) => (
                    <>
                      <TuneGroup label="Auflösung">
                        {resolutionOptions.map((res) => (
                          <TuneOption key={res} selected={resolution === res} onClick={() => setResolution(res)}>
                            {res}
                          </TuneOption>
                        ))}
                      </TuneGroup>

                      <TuneGroup label="Format">
                        <TuneRatioOptions
                          ratios={aspectRatioOptions}
                          value={aspectRatio}
                          onChange={(r) => setAspectRatio(r as AspectRatio)}
                          customRatio={customRatio}
                          onCustomRatioChange={setCustomRatio}
                        />
                      </TuneGroup>

                      {(modelConfig?.supportsAudio || modelConfig?.supportsCameraFixed) && (
                        <TuneGroup label="Optionen">
                          {modelConfig?.supportsAudio && (
                            <TuneOption
                              selected={generateAudio}
                              onClick={() => setGenerateAudio(!generateAudio)}
                              title={generateAudio ? 'Audio wird generiert — klicken zum Deaktivieren' : 'Ohne Audio — klicken zum Aktivieren'}
                            >
                              {generateAudio ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                              Audio
                            </TuneOption>
                          )}
                          {modelConfig?.supportsCameraFixed && (
                            <TuneOption
                              selected={cameraFixed}
                              onClick={() => setCameraFixed(!cameraFixed)}
                              title={cameraFixed ? 'Kamera fixiert (Stativ) — klicken zum Lösen' : 'Kamera frei — klicken für Stativ-Shot'}
                            >
                              <Lock className="w-3.5 h-3.5" />
                              Kamera fixiert
                            </TuneOption>
                          )}
                        </TuneGroup>
                      )}

                      {onSettingsClick && (
                        <TuneGroup label="Werkzeuge">
                          <div className="flex flex-col w-full -mx-0.5">
                            <TuneRow icon={<Settings className="w-3.5 h-3.5" />} onClick={() => { onSettingsClick(); close() }}>
                              Einstellungen
                            </TuneRow>
                          </div>
                        </TuneGroup>
                      )}
                    </>
                  )}
                </TuneMenu>

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="no-drag shrink-0 flex items-center justify-center w-8 h-8 rounded-lg bg-surface-3 hover:bg-surface-4 border border-border-base text-text-secondary hover:text-text-primary transition-all"
                  title="Startbild hinzufügen"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>

                <div className="flex items-center gap-1 ml-auto shrink-0">
                  {hasContent && (
                    <button
                      onClick={() => {
                        if (editorRef.current) editorRef.current.innerHTML = ''
                        setPromptText('')
                        setStartFrame(null)
                      }}
                      className="no-drag shrink-0 flex items-center justify-center w-8 h-8 rounded-lg text-text-muted hover:text-text-secondary hover:bg-surface-3 transition-all"
                      title="Eingabe leeren"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                    </button>
                  )}

                  <button
                    onClick={handleSubmit}
                    disabled={!canSend}
                    className={cn(
                      'no-drag btn-interactive shrink-0 flex items-center justify-center h-10 rounded-lg px-4 gap-2 transition-colors',
                      canSend
                        ? 'bg-accent-main hover:bg-accent-bright text-[#171a11] px-4 gap-2'
                        : 'bg-surface-3 text-text-muted cursor-not-allowed px-4 gap-2'
                    )}
                  >
                    <Send className="w-4 h-4" />
                    <span className="text-[13px] font-semibold">Generieren</span>
                  </button>
                </div>
              </div>
        </div>

        {/* Hint — same row as the image bar, cost included */}
        <div
          className="flex flex-wrap justify-between mt-2.5 px-1"
        >
          <p className="text-[12px] text-text-muted">
            {!falApiKey && <button onClick={onSettingsClick} className="text-danger mr-3">fal.ai API-Schlüssel fehlt · Einstellungen öffnen</button>}
            <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-surface-2 text-text-muted border border-border-dim text-[12px] mr-0.5">&#x2318;</kbd>
            <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-surface-2 text-text-muted border border-border-dim text-[12px] mx-0.5">&#x23CE;</kbd>
            {'  ·  '}
            <span className="tabular-nums" title="Schätzung nach fal.ai Listenpreisen, keine tatsächliche Abrechnung">Schätzung: ${estimatedCost.toFixed(2)} USD</span>
            {!startFrame && (
              <>
                {'  ·  '}
                <span className="text-accent-main/80">Startbild erforderlich</span>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}
