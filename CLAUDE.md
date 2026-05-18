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
- `src/main/` — Electron main process (IPC, API, files)
- `src/preload/` — Typed context bridge (`window.api`)
- `src/renderer/src/` — React UI
  - `stores/` — Zustand: gallery, collections, chat, settings, workspace, crop (all with debounced persistence via `lib/debounce.ts`)
  - `hooks/` — useImageGeneration, useVideoGeneration (fal.ai), useChatGeneration, useImageRefs (shared image attachment logic), useJustifiedLayout (row-based masonry)
  - `types/api.ts` — AspectRatio, Resolution, AVAILABLE_MODELS, AVAILABLE_VIDEO_MODELS, getModelName, getVideoModelName, ImageRef, LabeledAttachment
  - `components/input/` — PromptBar (orchestrator), VideoPromptBar (video mode, no @mentions), AttachmentStrip (image/collection thumbnails), MentionPopup (@-mention dropdown), ControlsRow (model/aspect/resolution/count/buttons), ModelSelector, VideoModelSelector, AspectRatioSelector, ResolutionSelector, DurationSelector, ImageCountSelector
  - `components/gallery/` — Justified layout (row-based masonry, left-to-right fill), GalleryCard with hover actions (save, copy, chat, move-to-workspace), video hover preview
  - `components/chat/` — ChatView (iterative editing with per-message model selection)
  - `components/workspace/` — WorkspaceBar (pill tabs, create, rename, delete, filter gallery)
  - `components/shared/` — ErrorBoundary, ImageViewer (lightbox with chat origin), SimpleLightbox, ExportPopover (format/quality/filesize), SettingsDialog
  - `components/collections/` — Asset collection CRUD
  - `lib/image-utils.ts` — compressImage, createGridComposite, prepareCollectionImages
  - `lib/date-utils.ts` — formatDuration, formatTime, formatDate (shared across components)
  - `lib/debounce.ts` — debounce utility for store persistence
  - `lib/logger.ts` — structured logger replacing silent catch blocks

## Models
### Image Models (OpenRouter)
Defined in `types/api.ts` as `AVAILABLE_MODELS`. Default: `openai/gpt-5.4-image-2` (GPT-5.4 Image 2).
Multi-model generation: PromptBar allows selecting multiple models; `useImageGeneration` fires one request per model × imageCount.
Chat uses single model per message, selectable via ModelSelector.

### Video Models (fal.ai)
Defined in `types/api.ts` as `AVAILABLE_VIDEO_MODELS`. Default: `fal-ai/bytedance/seedance/v1.5/pro/image-to-video` (Seedance 1.5 Pro).
All image-to-video only (require start frame). VideoPromptBar uses single model select (no @mentions/collections — not supported by video API). `useVideoGeneration` fires via fal.ai queue API, stores estimated cost on completion.
Models: Kling v3 Standard, Kling v3 Pro, Seedance 1.5 Pro. Separate `falApiKey` setting from OpenRouter.
Videos saved as MP4 in `{userData}/ImageStudio/videos/`. Gallery shows both images and videos (filterable). Videos auto-play on hover in grid view. Video export uses direct file copy (no Canvas conversion).

## Critical Rules
- Tailwind CSS v4: `@theme {}` in app.css — NEVER add `* {}` resets outside @layer
- Colors: surface-0..4, border-dim/base/bright, text-primary/secondary/muted, accent-main/dim/bright
- IPC: `ipcRenderer.invoke()` / `ipcMain.handle()` via preload
- Persistence: `window.api.saveHistory(key, json)` / `listHistory()` — stores use debounced persistence (500ms)
- Error handling: use `logger` from `lib/logger.ts` — NEVER use silent `catch {}` blocks
- API keys: OpenRouter + fal.ai stored in ~/Library/Application Support/Electron/, NEVER in source
- Generation: fire-and-forget, placeholder → complete pattern, non-blocking
- API response: images in `message.images[]`, NOT `message.content`
- Electron drag: use `no-drag` class on all interactive elements in top 48px
- Image uploads: always compress via `compressImage()` (JPEG 75%, max 1000px)
- Shared types: use `ImageRef` and `LabeledAttachment` from `types/api.ts` — don't redeclare locally
- Export: ExportPopover supports PNG/JPEG/WebP with quality slider for images (Canvas conversion), MP4 direct file copy for videos
- Workspaces: optional image organization, `workspaceId` on GalleryImage, auto-tag on generation
- License: MIT, fully open source
