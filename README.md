<p align="center"><img src="resources/icon.png" width="80" alt="ImageStudio icon" /></p>
<h1 align="center">ImageStudio</h1>
<p align="center">An open-source desktop studio for AI images and videos, powered by your fal.ai key.</p>

## The studio

ImageStudio runs locally on macOS and Windows. The interface uses an anthracite palette, a lime accent, permanent sidebar navigation and a single context header. The sidebar uses a light variant of the brand icon; app settings and native packaging use the original dark icon. Images stay central; creation controls live in a stable bottom composer instead of stacked toolbars. A dark upward-fading backdrop keeps its cost and shortcut hints readable over the gallery.

| Area | What you can do |
|---|---|
| **Bild** | Generate images with one or several models; attach references and compare results. |
| **Thumbnail** | Generate 16:9 thumbnails with project context, styles, face fidelity and saved meta-prompts; preview on YouTube layouts and export at 1920 × 1080. |
| **Video** | Animate a start image with a motion prompt, model, duration and supported audio/camera options. |
| **Logo** | Generate transparent PNG logos with models that support alpha output. |
| **Print** | Design flat posters, flyers and business cards with print formats, typography-focused art direction and saved custom rules, using all image models. |
| **Mediathek** | Browse images and videos, search prompts, filter, favorite, tag, import and organize media. |
| **Referenzen** | Manage named image collections and use their exact @-mentions in prompts. |
| **Stile & Vorlagen** | Manage reusable prompt presets. Thumbnail meta-prompts remain available in thumbnail controls. |
| **Projekte** | Manage working folders and thumbnail video projects without mixing their distinct grouping rules. |
| **Aktivität** | See running, completed and failed jobs, confirmed/estimated costs and the sequential image queue. |
| **Einstellungen** | Configure the provider, generation/export processing, local AI connection and app updates. |

**Chat and Inpaint have been removed from both the UI and MCP.** Existing media, legacy history files and source metadata remain on disk. Use **Variante erstellen** to attach a completed image to the normal composer and preserve its model/format, with transparency retained for alpha sources. Preparing a variant does not generate or charge; describe the change and submit when ready.

## Download

