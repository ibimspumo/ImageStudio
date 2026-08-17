# CLAUDE.md

## IMPORTANT: Keep README.md and CLAUDE.md up to date with ANY changes.
When features are added/changed, update README.md (features list, usage table, architecture).
When screenshots change visually, regenerate them: `node test-readme-screenshots.mjs` (needs dev server running).
When architecture changes, update the tree below.

## Build & Run
```bash
npm run dev                # Dev with hot reload
npm run build              # Production build
npm run build:mac          # Package for macOS (.dmg)
npm run build:win          # Package for Windows (.exe)
npx electron-vite build    # Build check only (no Electron)
```

## Architecture
- `src/shared/` — code used by **both** main and renderer
  - `image-models.ts` — the fal.ai image model registry: endpoints, aspect ratios, resolutions, reference limits, per-model capability flags, **list prices**, plus `resolveAspectRatio`/`resolveResolution`/`toGptImageSize`/`getCombinedCapabilities`/`normalizeModelId`/`estimateImageCost`/`formatCost`
  - `thumbnail-prompt.ts` — the YouTube thumbnail system prompt (base rules, style blocks, face-fidelity block) plus the mode's locked constants and `buildThumbnailSystemPrompt()`
  - `version.ts` — semver comparison for the updater
- `src/main/` — Electron main process (IPC, API, files)
- `src/preload/` — Typed context bridge (`window.api`)
- `src/renderer/src/` — React UI
  - `stores/` — Zustand: gallery, collections, chat, settings, workspace, crop, thumbnail-projects (all with debounced persistence via `lib/debounce.ts`)
  - `hooks/` — useImageGeneration, useVideoGeneration (fal.ai), useChatGeneration, useMentionEditor (the contenteditable prompt editor with @-mentions, shared by PromptBar and ChatView), useImageRefs (shared image attachment logic), useJustifiedLayout (row-based masonry)
  - `types/api.ts` — AspectRatio, Resolution, AVAILABLE_MODELS, AVAILABLE_VIDEO_MODELS, getModelName, getVideoModelName, ImageRef, LabeledAttachment
  - `components/input/` — PromptBar (orchestrator), VideoPromptBar (video mode, no @mentions), AttachmentStrip (image/collection thumbnails), MentionPopup (@-mention dropdown), ControlsRow (model/aspect/resolution/count/buttons), CostEstimate (live per-request price), ModelSelector, VideoModelSelector, AspectRatioSelector, ResolutionSelector, DurationSelector, ImageCountSelector
  - `components/gallery/` — Justified layout (row-based masonry, left-to-right fill), GalleryCard with hover actions (save, copy, chat, move-to-workspace), video hover preview
  - `components/chat/` — ChatView (iterative editing; inherits the source image's model/aspect ratio/resolution, supports @-mentions and collections via `useMentionEditor`)
  - `components/workspace/` — WorkspaceBar (pill tabs, create, rename, delete, filter gallery)
  - `components/shared/` — ErrorBoundary, ImageViewer (lightbox with chat origin), SimpleLightbox, ExportPopover (format/quality/filesize), SettingsDialog, UpdateSection, SpendIndicator (running cost total in the TitleBar)
  - `components/thumbnail/` — ProjectBar (video pills, drop target), ThumbnailControls (model, style, face fidelity, count), StyleSelector (auto/clean/balanced/bold), ThumbnailFrame (16:9 + safe-zone/legibility overlays), ThumbnailPreviewModal (YouTube surfaces, size ladder, 1920×1080 export)
  - `components/collections/` — Asset collection CRUD
  - `lib/image-utils.ts` — compressImage, createZoomOutCanvas, createAspectRatioCanvas, collectionImagesAsBase64, renderYouTubeThumbnail (exact 1920×1080 cover-crop)
  - `lib/anti-detection.ts` — `prepareForStorage()` / `scrubGeneratedImage()` / `neutralImageName()`, see **Anti-Detection** below
  - `lib/reference-packing.ts` — fits reference images into each model's `image_urls` limit by merging the biggest groups into numbered collages
  - `lib/date-utils.ts` — formatDuration, formatTime, formatDate (shared across components)
  - `lib/debounce.ts` — debounce utility for store persistence
  - `lib/logger.ts` — structured logger replacing silent catch blocks

## Models
Everything — images, video, reference uploads — runs through fal.ai. There is one credential: `falApiKey`.

### Image Models (fal.ai)
Defined in `src/shared/image-models.ts` as `AVAILABLE_MODELS`, re-exported through `types/api.ts`.
Default: `openai/gpt-image-2` (both `DEFAULT_MODEL` and `DEFAULT_THUMBNAIL_MODEL`; it is also first in
`AVAILABLE_MODELS`, which is what `getModel()` falls back to). Each model has a text-to-image endpoint
and an `/edit` endpoint; `fal-image.ts` picks the edit endpoint whenever reference images are attached.

| Model | Endpoint | Aspect ratios | Resolutions | Refs | Seed | Price |
|---|---|---|---|---|---|---|
| GPT Image 2 (default) | `openai/gpt-image-2` | via `image_size` | via `image_size` | 16 | no | size × quality table |
| Nano Banana 2 | `fal-ai/nano-banana-2` | 15 incl. 4:1/8:1 | 0.5K–4K | 14 | yes | $0.08 @1K, ×0.75/×1.5/×2 |
| Nano Banana 2 Lite | `google/nano-banana-2-lite` | 15 incl. 4:1/8:1 | fixed 1K | 14 | yes | ~$0.048 |
| Nano Banana Pro | `fal-ai/nano-banana-pro` | 11 (no extremes) | 1K–4K | 14 | yes | $0.15, ×2 @4K |

**None of the four accept `negative_prompt`** — the control is gone from the UI.
GPT Image 2 has no `aspect_ratio`/`resolution`/`seed`: ratios become an explicit `image_size`
(multiples of 16, ≤3840 px per edge, ≤3:1, 655,360–8,294,400 px) and it exposes a `quality` tier instead.
Values a model cannot take are mapped to its nearest supported one rather than rejected.
Multi-model generation: PromptBar allows selecting multiple models; `useImageGeneration` runs each model
independently and packs references per model. Chat uses a single model per message.

### The prompt editor
Both PromptBar and ChatView run on `useMentionEditor`. It owns the contenteditable, the reference
chips, the `@`-mention popup and `getPromptText()` — so a mention resolves identically in the gallery
and in a chat. Two things to keep in mind when touching it:
- The editor's text lives in the DOM, so typing causes **no** React update on its own. The hook
  mirrors the text into `promptText` on every input; anything derived from the prompt (the Generate
  button, `hasContent`) must read that, never call `getPromptText()` during render. Writing the
  editor's `innerHTML` directly (the reuse-prompt path) fires no input event — call `syncPromptText()`.
- Chip removal has no event of its own; `handleEditorInput` reconciles `collectionRefs` against the
  chips actually present in the DOM.

### References and @-mentions
fal.ai takes a flat `image_urls` array plus one prompt string — there is no way to interleave labels
between images. `buildReferencePreamble()` therefore numbers every reference in the prompt, in the exact
order the URLs are sent, which is what makes `[Image 1]` and `[@Collection]` mentions resolvable.
When references exceed a model's limit, `packReferencesForModel()` merges the largest groups into numbered
collages until they fit — nothing is dropped. Single-image slots are passed through untouched.

### Cost tracking
fal.ai reports **no** per-request cost — not in the queue response, not via the client, not in the
OpenAPI schema (checked; there is no pricing block). Every figure the app shows is therefore computed
from the list prices in `AVAILABLE_MODELS[].pricing` by `estimateImageCost()`, and is labelled `≈`.

`fal-image.ts` computes it from the request it actually built, not from what the caller asked for —
a resolution the model does not offer was already clamped by `buildInput()`. The value rides back on
`GenerateResult.cost`, which `completeImage()` already stored, so gallery, lightbox and the running
total all read the same number. Surcharges (web search, high thinking) are added per request.

Displayed in three places: `CostEstimate` in PromptBar and ChatView (before generating, per model),
the lightbox details (after generating), and `SpendIndicator` in the TitleBar (today's total, all-time
on hover). Images generated before this existed carry no `cost` and are excluded from the total.

When adding a model, fill in `pricing` — the type requires it, and a missing price silently reads as
free. Prices come from `https://fal.ai/models/<id>`; re-check them when touching the registry.

### Uploads
Reference images go to fal.ai storage (`fal.storage.upload`) — the endpoints only accept URLs.
`image-upload.ts` caches by content hash and shares in-flight uploads, so an image referenced by several
models or several images of a batch is transferred once. The cache is cleared when the API key changes.

### Thumbnail Mode
The third `AppMode` (`MainContent.tsx`), built around one fixed output: 16:9, 2K generated, exactly 1920 × 1080 exported.
`getThumbnailModels()` derives the model list from the registry (`uiResolutions` contains `'2K'`), which drops Nano Banana 2 Lite.
It reuses `PromptBar` via the `thumbnailMode` prop — references, @-mentions, drag & drop and collections stay identical;
only `ControlsRow` is swapped for `ThumbnailControls` and the format controls disappear.

`buildThumbnailSystemPrompt()` assembles base rules + optional style block (`auto` adds none — the default; otherwise `clean` | `balanced` | `bold`) + optional face-fidelity block
+ video context. `useImageGeneration` delivers it as `system_prompt` where `supportsSystemPrompt` is true and prepends it to the
prompt otherwise — GPT Image 2 has no such field, and silently dropping the rules there would be worse than a long prompt.

**Exact pixels:** no model returns 1920 × 1080. Gemini at 16:9/2K returns 2752 × 1536 (ratio 1.792); fal.ai rounds GPT Image 2's
`image_size` to multiples of 16, so 1080 becomes 1072 (both verified against the live endpoints). Thumbnail mode therefore sends
`imageSize: 1920 × 1088` for GPT Image 2 and normalises on export via `renderYouTubeThumbnail()` — centre-crop to 16:9, scale to
1920 × 1080, step JPEG quality down until under YouTube's 2 MB limit.

Projects (`thumbnail-projects-store.ts`, persisted as `thumbnail-projects`) are a second axis next to workspaces and only filter
inside thumbnail mode. `GalleryImage` carries `projectId`, `thumbnailStyle` and `faceFidelity`.

### Anti-Detection
Every generated image runs through `prepareForStorage()` **before** `window.api.saveImage` — in
`useImageGeneration`, `useChatGeneration` and the three derive actions in `ImageViewer` (zoom out,
upscale, aspect ratio). Videos never do. Doing it before storage rather than on export is what makes
gallery, export, clipboard and drag & drop all hand out the same processed file.

The pipeline is JPEG 95 → squeeze X to 99 % → squeeze Y to 99 % → scale back → JPEG 95. The JPEG
round has to be decoded again in between, otherwise the quantisation never reaches the pixels the
resample works on. Output keeps the generated dimensions exactly; ~86 % of pixels change at an
average delta of 1.5/255. A failed scrub falls back to the untouched image — never lose a generation
over post-processing.

Consequences to keep in mind when touching this: stored files are `.jpg`, not `.png`, so never
hardcode the extension — take it from `prepareForStorage().extension` or the stored `filePath`.
Export names come from `neutralImageName()` while the setting is on, and `ExportPopover`'s quick save
derives its encoder from the name's extension. PNG metadata embedding is not offered while it is on.
The setting is `antiDetection` (default true) and lives in both `src/main/ipc/index.ts` (DEFAULTS,
VALID_SETTINGS_KEYS, loadSettings) and `types/settings.ts` + `settings-store.ts`.

### Video Models (fal.ai)
Defined in `types/api.ts` as `AVAILABLE_VIDEO_MODELS`. Default: `fal-ai/bytedance/seedance/v1.5/pro/image-to-video` (Seedance 1.5 Pro).
All image-to-video only (require start frame). VideoPromptBar uses single model select (no @mentions/collections — not supported by video API). `useVideoGeneration` fires via fal.ai queue API, stores estimated cost on completion.
Models: Kling v3 Standard, Kling v3 Pro, Seedance 1.5 Pro. Kling v3 Pro is the only model in the app that supports a negative prompt.
Videos saved as MP4 in `{userData}/ImageStudio/videos/`. Gallery shows both images and videos (filterable). Videos auto-play on hover in grid view. Video export uses direct file copy (no Canvas conversion).

## Critical Rules
- Tailwind CSS v4: `@theme {}` in app.css — NEVER add `* {}` resets outside @layer
- Colors: surface-0..4, border-dim/base/bright, text-primary/secondary/muted, accent-main/dim/bright
- IPC: `ipcRenderer.invoke()` / `ipcMain.handle()` via preload
- Persistence: `window.api.saveHistory(key, json)` / `listHistory()` — stores use debounced persistence (500ms)
- Error handling: use `logger` from `lib/logger.ts` — NEVER use silent `catch {}` blocks
- API key: a single fal.ai key, stored in `{userData}/imagestudio-settings.json`, NEVER in source
- Generation: fire-and-forget, placeholder → complete pattern, non-blocking
- API response: fal.ai returns `data.images[]` with CDN urls; the main process downloads them to base64 before handing them to the renderer
- Model capabilities: `src/shared/image-models.ts` mirrors the live fal.ai OpenAPI schemas. Never add a capability a model lacks — the UI hides controls from these flags and the request builder only sends supported fields
- Electron drag: use `no-drag` class on all interactive elements in top 48px
- Image uploads: always compress via `compressImage()` (JPEG 75%, max 1000px)
- Shared types: use `ImageRef` and `LabeledAttachment` from `types/api.ts` — don't redeclare locally
- Export: ExportPopover supports PNG/JPEG/WebP with quality slider for images (Canvas conversion), MP4 direct file copy for videos
- Workspaces: optional image organization, `workspaceId` on GalleryImage, auto-tag on generation
- Updates: electron-updater against GitHub Releases (`build.publish` in package.json). Check → download with progress → install on restart, all from Settings. Downloads never start on their own. The app version is baked in via `__APP_VERSION__` because `app.getVersion()` returns Electron's version in an unpackaged build
- License: MIT, fully open source
