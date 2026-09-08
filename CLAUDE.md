# CLAUDE.md

## Mandatory: app UI and MCP have 100% feature parity

Read and follow `AGENTS.md`. The app UI and local AI/MCP connection are equal interfaces to the same application. Every feature addition, change, bug fix and deprecation must update **both** interfaces together. A UI-only or MCP-only feature is incomplete.

Use shared domain actions, hooks, model registries, prompt composers and persistence; do not fork business logic for agents. All operations must act on the live app state and be visible immediately in both interfaces. Keep tool discovery, schemas, agent-readable descriptions, defaults, validation, results and errors synchronized with the UI. This includes every mode, projects/folders, settings, API-key access, model capabilities, custom meta-prompts, costs, asynchronous jobs and timing, media import from files/URLs, image/video retrieval, previews and export. Return usable media paths/links, MIME types and MCP image/resource content where supported by the client.

Verify affected functionality through both interfaces before declaring it complete. Expose paid/destructive side effects and distinguish estimated costs/durations from observed values. Keep credentials out of ordinary discovery/status; explicit key access is a separate tool. Any discovered parity gap must be named and resolved, never hidden behind a claim of full support. See `AGENTS.md` for the full parity contract.

## IMPORTANT: Keep README.md and CLAUDE.md up to date with ANY changes.
When features are added/changed, update README.md (features list, usage table, architecture).
Verify the integrated UI with `npm run test:automation:app` (real Electron, disposable profile, mocked providers). Set `IMAGESTUDIO_TEST_SCREENSHOT` to an absolute PNG path to capture its settings view. Old `docs/` screenshots predate the redesign; do not present them as current.
When architecture changes, update the tree below.

## Build & Run
```bash
npm run dev                # Dev with hot reload
npm run build              # Production build
npm run build:mac          # Package for macOS (.dmg)
npm run build:win          # Package for Windows (.exe)
npx tsc --noEmit -p tsconfig.web.json
npx tsc --noEmit -p tsconfig.node.json
npm run test:automation      # Renderer, transport and generation lifecycle
npm run test:automation:app  # Real Electron/MCP parity smoke, no paid requests
```

## Architecture
- `src/shared/` — code used by **both** main and renderer
  - `image-models.ts` — the fal.ai image model registry: endpoints, aspect ratios, resolutions, reference limits, per-model capability flags, **list prices**, plus `resolveAspectRatio`/`resolveResolution`/`toGptImageSize`/`toFixedImageSize`/`getCombinedCapabilities`/`normalizeModelId`/`estimateImageCost`/`formatCost`
  - `image-processing.ts` — canonical Topaz Precision/Transparent and BRIA registry, exact options/defaults, validation, PNG/JPEG output, provider limits, provider input mapping and list-price estimates
  - `thumbnail-prompt.ts` — the YouTube thumbnail system prompt (base rules, style blocks, face-fidelity block) plus the mode's locked constants and `buildThumbnailSystemPrompt()`
  - `logo-prompt.ts` — the logo system prompt (base rules, style blocks, transparency block, reference block) plus the mode's locked constants and `buildLogoSystemPrompt()`
  - `version.ts` — semver comparison for the updater
- `src/main/` — Electron main process (IPC, API, files)
  - `automation/` — opt-in loopback MCP server using the official SDK, authenticated HTTP fallback, persisted connection settings, setup prompt, trusted live-renderer bridge and media import/read/export
  - `services/image-processing-files.ts` — Sharp native dimensions/alpha inspection (no extra pixel cap), streamed original storage, separate display previews, native PNG/JPEG/WebP export and reusable prepared files
  - `services/fal-image-processing.ts` — original-file upload and dedicated queued fal.ai processing; dispatched by the existing image generation IPC with its progress/cancel/download lifecycle
  - `services/png-metadata.ts` — PNG metadata embedding shared by dialog export and automation export
