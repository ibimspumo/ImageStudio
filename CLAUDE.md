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
  - `stores/` — Zustand: gallery, collections, chat, settings
  - `hooks/` — useImageGeneration, useChatGeneration
  - `components/input/` — PromptBar (contentEditable, @-mentions, chips)
  - `components/gallery/` — Masonry grid, image cards with hover actions
  - `components/chat/` — Image chat modal (iterative editing)
  - `components/shared/` — ImageViewer, SimpleLightbox, SettingsDialog
  - `components/collections/` — Asset collection CRUD
  - `lib/image-utils.ts` — compressImage, createGridComposite, prepareCollectionImages

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
- License: MIT, fully open source