Download the latest release for your platform from the [Releases](https://github.com/ibimspumo/ImageStudio/releases) page.

| Platform | File | Notes |
|---|---|---|
| **Windows** | `.exe` installer or `.zip` portable | SmartScreen may warn on first launch — click "More info" → "Run anyway" |
| **macOS** | `.dmg` disk image | Unsigned — see below |

> **macOS note:** ImageStudio is not signed with an Apple Developer certificate. macOS will block it on first launch. To fix this, open Terminal and run:
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
npm run build:mac    # Build distributable .dmg (macOS)
npm run build:win    # Build distributable .exe (Windows)
```

---

## Getting started

On first launch without a key, **Einstellungen → Anbieter** opens. Paste your [fal.ai API key](https://fal.ai/dashboard/keys) and save. The same key covers images, videos and reference uploads.

Choose a creation area in the sidebar, write a prompt and press **⌘/Ctrl Enter** or **Generieren**. Model, count and generation cost stay near the prompt. Secondary parameters live in the format/options menu (**Alle weiteren Einstellungen**) and only appear when the selected model supports them. The composer stays expanded and retains its draft when opening organization or settings pages.

Attach images from files, the gallery or collections. Place their markers in the relevant sentence:

> Use the person from [@Timo], wearing the outfit from [Image 1], in the room from [Image 2].

Mentioning an image does not attach it: both the media and its marker are required. Reference images upload automatically to fal.ai storage; the upload cache is keyed by content and cleared when your API key changes.

Video uses one dedicated start image. Describe its subjects and motion directly; video/audio references and end frames are not supported. The available video models are Seedance 1.5 Pro (default), Kling v3 Standard and Kling v3 Pro. The model selector provides their supported durations and resolutions.

Sidebar creation entries return to the complete mode overview. Inside a project/folder, click its parent breadcrumb to leave it; **Studio** opens the global library. Settings drafts survive switching to another section.

## Image models

The app registry defines capabilities, defaults and list-price estimates. Prices below are estimates, not provider invoices; consult the live app before submitting.

| Model | Provider | Aspect ratios | Resolution | Reference images | Seed | Price |
|---|---|---|---|---|---|---|
| **GPT Image 2.5 Flare** | OpenAI | standard ratios and custom pixels | 1K–4K presets, six quality settings | up to 16 | no | high 1024²: ~$0.05268 |
| **GPT Image 2.5 Sunburst** (default in all image modes) | OpenAI | standard ratios and custom pixels | 1K–4K presets, six quality settings | up to 16 | no | same published estimates as Flare |
| **Nano Banana 2** | Google | 15, incl. 4:1 and 8:1 | 0.5K–4K | up to 14 | yes | $0.08 at 1K, ×1.5 at 2K, ×2 at 4K |
| **Nano Banana 2 Lite** | Google | 15, incl. 4:1 and 8:1 | fixed 1K | up to 14 | yes | ~$0.048 per image |
| **Nano Banana Pro** | Google | 11 standard ratios | 1K–4K | up to 14 | yes | $0.15, ×2 at 4K |

Flare favors fast everyday generation; Sunburst favors intricate detail and precise editing with longer generation times. Both currently have the same published fal pricing, so Sunburst is not presented as a confirmed more expensive tier. High quality is the default in all image creation modes. The available quality settings are `auto`, `low`, `medium`, `high`, `xhigh` and `max`; higher settings increase detail, latency and token consumption. Both accept up to 16 references, 10 outputs per request and 32,000 prompt characters.

Both support `background: auto | transparent | opaque` and PNG, JPEG or WebP output. Logo mode defaults to Sunburst and defaults to transparency and pins PNG while offering ratios, resolutions and custom dimensions. Normal image mode also exposes background and output options. `outputCompression` accepts 0–100 only for JPEG/WebP. Neither model supports seed or input fidelity controls. Enabled JPEG post-processing can change the provider's format/compression for opaque images; transparency is preserved and stored MIME types describe the actual file.

**Custom pixels:** the size controls and MCP share the same normalization: each positive width/height rounds upward to a multiple of 16, then the final size must have edges at most 3840 px, a longest/shortest ratio at most 3:1 and 655,360–8,294,400 total pixels. Linked dimensions follow the chosen ratio with grid rounding; the resulting pixels are shown before generation. The A4 preset is exact-ratio **2240 × 3168**. A4 at 300 dpi exceeds the generation area limit. MCP can submit explicit dimensions and inspect the normalized effective size. Thumbnails use **1920 × 1088** for these models and export to exact **1920 × 1080**.

Pricing remains an estimate: fal publishes high-quality 1024² at $0.05268 and 1920 × 1080 at $0.03960. The latter is only an approximate reference for the valid, rounded 1920 × 1088 request; custom sizes and prompt/reference token usage affect actual charges. Only matched billing events establish provider-reported cost. Sources checked 2026-09-09: [Flare](https://fal.ai/models/openai/gpt-image-2.5/flare/text-to-image), [Sunburst](https://fal.ai/models/openai/gpt-image-2.5/sunburst/text-to-image), [generation schema](https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=openai/gpt-image-2.5/flare/text-to-image), [edit schema](https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=openai/gpt-image-2.5/sunburst/edit).

GPT Image 2 and 1.5 are retired from generation choices. Saved defaults/aliases migrate to supported models; existing media, original model IDs in historical metadata and legacy histories are preserved.

Every control in the prompt bar reflects what the selected model genuinely accepts — options a model
does not have are hidden rather than silently ignored. None of the five support a negative prompt, so
that control does not exist for images. Pick several models at once and the strictest limits apply,
while values a given model cannot take are mapped to its nearest supported one.

## Working with results

Open a gallery image to view its prompt, model, dimensions, timing, tags and references. The viewer groups actions into using the image, editing and exporting:

- Create a variant, reuse its prompt, crop a reference or use it as a video's start frame.
- Upscale with dedicated Topaz models or remove a background with BRIA; both save a new PNG and preserve the original.
- Extend an image with zoom out or change its aspect ratio using generative outpainting.
- Compare related results with their source, including retained legacy source links.
- Export images as PNG, JPEG or WebP with quality, size and metadata controls. Videos retain their original format through direct file export.

Thumbnail export produces an exact 1920 × 1080 JPEG and targets YouTube's 2 MB limit. Transparent images retain their alpha channel through PNG storage. Optional JPEG post-processing is configured under **Einstellungen → Generierung & Export** and does not apply to Print artwork, transparent images, dedicated processing results or videos. Processing retains provider bytes without an additional JPEG/resampling pass; PNG is default, and transparent output always remains PNG.

Canvas remains available as a sketch-based creation workflow with drawing tools, layers and simple/expert modes. Favorites, tags, search, filters and organization remain available. Deleting a folder or thumbnail project detaches its media; it does not delete those files.

Activity shows gallery jobs and the sequential image queue. Queue pause stops subsequent queued work; it does not imply provider cancellation. All spend figures describe retained local media, with missing costs reported separately. They are neither a provider balance nor a complete billing ledger. Duration estimates use historical samples and are not guarantees.

### Dedicated Upscale and Background Remove

Open a completed or imported **PNG, JPEG or WebP** in the gallery. Under **Bild optimieren**, choose the upscale options or use **Hintergrund entfernen**. The action shows dimensions and a USD list-price estimate before the paid button. Progress appears in the gallery and Activity. The original remains unchanged; the new result keeps its source link, folder, thumbnail project and logo classification.

| Operation | fal.ai model | Default / output | List estimate, checked 2026-09-08 |
|---|---|---|---|
| Faithful upscale | `topaz/upscale/image/precision` | High Fidelity V3, 2×; adjustable 1–4×; PNG or JPEG | $0.08 per started 24 output MP |
| Transparent upscale | `topaz/upscale/image/transparent` | Automatically selected for actual transparency; fixed 4×; PNG | $0.08 per started 24 output MP |
| Background removal | `fal-ai/bria/background/remove` | BRIA RMBG 2.0; transparent PNG | $0.018 per image |

Precision also offers Standard V2, High Fidelity V2, Low Resolution V2, CGI and Text Refine, plus supported face, sharpening, denoising and crop-to-fill settings under **Feineinstellungen**. Transparency is inspected from source pixels, including imports with missing metadata. Precision cannot be selected for an alpha source. Transparent has a fixed 4× factor; PNG output alone is not a promise that another model preserves alpha.

The old preservation prompt, browser pre-upscale and JPEG reference compression are removed. Processing uploads the original file directly. Default output stays PNG even with anti-detection enabled; Precision can explicitly output JPEG. **ImageStudio adds no pixel/4K limit and no limit on repeated upscale passes.** Only the documented per-pass factors apply. fal publishes no total-pixel guarantee for these endpoints, so provider resource limits may still cause a request to fail. Native file inspection and streamed storage avoid browser Canvas limits; large results use a separate display preview, while later upscales and exports read the full original. BRIA's public description mentions up to 1024×1024 while its API has no explicit dimension limit. The model card uses 1024² internally and resizes the mask back onto the original. The app measures actual result dimensions instead of interpreting 1024 as a confirmed fal output limit. [Research and model-selection rationale](docs/image-processing-research-2026-09-08.md).

MCP uses `image_edit_options` for source information, models and constraints; `preview_image_processing` for a read-only estimate; and `image_upscale` / `image_remove_background` to start jobs. `image_upscale` accepts `imageId`, optional `model: "precision" | "transparent"`, `scale` and the discovered precision options. The former `resolution: "2K" | "4K"` and generative-model arguments are retired. Poll `get_status`, inspect `generation_details`, display `read_image` and export through `image_export` or `export_media`. The same hooks, normalized options, billing reconciliation and files serve both interfaces.

### Confirmed fal.ai costs
After generation, the app can reconcile saved request IDs with [fal.ai Billing Events](https://fal.ai/docs/platform-apis/v1/models/billing-events). These report request totals after discounts and require an **Admin API key**. Under **Einstellungen → Anbieter**, optionally enter a separate billing Admin key; otherwise the existing key is tried. Activity offers **Kosten mit fal.ai abgleichen**. Matching also runs after completed jobs and on startup.

Confirmed amounts replace the displayed estimate while retaining the original estimate and provenance. Missing events, unavailable permissions and older results without a request ID remain labeled as estimated/unknown. Before generation, prices remain estimates. Activity separates confirmed and unconfirmed subtotals for the retained gallery; this is not your full fal.ai account statement. MCP uses the same `refresh_costs` action and state.

## Print design

Choose **Print** for posters, flyers and business cards. It uses the ordinary image model catalog and your saved image default (Sunburst by default), with High quality. Presets cover A3, A4 and A5 in both orientations, 85 × 55 mm business cards in both orientations, DIN lang and square flyers; **Freies Format** exposes the usual ratio and pixel controls.

The shared design prompt emphasizes reading order, deliberate typography, invisible alignment grids, flat color areas, whitespace and one visual idea. A short production contract is also composed next to the brief so contrast, flat artwork and copy limits reach every provider. It produces a single flat layout instead of a paper mockup or a collage. Choose automatic art direction, graphic/Swiss, editorial, bold or elegant styling. **Gestaltungsregeln** shows the composed rules and lets you save your own brand direction. Format, style and custom rules persist and are shared with MCP. Attach logos, products and layout references using the same inline mentions as other image modes.

Millimeter values describe the intended trim size. The composer shows requested pixels and approximate effective ppi; the viewer uses measured result pixels. GPT models use canonical normalized preset pixels; ratio-based models use their nearest supported ratio, so dimensions can differ. A4 uses 2240 × 3168 pixels (about 271 ppi at A4), while A3 has fewer ppi at its larger physical size. These are raster artworks, not editable InDesign/vector documents or automatically prepared CMYK/PDF/X files with bleed. Verify generated text and the printer's production requirements. Print storage preserves provider bytes without the optional JPEG/resampling pass, keeping type and flat edges intact.

MCP discovers formats/styles/defaults in `get_capabilities.print`. Use `preview_generation` / `generate` with `mode: "print"`, `printFormat`, `printStyle` and optional `customMetaPrompt`; omit custom rules to use saved `printPrompt`, or send an empty string to disable them. Set `printFormat: "custom"` for explicit `imageSize` or `aspectRatio`/`resolution`. `navigate`, live draft tools, `list_images`, variants, processing and exports retain Print classification through the same app state. Import existing designs with `import_media` using `importMode: "print"` and optional `printFormat`, or use Import while in Print; original pixels remain unchanged. [Design research and example briefs](docs/print-design-research.md).

## Connect an AI tool

Open **Einstellungen → KI-Verbindung**, enable the local connection and choose **Einrichtung kopieren**. Paste the setup prompt into a local MCP-capable client. It contains the connection details and a direct HTTP fallback if a new client session is required to discover MCP tools.

Agents use the same running app, stores, reference markers and generation pipeline. They can discover models, preview composed prompts/costs, import media, edit live drafts, generate images/videos, inspect jobs, organize files and export results. `get_draft`, `update_draft` and `generate_draft` operate on the actual mounted editor. `navigate` exposes creation modes plus `library`, `references`, `styles`, `projects`, `activity` and `settings`; `collections`, `presets` and `queue` remain navigation aliases. `navigate` with `target: "create_variant"` prepares a completed image for editing without a paid request.

`collections` returns each collection's exact `promptReference`; pass its ID in `collectionIds` and use that marker in your prompt. Individual `references` map to `[Image 1]`, `[Image 2]`, etc. Collections do not change that numbering. `preview_generation` reports composed rules and whether supplied references are mentioned. Completed images can be returned as native MCP image content; video resource links and local paths depend on the client's rendering support.

Keep the app running. The connection is disabled by default, binds only to `127.0.0.1` (default port `48765`) and requires a separate revocable token. The local endpoint is not reachable through a remote cloud runner's own loopback address. Connected clients can perform the same paid generations as the UI. Provider credentials are redacted from ordinary discovery/status and require an explicit credential tool.

Both standard Streamable HTTP MCP (`/mcp`) and authenticated HTTP fallback (`GET /health`, `GET /api/tools`, `POST /api/call`) share tool implementations. See [AGENTS.md](AGENTS.md) for mandatory UI/MCP parity and [CLAUDE.md](CLAUDE.md) for architecture and model implementation guidance.

## Development and verification

```bash
npm run build
npx tsc --noEmit -p tsconfig.web.json
npx tsc --noEmit -p tsconfig.node.json
npm run test:automation
npm run test:automation:app
npm run test:ui:surfaces
```

The automation suite covers transport, validation and generation lifecycle behavior. GPT Image 2.5 changes require provider-contract checks plus disposable UI/MCP parity checks for model discovery/defaults, size normalization, output controls and shared generation state. The app smoke test launches real Electron with a disposable profile and MCP client, checks both directions of sidebar navigation, removed tools, inline draft references and variant preparation, and runs image → image → video with mocked provider responses. Dedicated-processing checks exercise UI and MCP upscaling/removal, original PNG uploads, alpha preservation with anti-detection enabled, parent/folder/project metadata and native PNG export. Provider-unit tests verify the exact dedicated endpoints, singular output shape, cost boundaries and cancellation. The extended checks include breadcrumb/sidebar exits, creation menus, export options, deletion and simulated exact billing. The supporting UI suite covers settings drafts, collection/preset/project CRUD and actual canvas drawing, undo/redo and local PNG export. These tests do not make paid provider requests.

For a settings screenshot from that disposable test, set `IMAGESTUDIO_TEST_SCREENSHOT` to an absolute PNG output path when running `npm run test:automation:app`. Older images under `docs/` predate the redesign and are not shown here as current UI captures.

## Architecture

- `src/shared/`: canonical generation and dedicated-processing model capabilities, validation, pricing, reference markers and logo/thumbnail/print prompt composition.
- `src/main/`: Electron IPC, fal.ai clients, uploads, media storage/export, updates and authenticated local automation.
- `src/preload/`: typed `window.api` bridge.
- `src/renderer/src/App.tsx` and `components/layout/`: sidebar routes, context header, gallery and persistent composer shell.
- `src/renderer/src/automation/`: live tool registry, draft bridge and shared queue runner.
- `src/renderer/src/components/`: creation controls, gallery/viewer, references, projects, presets, activity, settings and canvas.
- `src/renderer/src/lib/`: shared media actions, variant preparation, organization deletion, cost totals, reference packing and export.
- `src/renderer/src/stores/`: Zustand state backed by the same local histories for UI and MCP.

The stack is Electron, React 19, TypeScript, Tailwind CSS v4, Zustand, Lucide and Sharp for native large-image inspection/previews/export. GitHub Actions packages releases when a version tag is pushed. Updates are checked from settings; downloads start only after user action. Unsigned macOS updates open the disk image for manual installation.

## Data and privacy

Credentials and histories are stored locally. Generated/imported media live as files on disk. Prompts and reference images go to fal.ai for requested generations; URL imports contact the supplied source, and update checks/downloads contact GitHub. Local AI access is opt-in. Existing data migrations remain available, including legacy histories from removed features. There is no analytics or tracking.

## License and contributions

MIT. Issues and pull requests are welcome; discuss major changes before implementing them.

Read-only prompts use `PromptText` to highlight collection/image markers in gallery captions, the viewer and activity without changing copied or stored text. Gallery captions use a deeper bottom gradient. In image composers, pasting plain text restores exact, unambiguous live collection mentions (deduplicated), and image mentions already attached to the draft; unknown markers remain text. MCP prompt-only `update_draft` uses the same resolver. Explicit `collectionIds` still replaces the collection list. Text-only image markers cannot identify an unattached source image; use variant preparation or attach the source.

Sidebar folder and project entries offer a labelled trash button with inline confirmation and cancellation. Deleting keeps all media in the respective overview (All media / All thumbnails), preserves the other independent grouping, and uses the same organization actions as the management page and MCP.

## Sunburst default migration (v1.3.3)
GPT Image 2.5 Sunburst is the default for images, logos and thumbnails, including UI and MCP. On first launch after this update, every existing profile switches its saved image default to Sunburst, even if it previously selected Nano Banana or Flare. `shared/settings-migrations.ts` and the persisted internal `imageDefaultsRevision` marker make this a one-time migration; later explicit user selections survive restarts. Quality stays High; video defaults and existing media remain unchanged.

Print format selection in the composer header and pixel settings uses the same canonical catalog and live draft. DIN A uses A4 as the representative ratio; DIN lang 99/105 mm and business cards offer both orientations, with a 105 mm square. Preserve legacy format IDs for saved media and settings. MCP discovery exposes dimensions, normalized pixels and legacy status from the same registry.