- `src/preload/` — Typed context bridge (`window.api`)
- `src/renderer/src/` — React UI
  - `automation/` — validated agent tool catalog over the live stores and shared hooks, live editor draft bridge, image editing tools and app-level queue runner
  - `lib/media-actions.ts` — gallery import used by both the Import UI and MCP, retaining originals and extracting video previews
  - `lib/canvas-automation.ts`, `lib/canvas-generation.ts` — actual canvas renderer operations and shared canvas request preparation
  - `lib/image-processing.ts` — shared UI/MCP source-pixel alpha inspection and normalized processing preparation; native source inspection avoids Canvas size limits; submission uses the original file path, never persists image bytes inside generation options
  - `components/shared/ImageProcessingPanel.tsx` — original dimensions, registry-driven Topaz options/estimates and BRIA action in ImageViewer
  - `lib/image-editing.ts`, `lib/image-export.ts` — shared UI/MCP image transformation and export behavior
  - `components/shared/AutomationSection.tsx`, `MediaImport.tsx` — local connection controls and media URL/path import
  - `App.tsx`, `components/layout/StudioSidebar.tsx`, `TitleBar.tsx`, `MainContent.tsx` — route shell with a permanent sidebar, one context header, gallery and stable bottom composer. `StudioSection` includes image/video/thumbnail/logo, library, references, styles, projects, activity and settings; `AppMode` retains the last creation mode for support routes. Sidebar buttons expose `data-studio-section` and `aria-current="page"` for parity checks.
  - `app.css` — anthracite surfaces, lime accent and responsive studio shell; the sidebar becomes a drawer on narrow windows.
  - `stores/` — Zustand: gallery, collections, settings, workspace, crop, presets, queue, canvas, gallery-filter, thumbnail-projects, thumbnail-meta-prompts and ui-recents, backed by local histories.
  - `hooks/` — useImageGeneration, useVideoGeneration, useMentionEditor (contenteditable prompt and real inline reference chips), useImageRefs and useJustifiedLayout.
  - `types/api.ts` — image/video registries, mode rules and shared reference types.
  - `components/input/` — persistent expanded PromptBar and VideoPromptBar; model/count or duration controls, reference attachments, generation cost and secondary options in TunePanel (format/options summary, tooltip Alle weiteren Einstellungen). The DOM draft stays mounted across support routes. Video has one start frame and no image/collection mention syntax.
  - `components/gallery/` — justified image/video layout, toolbar/filter controls and cards with variant, reference, export and organization actions.
  - `components/workspace/ProjectsPage.tsx` — working folders and thumbnail video projects in one management page, preserving their independent store axes.
  - `components/shared/` — ImageViewer with grouped actions/details, ExportPopover, CropModal, ImageCompare, settings categories, update controls and local AI connection. Settings supports embedded rendering and explicit save/discard for local fields; connection controls apply immediately.
  - `components/thumbnail/`, `components/logo/` — mode-specific controls/prompt rules, thumbnail meta-prompts, preview surfaces and exact thumbnail export.
  - `components/collections/`, `components/presets/` — full-page reference collections and saved prompt styles, with embedded variants of their dialogs.
  - `components/queue/QueuePanel.tsx` — activity across gallery jobs plus the sequential image queue; queue pause affects subsequent queue work.
  - `lib/studio-actions.ts` — `prepareImageVariant` shared by UI and MCP navigation; stages source reference/model/format and alpha intent without generating. PromptBar hydrates references into real chips, reports loading/errors and offers retry.
  - `lib/organization-actions.ts` — shared folder/project deletion detaches retained media before removing the organization entry.
  - `lib/gallery-costs.ts` — retained-gallery and local-calendar-day confirmed/estimated spend shared by Activity and MCP status.
  - `lib/image-utils.ts` — compressImage, createZoomOutCanvas, createAspectRatioCanvas, collectionImagesAsBase64, renderYouTubeThumbnail (exact 1920×1080 cover-crop)
  - `lib/anti-detection.ts` — `prepareForStorage()` / `scrubGeneratedImage()` / `reencodePreservingAlpha()` / `neutralImageName()`, see **Anti-Detection** below
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
| GPT Image 1.5 | `fal-ai/gpt-image-1.5` | 3 fixed `image_size` values | none | 16 | no | size × quality table |
| Nano Banana 2 | `fal-ai/nano-banana-2` | 15 incl. 4:1/8:1 | 0.5K–4K | 14 | yes | $0.08 @1K, ×0.75/×1.5/×2 |
| Nano Banana 2 Lite | `google/nano-banana-2-lite` | 15 incl. 4:1/8:1 | fixed 1K | 14 | yes | ~$0.048 |
| Nano Banana Pro | `fal-ai/nano-banana-pro` | 11 (no extremes) | 1K–4K | 14 | yes | $0.15, ×2 @4K |

