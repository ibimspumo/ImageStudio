<p align="center">
  <img src="resources/icon.png" width="80" />
</p>

<h1 align="center">ImageStudio</h1>

<p align="center">
  A beautiful, open-source desktop app for AI image generation.<br/>
  Generate, iterate, organize — all in one place.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-blue" />
  <img src="https://img.shields.io/badge/platform-macOS-lightgrey" />
  <img src="https://img.shields.io/badge/electron-41-47848F?logo=electron&logoColor=white" />
</p>

---

<p align="center">
  <img src="docs/screenshot-gallery.jpg" width="800" alt="ImageStudio — Gallery with generated images" />
</p>

## What is ImageStudio?

ImageStudio is a native macOS app that lets you generate images using the best AI models — all through a single, polished interface. No browser tabs, no subscriptions, no clutter. Just you, your prompts, and your images.

You bring your own [OpenRouter](https://openrouter.ai) API key and pay only for what you use. ImageStudio supports multiple models from different providers, so you can compare results side by side.

---

## Download

Download the latest `.dmg` from the [Releases](https://github.com/ibimspumo/ImageStudio/releases) page.

> **Note:** ImageStudio is not signed with an Apple Developer certificate. macOS will block it on first launch. To fix this, open Terminal and run:
>
> ```bash
> xattr -r -d com.apple.quarantine /Applications/ImageStudio.app
> ```
>
> Then open ImageStudio normally from your Applications folder.

### Build from source

```bash
git clone https://github.com/ibimspumo/ImageStudio.git
cd ImageStudio
npm install
npm run dev          # Development with hot reload
npm run build:mac    # Build distributable .dmg
```

---

## Getting Started

When you first open ImageStudio, a settings dialog appears. Paste your [OpenRouter API key](https://openrouter.ai/keys) and you're ready to go.

<p align="center">
  <img src="docs/screenshot-settings.jpg" width="500" alt="Settings — paste your OpenRouter API key and see app info" />
</p>

---

## Generating Images

Type your prompt into the prompt bar at the bottom. Press **⌘ Enter** to generate.

<p align="center">
  <img src="docs/screenshot-prompt.jpg" width="800" alt="Type a prompt and generate" />
</p>

The prompt bar gives you full control over your generation:

- **+** button — attach reference images (moves above the text when images are attached)
- **Model selector** — choose which AI model to use
- **Aspect ratio** — pick from 10 visual presets or define a custom ratio
- **Resolution** — 1K, 2K, or 4K output
- **Image count** — generate up to 4 images at once
- **@** button — open your asset collections
- **⚙** — settings & about

Everything is non-blocking. You can fire off multiple generations and keep prompting while they render.

---

## Choosing a Model

ImageStudio supports 7 models from different providers. Click the model selector in the prompt bar to switch between them:

<p align="center">
  <img src="docs/screenshot-models.jpg" width="800" alt="Model selector with 7 AI models" />
</p>

| Model | Provider | Notes |
|---|---|---|
| **Nano Banana Pro** | Google | Default. Fast, high quality. (Gemini 3.0 Pro) |
| **Nano Banana 2** | Google | Gemini 3.1 Flash — faster variant |
| **Riverflow 2 Pro** | Sourceful | Creative, artistic style |
| **Seedream 4.5** | ByteDance | Strong at photorealism |
| **GPT 5 Image mini** | OpenAI | Compact, fast |
| **GPT 5 Image** | OpenAI | Full-size, highest detail |
| **FLUX.2 Max** | Black Forest Labs | Excellent prompt following |

### Compare models side by side

Select multiple models using the checkboxes, then generate. ImageStudio fires off a request to each model in parallel, so you get results from all of them at the same time. Great for finding out which model handles your prompt best.

---

## Aspect Ratios

Click the aspect ratio button to choose from 10 presets — each shown as a visual box so you can immediately see the shape. Need something custom? Use the custom ratio input at the bottom with a live preview. Both fields are required before you can apply.

<p align="center">
  <img src="docs/screenshot-aspectratio.jpg" width="800" alt="Aspect ratio selector with visual previews and custom ratio" />
</p>

**Presets:** 1:1, 3:4, 4:3, 2:3, 3:2, 9:16, 16:9, 5:4, 4:5, 21:9

**Custom:** Enter any width:height ratio (e.g. 7:3) and click Apply.

---

## Reference Images & Collections

### Attach reference images

Click the **+** button in the prompt bar or drag & drop images directly onto it. When images are attached, they appear as thumbnails above the text field with a small **+** to add more. Remove all images and the **+** returns inline. These references are sent alongside your prompt for image-to-image editing — style transfer, face swaps, composition matching, etc.

### Crop to Reference

Hover over any gallery image and click the crop icon, or use "Crop as Reference" in the lightbox. This opens a full-screen crop tool where you can draw a selection on the image. The cropped area is added as a reference to your prompt bar — perfect for isolating a face, texture, or detail from an existing generation.

### Asset Collections

Create named groups of reference images (e.g. `@brand-photos`, `@product-shots`). Type **@** in the prompt to mention a collection inline. The images are automatically prepared and attached.

Collections with more than 5 images are intelligently composited into grid layouts to stay within API limits.

---

## AI Zoom Out

Want to see what's beyond the edges of an image? In the lightbox, use the **Zoom Out** buttons (1.5x, 2x, 3x, 4x) to extend your image outward. ImageStudio sends the original image as a reference to the same AI model that created it, with a prompt to seamlessly continue the scene. The result appears as a new image in your gallery at the same resolution.

---

## Image Chat Mode

Want to iteratively refine an image? Hover over any image in the gallery and click the chat icon. This opens a conversation where each message builds on the previous result.

<p align="center">
  <img src="docs/screenshot-chat.jpg" width="800" alt="Chat mode — iteratively edit images in conversation" />
</p>

- The last generated image is automatically attached as a reference
- You can switch models between messages
- You can attach additional reference images
- All chat-generated images also appear in your gallery

When you open a chat from an image, the model that originally created that image is pre-selected — so you continue with the same model by default.

---

## Lightbox & Image Details

Click any image to open it in the lightbox. The info panel on the right shows everything about the image at a glance.

<p align="center">
  <img src="docs/screenshot-lightbox.jpg" width="800" alt="Lightbox with image details, prompt, model info, and actions" />
</p>

The info panel includes:

- **Prompt** — with a copy button
- **Model** — which AI model was used (shown as a readable name)
- **Size** — aspect ratio, resolution, and pixel dimensions
- **Duration** — how long the generation took
- **Cost** — how much the API call cost (fetched from OpenRouter)
- **Date** — when the image was created
- **Chat origin** — if the image came from a chat, click to reopen it
- **Reference images** — click to navigate to that image in the lightbox (if it's in your gallery)

### Actions

- **Reuse Prompt** — paste the prompt back into the prompt bar
- **Start Chat / Continue Chat** — open an editing conversation from this image
- **Crop as Reference** — select a region of the image to use as reference
- **Zoom Out** — extend the image outward by 1.5x, 2x, 3x, or 4x using AI
- **Copy** — copy the image to your clipboard
- **Save** — quick export as PNG, or click the dropdown arrow to choose format and quality
- **Delete** — remove from your gallery

### Export with format & quality

Click the dropdown arrow next to "Save" to open export options:

- **Format** — PNG, JPEG, or WebP
- **Quality slider** — for JPEG and WebP, adjust from 10% to 100%
- **Live file size** — see the estimated file size update in real time
- **Savings indicator** — shows how much smaller the file is compared to the original

---

## Workspaces

As your gallery grows, workspaces help you stay organized. Think of them as lightweight folders for your images.

- **By default, you work without a workspace** — all images are visible
- Click **+ Workspace** below the title bar to create one
- When a workspace is active, new generations automatically go into it
- Move existing images between workspaces via the folder icon on hover
- Switch back to **All** to see everything

Each workspace gets its own color. Images in a workspace show a subtle colored bar at the bottom. Right-click a workspace tab to rename or delete it.

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `⌘ Enter` | Generate images |
| `@` | Reference images/collections in prompt |
| `←` `→` | Navigate images in lightbox |
| `Escape` | Close lightbox, chat, or dialogs |
| `Enter` | Confirm crop selection |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [Electron](https://www.electronjs.org/) + [electron-vite](https://electron-vite.org/) |
| UI | [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) |
| Styling | [Tailwind CSS v4](https://tailwindcss.com/) |
| State | [Zustand](https://zustand.docs.pmnd.rs/) |
| Icons | [Lucide React](https://lucide.dev/) |
| AI | [OpenRouter API](https://openrouter.ai/) |

---

## Architecture

```
src/
├── main/                 # Electron main process
│   ├── ipc/              # IPC handlers (generation, files, settings)
│   └── services/         # OpenRouter client, image storage
├── preload/              # Typed context bridge (window.api)
└── renderer/src/         # React UI
    ├── components/
    │   ├── input/        # PromptBar, ModelSelector, AspectRatio, Resolution
    │   ├── gallery/      # Masonry grid, image cards
    │   ├── chat/         # Image chat modal
    │   ├── workspace/    # Workspace tabs and management
    │   ├── collections/  # Asset collection manager
    │   └── shared/       # Lightbox, CropModal, ExportPopover, Settings
    ├── stores/           # Zustand (gallery, collections, chat, settings, workspace, crop)
    ├── hooks/            # useImageGeneration, useChatGeneration
    ├── types/            # API types, model definitions
    └── lib/              # Utils, image compression
```

---

## Releases

Releases are built automatically via GitHub Actions when a version tag is pushed:

```bash
git tag v1.0.0
git push origin v1.0.0
```

This triggers a build on macOS, packages the app as `.dmg` and `.zip`, and creates a GitHub Release with the artifacts and auto-generated changelog.

---

## Data & Privacy

- Your API key is stored locally in `~/Library/Application Support/Electron/`
- All images and settings are stored locally on your machine
- ImageStudio never sends data anywhere except to OpenRouter for image generation
- No analytics, no tracking, no accounts

---

## License

MIT — free and open source. Do whatever you want with it.

## Contributing

Contributions are welcome. Please open an issue first for major changes.
