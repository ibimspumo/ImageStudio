# ImageStudio

A local AI image generation desktop app for macOS, powered by Google Gemini 3.0 Pro (Nano Banana) via OpenRouter.

![ImageStudio](resources/icon.png)

## Features

- **AI Image Generation** — Generate images from text prompts using Gemini 3.0 Pro Image Preview
- **Non-blocking Generation** — Fire multiple generations without waiting, prompt stays in place
- **Aspect Ratio & Resolution** — Choose from 1:1, 16:9, 9:16, 4:3, 3:4 at 1K, 2K, or 4K
- **Batch Generation** — Generate up to 4 images simultaneously
- **Reference Images** — Drag & drop images into the prompt box as references for image editing
- **Inline @-Mentions** — Type `@` to reference attached images or collections inline in your prompt
- **Asset Collections** — Create named collections of reference images (e.g. `@brand-assets`) reusable across prompts
- **Smart Collection Handling** — Large collections (>5 images) are automatically composited into grid images for optimal API usage
- **Image Chat Mode** — Start an iterative editing chain from any generated image, with automatic reference passing
- **Lightbox Viewer** — Full-screen image viewer with arrow key navigation, metadata panel, prompt reuse
- **Gallery Persistence** — All generated images are saved and restored on app restart
- **Drag & Drop** — Drag generated images as references, drop external images into prompts
- **Export** — Save, copy to clipboard, or drag images to Finder/other apps

## Tech Stack

- **Electron** + **electron-vite** — Desktop app framework
- **React** + **TypeScript** — UI
- **Tailwind CSS v4** — Styling
- **Zustand** — State management
- **OpenRouter API** — AI model gateway (Gemini 3.0 Pro Image Preview)

## Getting Started

```bash
# Install dependencies
npm install

# Run in development
npm run dev

# Build for production
npm run build
```

### Configuration

1. Get an API key from [openrouter.ai/keys](https://openrouter.ai/keys)
2. Open the app → Settings (gear icon in the prompt bar)
3. Paste your OpenRouter API key

## Usage

1. **Generate images** — Type a prompt, choose settings, press `⌘ + Enter`
2. **Use references** — Drop images into the prompt box or click "Images" to upload
3. **@-mention references** — Type `@` to insert image/collection references inline
4. **Create collections** — Click the folder icon → create a named set of images
5. **Iterative editing** — Click "Start Chat" on any image to begin an editing chain
6. **Browse results** — Click images to open the lightbox, use arrow keys to navigate

## License

ISC