**None of the five accept `negative_prompt`** — the control is gone from the UI.
GPT Image 2 has no `aspect_ratio`/`resolution`/`seed`: ratios become an explicit `image_size`
(multiples of 16, ≤3840 px per edge, ≤3:1, 655,360–8,294,400 px) and it exposes a `quality` tier instead.
GPT Image 1.5 has none of those either, and no pixel freedom: `image_size` is an enum of exactly
`1024x1024` / `1536x1024` / `1024x1536` (the edit endpoint adds `auto`), so `imageSizeMode: 'size-enum'`
routes it through `toFixedImageSize()`. Its `quality` has no `auto` tier. It is the **only** model with
a `background` field (`auto` | `transparent` | `opaque`) — the sole prompt-generation route to an alpha channel — and the
only one with `input_fidelity` (edit endpoint only). Mask request fields are not exposed; Inpaint is retired.
Values a model cannot take are mapped to its nearest supported one rather than rejected.
Multi-model generation: PromptBar allows selecting multiple models; `useImageGeneration` runs each model
independently and packs references per model.

### Dedicated image processing

`shared/image-processing.ts` is separate from the prompt-generation model list: never normalize a Topaz/BRIA ID to a generative fallback. `getModelName()` recognizes both registries, and MCP capabilities/timing include processing models. The ImageViewer and `image_upscale` / `image_remove_background` call `prepareImageProcessing()` and the same `useImageGeneration.generate()` lifecycle. `preview_image_processing` uses that preparation without any upload or paid submission.

The `GenerateOptions.imageProcessing` spec stores operation, dimensions, detected source transparency and normalized options; `attachments[0]` stores the original path. The hook passes the original file path through IPC; the main process uploads a file-backed Blob. Legacy data URLs remain supported. The main `image:generate` handler dispatches that optional payload to `processImage()`, requires count 1, then uses its existing progress/cancellation job lifecycle. Dedicated results stream straight to disk and return saved paths plus native metadata instead of full-size base64 through the renderer. No reference packing, compression, pre-upscale canvas or preservation prompt runs. fal returns singular `image`, not `images`. `generationRequest` stores the exact endpoint/input and `falRequestId` supplies ordinary billing reconciliation.

- Precision: `topaz/upscale/image/precision`, app default High Fidelity V3/2× (provider default Standard V2). All supported precision model variants and restoration controls come from the registry. Factor 1–4; crop-to-fill switch, PNG default or explicit JPEG.
- Transparent: `topaz/upscale/image/transparent`, auto-selected for actual transparent pixels, fixed 4×/PNG. Reject precision for alpha instead of silently flattening it.
- Background removal: `fal-ai/bria/background/remove`, BRIA RMBG 2.0, no prompt or artificial quality controls. Do not claim unlimited source-dimension preservation: public docs mention up to 1024×1024 but API schema has no size constraint. Read actual pixels after download.

Topaz estimates charge started 24 output MP at $0.08; BRIA $0.018/image (sources/date in registry, checked 2026-09-08). No extra ImageStudio pixel/edge/count-of-passes limit is imposed. fal publishes per-pass scale constraints but no total-pixel promise; upstream resource errors remain possible. Never use resolution labels or prior processing history as an eligibility gate. All new processing results carry parentImageId, original attachment, folder/project/logo metadata, measured width/height/hasAlpha/MIME type and an optional previewPath. Large-image display uses the preview, while processing and export always use filePath. Disk-load resolution migration uses stored original dimensions when present. Original media are retained. PNG/JPEG/WebP sources are supported; other imports must be exported as PNG first. Former `image_upscale.resolution` and generative model options are removed from discovery and rejected. The old `upscaleForApi` and prompt branch are deleted.

`tests/image-processing.test.mjs` covers shared validation/costs, original upload, singular provider outputs, errors and cancellation with mocked fal. `scripts/ui-processing-checks.mjs` runs both interfaces in the disposable Electron smoke suite and verifies alpha/export/state parity without paid calls.

