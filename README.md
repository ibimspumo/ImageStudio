<p align="center">
  <img src="resources/icon.png" width="80" />
</p>

<h1 align="center">ImageStudio</h1>

<p align="center">
  Open-source AI image generation desktop app for macOS.<br/>
  Powered by <a href="https://openrouter.ai/google/gemini-3-pro-image-preview">Gemini 3.0 Pro Image Preview</a> via <a href="https://openrouter.ai">OpenRouter</a>.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-blue" />
  <img src="https://img.shields.io/badge/platform-macOS-lightgrey" />
  <img src="https://img.shields.io/badge/electron-41-47848F?logo=electron&logoColor=white" />
  <img src="https://img.shields.io/badge/react-19-61DAFB?logo=react&logoColor=white" />
  <img src="https://img.shields.io/badge/tailwind-4-38BDF8?logo=tailwindcss&logoColor=white" />
</p>

---

<p align="center">
  <img src="docs/screenshot-empty.jpg" width="800" alt="ImageStudio — Empty State" />
</p>

<p align="center">
  <img src="docs/screenshot-prompt.jpg" width="800" alt="ImageStudio — Prompt" />
</p>

<p align="center">
  <img src="docs/screenshot-settings.jpg" width="400" alt="Settings" />
  <img src="docs/screenshot-collections.jpg" width="400" alt="Collections" />
</p>

## Features

- **AI Image Generation** — Generate images from text prompts with Gemini 3.0 Pro
- **Non-blocking** — Fire multiple generations at once, prompt stays in place
- **Aspect Ratio & Resolution** — 1:1, 16:9, 9:16, 4:3, 3:4 at 1K, 2K, or 4K
- **Batch Generation** — Generate up to 4 images simultaneously
- **Reference Images** — Drag & drop images into the prompt box for image-to-image editing
- **Inline @-Mentions** — Type `@` to reference images or collections inline in your prompt
- **Asset Collections** — Named groups of reference images (e.g. `@brand-assets`), reusable across prompts
- **Smart Collections** — Large collections (>5 images) auto-composite into grids for API limits
- **Image Chat Mode** — Iterative editing chain from any image, auto-references previous result
- **Lightbox** — Arrow key navigation, metadata panel with dimensions/duration/prompt, reuse prompt
- **Persistence** — Gallery, collections, chats, and settings saved locally across restarts
- **Drag & Drop** — Drag generated images as references, drop files into the prompt box
- **Export** — Save to disk, copy to clipboard, drag to Finder
- **Image Compression** — All uploads auto-compressed to JPEG 75%, max 1000×1000px
- **Dark Mode** — Premium dark UI with subtle glow effects and glass morphism

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [Electron](https://www.electronjs.org/) + [electron-vite](https://electron-vite.org/) |
| UI | [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) |
| Styling | [Tailwind CSS v4](https://tailwindcss.com/) |
| State | [Zustand](https://zustand.docs.pmnd.rs/) |
| Icons | [Lucide React](https://lucide.dev/) |
| AI | [OpenRouter API](https://openrouter.ai/) → Gemini 3.0 Pro Image Preview |

## Getting Started

### Prerequisites

- **Node.js** 20+
- **macOS** (Apple Silicon or Intel)
- **OpenRouter API Key** — [Get one free](https://openrouter.ai/keys)

### Install & Run

```bash
git clone https://github.com/ibimspumo/ImageStudio.git
cd ImageStudio
npm install
npm run dev
```

### Build

```bash
npm run build
```

### Configuration

1. Open the app
2. Click the ⚙ icon in the prompt bar → Settings
3. Paste your OpenRouter API key
4. Start generating

## Usage

| Action | How |
|---|---|
| Generate | Type prompt, press `⌘ Enter` |
| Attach reference | Drop image onto prompt box, or click "Attach" |
| @-mention | Type `@` to pick from images/collections |
| Batch generate | Use the `−` `1x` `+` counter (up to 4) |
| Create collection | Click 📁 → New Collection → name + upload images |
| Edit iteratively | Hover image → 💬 chat icon → type edits |
| Browse lightbox | Click image → arrow keys to navigate |
| Export | Hover image → download/copy buttons |
| Delete | Hover image → 🗑 trash icon (top-right) |

## Architecture

```
src/
├── main/              # Electron main process
│   ├── ipc/           # IPC handlers (generation, files, settings)
│   └── services/      # OpenRouter client, image storage
├── preload/           # Typed context bridge (window.api)
└── renderer/src/      # React UI
    ├── components/
    │   ├── input/     # PromptBar, selectors, @-mentions
    │   ├── gallery/   # Masonry grid, image cards
    │   ├── chat/      # Image chat modal
    │   ├── collections/ # Asset collection manager
    │   └── shared/    # Lightbox, settings, dialogs
    ├── stores/        # Zustand (gallery, collections, chat, settings)
    ├── hooks/         # useImageGeneration, useChatGeneration
    └── lib/           # Utils, image compression, grid composites
```

## License

MIT — free and open source.

## Contributing

Contributions welcome. Please open an issue first for major changes.
