# CLAUDE.md

## Project
Electron + React + TypeScript image generation app using OpenRouter API (Gemini 3.0 Pro).

## Build & Run
```bash
npm run dev          # Development with hot reload
npm run build        # Production build
npx electron-vite build  # Build check (no Electron launch)
```

## Architecture
- `src/main/` — Electron main process (IPC handlers, API calls, file ops)
- `src/preload/` — Context bridge (typed `window.api`)
- `src/renderer/src/` — React UI
  - `stores/` — Zustand: gallery-store, collections-store, chat-store, settings-store
  - `hooks/` — useImageGeneration (gallery), useChatGeneration (chat mode)
  - `components/input/` — PromptBar (contentEditable + @-mentions + inline chips)
  - `components/gallery/` — Image grid with masonry layout
  - `components/chat/` — Image chat modal for iterative editing
  - `components/shared/` — ImageViewer (lightbox), SettingsDialog, DropZone
  - `components/collections/` — Asset collection management
  - `lib/image-utils.ts` — Grid composite creation for large collections

## Key Patterns
- Tailwind CSS v4 with `@theme {}` in app.css — DO NOT add global `* {}` resets outside @layer
- Custom colors: surface-0..4, border-dim/base, text-primary/secondary/muted, accent-main/dim
- IPC: `ipcRenderer.invoke()` / `ipcMain.handle()` — all exposed via preload
- Persistence: `window.api.saveHistory(key, json)` / `listHistory()`
- API key stored in user data dir, never in source code
- Non-blocking generation: fire-and-forget with placeholder → complete pattern

## API
OpenRouter endpoint. Response images in `message.images[]`, not `message.content`.