### The prompt editor
PromptBar uses `useMentionEditor` for its contenteditable, inline chips, @ popup and `getPromptText()`.
- Text lives in the DOM; the hook mirrors each input into `promptText` for reactive state such as the Generate button. Do not derive render state by calling `getPromptText()`.
- Use shared `setDraftContent()` when restoring prompts/references or applying MCP drafts. It inserts actual image/collection chips at the specified marker positions and synchronizes text.
- Repeated collection mentions share a single reference and upload once; removing the last chip removes its reference. `buildAttachments()` also deduplicates collection IDs.
- Pending reuse/variant hydration reports loading and failure through visible UI and `get_draft.referenceLoadStatus`. Failed reference loading must not silently submit a generation without its source.

### References and @-mentions
fal.ai takes a flat `image_urls` array plus one prompt string — there is no way to interleave labels
between images. `buildReferencePreamble()` therefore numbers every reference in the prompt, in the exact
order the URLs are sent, which is what makes `[Image 1]` and `[@Collection]` mentions resolvable.
`src/shared/reference-mentions.ts` defines the exact UI/MCP markers, collection labels and agent guidance.
MCP callers must both attach media and mention it inline at the relevant prompt position. Return exact
`promptReference` values from collection discovery and live drafts; `preview_generation.referenceMentions`
reports whether each attached reference is mentioned. Individual image numbering follows the explicit
reference list and is unaffected by collections.
This applies equally to imported files/URLs and earlier generated images. Video uses the supported
single start-frame role and natural-language descriptions; do not suggest unsupported video/audio or
end-frame inputs, or promise that video prompts resolve image/collection chips.
When references exceed a model's limit, `packReferencesForModel()` merges the largest groups into numbered
collages until they fit — nothing is dropped. Single-image slots are passed through untouched.

### Cost tracking
Before generation, `estimateImageCost()` / `estimateVideoCost()` use canonical list prices and effective supported options. Completion initially stores this estimate. Never present a preview price as an actual charge.

`src/main/services/fal-billing.ts` reads the official `GET https://api.fal.ai/v1/models/billing-events` endpoint, matching `falRequestId`. `cost_total` is the request total after discounts; the documented `cost_estimate_nano_usd` fallback carries the same total in nano USD. This endpoint requires an Admin API key. Settings optionally stores a separate `falBillingApiKey`; otherwise it tries the existing `falApiKey`. Neither secret belongs in ordinary discovery/status. Explicit MCP credential retrieval remains separate.

`lib/billing-sync.ts` is shared by Activity and MCP `refresh_costs`. It reconciles unconfirmed completed jobs after startup/completion/key changes with a debounce, and supports manual retries. Missing events, legacy records without provider IDs, and denied/unavailable API access remain explicitly estimated/unknown. The original list estimate is retained as `estimatedCost`; confirmed amounts persist as `cost`, `costSource: 'provider-reported'`, and `costCheckedAt`. A request total is counted once across its media.

`getGalleryCosts()` supplies Activity/MCP with confirmed and unconfirmed subtotals, combined retained-gallery totals, local-day totals and missing-cost counts. These are not account balances or a complete invoice: deleted media are excluded. Viewer and Activity distinguish provider-reported costs, including zero, from estimates.

When adding a model, fill in `pricing` — the type requires it, and a missing price silently reads as
free. Prices come from `https://fal.ai/models/<id>`; re-check them when touching the registry.

### Uploads
Reference images go to fal.ai storage (`fal.storage.upload`) — the endpoints only accept URLs.
`image-upload.ts` caches by content hash and shares in-flight uploads, so an image referenced by several
models or several images of a batch is transferred once. The cache is cleared when the API key changes.

### Thumbnail Mode
An `AppMode` (`MainContent.tsx`), built around one fixed output: 16:9, 2K generated, exactly 1920 × 1080 exported.
`getThumbnailModels()` derives the model list from the registry (`uiResolutions` contains `'2K'`), which drops Nano Banana 2 Lite.
It reuses `PromptBar` via the `thumbnailMode` prop — references, @-mentions, drag & drop and collections stay identical;
only `ControlsRow` is swapped for `ThumbnailControls` and the format controls disappear.

