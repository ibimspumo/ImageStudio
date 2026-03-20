# CLAUDE.md

## IMPORTANT: Keep README.md and CLAUDE.md up to date with ANY changes.
When features are added/changed, update README.md (features list, usage table, architecture).
When screenshots change visually, regenerate them: `node test-readme-screenshots.mjs` (needs dev server running).
When architecture changes, update the tree below.

## Build & Run
```bash
npm run dev                # Dev with hot reload
npm run build              # Production build
npx electron-vite build    # Build check only (no Electron)
```

## Architecture
- `src/main/` — Electron main process (IPC, API, files)
- `src/preload/` — Typed context bridge (`window.api`)
- `src/renderer/src/` — React UI
  - `stores/` — Zustand: gallery, collections, chat, settings, workspace
  - `hooks/` — useImageGeneration, useChatGeneration
  - `types/api.ts` — AspectRatio, Resolution, AVAILABLE_MODELS, getModelName
  - `components/input/` — PromptBar (contentEditable, @-mentions, chips), ModelSelector, AspectRatioSelector (visual boxes + custom), ResolutionSelector, ImageCountSelector
  - `components/gallery/` — Masonry grid, image cards with hover actions (save, copy, chat, move-to-workspace)
  - `components/chat/` — ChatView (iterative editing with per-message model selection)
  - `components/workspace/` — WorkspaceBar (pill tabs, create, rename, delete, filter gallery)
  - `components/shared/` — ImageViewer (lightbox with chat origin), SimpleLightbox, ExportPopover (format/quality/filesize), SettingsDialog
  - `components/collections/` — Asset collection CRUD
  - `lib/image-utils.ts` — compressImage, createGridComposite, prepareCollectionImages

## Models
Defined in `types/api.ts` as `AVAILABLE_MODELS`. Default: `google/gemini-3-pro-image-preview` (Nano Banana Pro).
Multi-model generation: PromptBar allows selecting multiple models; `useImageGeneration` fires one request per model × imageCount.
Chat uses single model per message, selectable via ModelSelector.

## Critical Rules
- Tailwind CSS v4: `@theme {}` in app.css — NEVER add `* {}` resets outside @layer
- Colors: surface-0..4, border-dim/base/bright, text-primary/secondary/muted, accent-main/dim/bright
- IPC: `ipcRenderer.invoke()` / `ipcMain.handle()` via preload
- Persistence: `window.api.saveHistory(key, json)` / `listHistory()`
- API key: stored in ~/Library/Application Support/Electron/, NEVER in source
- Generation: fire-and-forget, placeholder → complete pattern, non-blocking
- API response: images in `message.images[]`, NOT `message.content`
- Electron drag: use `no-drag` class on all interactive elements in top 48px
- Image uploads: always compress via `compressImage()` (JPEG 75%, max 1000px)
- Export: ExportPopover supports PNG/JPEG/WebP with quality slider, conversion via Canvas in renderer
- Workspaces: optional image organization, `workspaceId` on GalleryImage, auto-tag on generation
- License: MIT, fully open source