`buildThumbnailSystemPrompt()` assembles base rules + optional style block (`auto` adds none — the default; otherwise `clean` | `balanced` | `bold`) + optional face-fidelity block
+ video context + an optional **custom meta prompt** as the last block, so it sits directly above the
user's prompt and explicitly wins over the built-in rules. Custom meta prompts are user-saved rule
blocks (e.g. one per channel format), managed via `MetaPromptSelector` in the controls row and stored
in `thumbnail-meta-prompts-store.ts` (persisted as `thumbnail-meta-prompts`, active selection included). `useImageGeneration` delivers it as `system_prompt` where `supportsSystemPrompt` is true and prepends it to the
prompt otherwise — GPT Image 2 has no such field, and silently dropping the rules there would be worse than a long prompt.

**Exact pixels:** no model returns 1920 × 1080. Gemini at 16:9/2K returns 2752 × 1536 (ratio 1.792); fal.ai rounds GPT Image 2's
`image_size` to multiples of 16, so 1080 becomes 1072 (both verified against the live endpoints). Thumbnail mode therefore sends
`imageSize: 1920 × 1088` for GPT Image 2 and normalises on export via `renderYouTubeThumbnail()` — centre-crop to 16:9, scale to
1920 × 1080, step JPEG quality down until under YouTube's 2 MB limit.

Projects (`thumbnail-projects-store.ts`, persisted as `thumbnail-projects`) are a second axis next to workspaces and only filter
inside thumbnail mode. `GalleryImage` carries `projectId`, `thumbnailStyle` and `faceFidelity`.

### Logo Mode
An `AppMode` (`MainContent.tsx`), and the reason GPT Image 1.5 is in the registry at all: it is the
only model with a `background` field, so it is the only route to a real alpha channel.
`getLogoModels()` derives the model list from that capability rather than a hand-kept list.
It reuses `PromptBar` via the `logoMode` prop — references, @-mentions, drag & drop and collections stay
identical; only `ControlsRow` is swapped for `LogoControls`.

`buildLogoSystemPrompt()` assembles base rules + optional style block (`auto` adds none — the default;
otherwise `minimal` | `wordmark` | `emblem` | `mascot`) + the transparency block when the background is
transparent + a reference block when references are attached. GPT Image 1.5 has no `system_prompt` field,
so `useImageGeneration` prepends it to the prompt.

Logo mode locks `background: 'transparent'` and `output_format: 'png'`, and keeps the workspace axis
(no separate project store — a logo is an ordinary asset with an alpha channel). `GalleryImage` carries
`isLogo`, `logoStyle` and **`hasAlpha`**. `hasAlpha` is the load-bearing one: it is computed per model
(`background === 'transparent' && model.supportsBackground`), it routes the image around the JPEG scrub,
and it drives the `.alpha-checker` backdrop in `GalleryCard`/`ImageViewer`. `prepareImageVariant` preserves the alpha intent and selects a background-capable model when needed.

`background` and `input_fidelity` are also offered in normal image mode via `ControlsRow`, gated on
`getCombinedCapabilities().supportsBackground` / `.supportsInputFidelity` — they are ordinary model
capabilities, not mode-specific switches.

### Anti-Detection
Prompt-generated images run through `prepareForStorage()` **before** `window.api.saveImage` — in
the shared `useImageGeneration` pipeline, including generative viewer transformations (zoom out, aspect ratio). Dedicated Upscale/Remove results are streamed to disk unchanged by `image-processing-files.ts`; provider PNG/JPEG encoding is retained. Videos never do. Doing it before storage rather than on export is what makes
gallery, export, clipboard and drag & drop all hand out the same processed file.

The pipeline is JPEG 95 → squeeze X to 99 % → squeeze Y to 99 % → scale back → JPEG 95. The JPEG
round has to be decoded again in between, otherwise the quantisation never reaches the pixels the
resample works on.

**Transparent prompt-generated images take the other branch.** `prepareForStorage(dataUrl, enabled, preserveAlpha)`
with `preserveAlpha` runs `reencodePreservingAlpha()` instead: a single canvas re-encode to PNG.
JPEG has no alpha channel at all, and the squeeze step would blur exactly the hard edges a logo is
made of — so that path keeps only what costs nothing (metadata dropped, pixels intact) and the
statistical scrub does not happen. The stored extension stays `png`, which is what makes the whole
save/export/clipboard chain hand out a transparent file. Output keeps the generated dimensions exactly; ~86 % of pixels change at an
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
All image-to-video only (require start frame). VideoPromptBar uses single model select (no @mentions/collections — not supported by video API) with a persistent prompt card, start-frame control, Tune panel (resolution, ratio, audio, camera lock) and cost estimate. `useVideoGeneration` fires via fal.ai queue API, stores estimated cost on completion.
Models: Kling v3 Standard, Kling v3 Pro, Seedance 1.5 Pro. Kling v3 Pro is the only model in the app that supports a negative prompt.
Generated videos are stored in `{userData}/ImageStudio/videos/`; imported media retain their actual container/MIME type. Gallery shows both images and videos (filterable). Videos auto-play on hover in grid view. Video export uses direct file copy (no Canvas conversion).

## Retired features and route parity

Chat and Inpaint are removed from active UI, hooks, MCP tools/draft modes and provider mask plumbing. Do not reintroduce chat/inpaint tool names or navigation targets. Retain existing files, legacy history migration and gallery source metadata (`chatId`, `chatMessageId`, `inpaintSourceId`) for compatibility; these are not active features.

MCP `navigate` supports all sidebar sections plus viewer/crop/canvas/compare/reuse and `create_variant`. `collections`, `presets` and `queue` are aliases for references, styles and activity. A variant uses the same `prepareImageVariant()` as UI, requires a completed image and only prepares a draft. Image editing, reference generation, canvas, export and video generation remain available.

The real-app smoke test verifies new route highlighting and UI-to-MCP state, retired-tool rejection, actual inline chips, variant source settings and an image → image → video workflow with mocked providers. A successful build alone is insufficient.

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
- Export: ExportPopover supports PNG/JPEG/WebP with quality slider for images (Canvas conversion), original-container direct file copy for videos
- Workspaces: optional image organization, `workspaceId` on GalleryImage, auto-tag on generation
- Updates: electron-updater against GitHub Releases (`build.publish` in package.json). Check → download with progress → install on restart, all from Settings. Downloads never start on their own. The app version is baked into both main and renderer via `__APP_VERSION__` because `app.getVersion()` returns Electron's version in an unpackaged build
- License: MIT, fully open source

App branding: `components/shared/BrandIcon.tsx` imports `resources/icon.png` directly for default app branding; the renderer favicon references the same source. Keep native packaging and UI artwork synchronized.

Sidebar branding uses the approved light tile artwork `resources/icon-sidebar-light.png` through `BrandIcon variant="sidebar"`; default branding and native packaging retain `resources/icon.png`.

## Navigation and UI regression coverage
Creation-mode sidebar entries and MCP mode navigation open the corresponding overview, clearing the matching project/folder and gallery filters. Project/folder selection remains explicit. Breadcrumb ancestors are real no-drag buttons: mode goes to all media in that mode, Studio to the complete library. Thumbnail overview ignores working-folder selection; library is global. Settings drafts remain mounted across route changes. Viewer/preview lists reconcile against live gallery deletions.

`npm run test:automation:app` additionally covers breadcrumb/sidebar exit, scope isolation, composer menus, export options, crop cancellation, thumbnail preview, deletion and exact mocked billing UI/MCP parity. `npm run test:ui:surfaces` exercises support-page CRUD, settings draft preservation, project overview navigation and real canvas drawing/undo/redo/local PNG export. Both use disposable profiles. Never use real user files or paid requests as test fixtures.

Composer readability: `studio-composer-dock::before` in app.css provides the shared upward-fading scrim for every creation mode. Keep it pointer-events:none and behind the composer; it must not intercept gallery or composer controls.

Read-only prompts use `PromptText` to highlight collection/image markers in gallery captions, the viewer and activity without changing copied or stored text. Gallery captions use a deeper bottom gradient. In image composers, pasting plain text restores exact, unambiguous live collection mentions (deduplicated), and image mentions already attached to the draft; unknown markers remain text. MCP prompt-only `update_draft` uses the same resolver. Explicit `collectionIds` still replaces the collection list. Text-only image markers cannot identify an unattached source image; use variant preparation or attach the source.
