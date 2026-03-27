# Video Generation — Implementation Plan

## Overview

Add a **Video** tab alongside the existing **Image** tab. Users can switch between modes, but assets (gallery, collections, workspaces, tags, favorites) are shared across both. Video generation uses **fal.ai** as the backend (separate from OpenRouter for images).

---

## UX Concept

### Tab Navigation

A tab bar at the top (below WorkspaceBar) or integrated into the title area:

```
[ Image ]  [ Video ]
```

- **Image** = current app (unchanged)
- **Video** = new video generation mode
- Switching tabs changes the prompt bar controls and gallery view
- Gallery shows both images and videos (filterable by type)
- Collections, workspaces, favorites, tags work across both

### Video Gallery

- Video thumbnails show a play icon overlay and duration badge
- Click to open in lightbox with video player (not just an image)
- Hover preview: short auto-play loop (muted) on hover — optional, could be expensive on performance
- Filter: add "Type" filter (Image / Video / All) to GalleryToolbar

---

## Settings

### New Settings Fields

```typescript
interface AppSettings {
  // ... existing
  falApiKey: string          // fal.ai API key (separate from OpenRouter)
  defaultVideoModel: string  // default video model endpoint
  defaultVideoDuration: number // default duration in seconds
}
```

### Settings Dialog

Add a second API key field:
- **OpenRouter API Key** — for image generation (existing)
- **fal.ai API Key** — for video generation (new)
- Link to https://fal.ai/dashboard/keys

---

## Data Model

### GalleryItem (extend existing GalleryImage)

```typescript
interface GalleryImage {
  // ... existing fields
  type: 'image' | 'video'       // new — default 'image' for backwards compat
  videoDuration?: number         // seconds
  videoThumbnail?: string        // path to thumbnail frame on disk
  falRequestId?: string          // for tracking async queue status
}
```

Migration: all existing items get `type: 'image'` on load if field is missing.

---

## Video Models

### Initial Model Set

| ID | Name | Provider | Modes | Price |
|----|------|----------|-------|-------|
| `fal-ai/kling-video/v3/pro/image-to-video` | Kling 3 Pro | Kuaishou | img2vid | ~$0.11/s |
| `fal-ai/kling-video/v3/standard/text-to-video` | Kling 3 Standard | Kuaishou | txt2vid | ~$0.07/s |
| `fal-ai/veo3.1/image-to-video` | Veo 3.1 | Google | img2vid | ~$0.10-0.30/s |
| `fal-ai/veo3.1` | Veo 3.1 | Google | txt2vid | ~$0.10-0.30/s |
| `fal-ai/luma-dream-machine/ray-2-flash/image-to-video` | Luma Ray 2 Flash | Luma | img2vid | $0.20/vid |
| `fal-ai/luma-dream-machine/ray-2-flash` | Luma Ray 2 Flash | Luma | txt2vid | $0.20/vid |
| `fal-ai/wan/v2.2/image-to-video` | Wan 2.2 | Alibaba | img2vid | ~$0.05-0.15/s |
| `fal-ai/wan-25-preview/text-to-video` | Wan 2.5 | Alibaba | txt2vid | ~$0.05-0.15/s |
| `fal-ai/bytedance/seedance/v1.5/pro/image-to-video` | Seedance 1.5 Pro | ByteDance | img2vid | ~$0.62/5s |
| `fal-ai/sora-2/image-to-video/pro` | Sora 2 Pro | OpenAI | img2vid | $0.30-0.50/s |

### Model Definition

```typescript
interface VideoModelOption {
  id: string
  name: string
  provider: string
  modes: ('text-to-video' | 'image-to-video')[]
  durations: number[]           // available duration options in seconds
  resolutions: string[]         // e.g. ['720p', '1080p']
  aspectRatios: string[]        // e.g. ['16:9', '9:16', '1:1']
  supportsEndFrame?: boolean
  supportsAudio?: boolean
  supportsLoop?: boolean
  supportsCameraControl?: boolean
}
```

---

## Prompt Bar — Video Mode

When in Video tab, the PromptBar adapts its controls:

### Controls Row (Video)

```
[ Model v ]  [ Duration v ]  [ Aspect Ratio v ]  [ Resolution v ]  [ Generate ]
```

- **Model selector** — video models only, single select (no multi-model for video)
- **Duration selector** — dropdown with available durations for selected model (e.g. 5s, 10s)
- **Aspect ratio** — subset based on model capabilities
- **Resolution** — 720p / 1080p based on model
- **+ button** — attach start frame image (from disk or gallery)
- **End frame** — optional, for models that support it (Kling, Luma, Seedance, Vidu)

### Input Modes

1. **Text-to-Video**: prompt only, no attachments
2. **Image-to-Video**: prompt + start frame image (attached via + or drag from gallery)
3. **Start+End Frame**: prompt + two images (for supported models)

The mode is determined automatically by what's attached:
- No images → text-to-video endpoint
- 1 image → image-to-video endpoint
- 2 images → start+end frame (if model supports it, otherwise error hint)

---

## Backend — fal.ai Integration

### New Files

```
src/main/services/fal-client.ts    — fal.ai API client
src/main/ipc/video.ts              — IPC handlers for video generation
src/preload/index.ts               — expose video API to renderer
```

### fal-client.ts

```typescript
import { fal } from "@fal-ai/client"

interface VideoGenerateOptions {
  model: string
  prompt: string
  startImageUrl?: string      // base64 data URL or HTTPS URL
  endImageUrl?: string
  duration: number
  aspectRatio?: string
  resolution?: string
  negativePrompt?: string
  generateAudio?: boolean
}

interface VideoGenerateResult {
  videoUrl: string            // CDN URL to MP4
  thumbnailUrl?: string
  duration: number
  width: number
  height: number
}

// Submit job, poll for completion, return result
async function generateVideo(
  apiKey: string,
  options: VideoGenerateOptions,
  onProgress?: (status: string) => void
): Promise<VideoGenerateResult>
```

### IPC Channels

```typescript
VIDEO_GENERATE: 'video:generate'          // submit + poll + return
VIDEO_GENERATE_PROGRESS: 'video:generate-progress'  // progress events
VIDEO_SAVE: 'video:save'                  // download MP4 from CDN to disk
```

### Queue / Progress Flow

Since video generation takes 1-5 minutes:

1. Renderer calls `window.api.generateVideo(options)`
2. Main process submits to fal.ai queue → returns `request_id`
3. Main process polls status, sends progress events to renderer
4. On completion: downloads MP4 to local disk, extracts thumbnail frame
5. Returns local file path to renderer
6. Renderer updates gallery store

Progress states shown on placeholder card:
- "Queued..." (position in queue)
- "Generating..." (in progress, with elapsed time)
- "Downloading..." (MP4 being saved to disk)

---

## Gallery Integration

### Video in Gallery

- Videos use the same `GalleryImage` type (with `type: 'video'`)
- Gallery card shows thumbnail with play icon overlay + duration badge
- Justified layout uses the video's aspect ratio for sizing
- Loading placeholder shows video-specific status text

### Video in Lightbox

- Replace `<img>` with `<video>` for video items
- Controls: play/pause, seek bar, volume, fullscreen
- Info panel shows: prompt, model, duration, resolution, cost, date
- Actions: Save (download MP4), Copy (not applicable → hide), Reuse Prompt, Start Chat, Delete
- No zoom out / upscale / inpaint for videos (hide those sections)

### Filtering

- New filter in GalleryToolbar: **Type** (All / Images / Videos)
- SmartAlbumBar: add "Videos" smart album
- Model filter: show both image and video models (or split by active tab)

---

## Shared Assets

### Collections

Collections remain image-only (reference images). In video mode, collections can be referenced for visual context in prompts but are not sent as API parameters (unless the model supports reference images like Veo 3.1 or Vidu).

### Workspaces

Work as-is. Videos get `workspaceId` just like images.

### Favorites & Tags

Work as-is on video items.

### Gallery → Video

Key workflow: **Right-click or hover action on any gallery image → "Generate Video"** which:
1. Switches to Video tab (if not already)
2. Attaches the image as start frame
3. Focuses the prompt editor

---

## File Storage

```
~/Library/Application Support/ImageStudio/
├── images/          # existing image files
├── videos/          # new — MP4 files
├── thumbnails/      # new — video thumbnail JPEGs
└── history/         # existing JSON stores
```

Videos are saved as `{id}.mp4`. Thumbnails extracted from first frame as `{id}-thumb.jpg`.

---

## Implementation Order

### Phase 1 — Foundation
1. Add `falApiKey` to settings store + settings dialog
2. Add `type` field to `GalleryImage` with migration
3. Create `fal-client.ts` with basic text-to-video
4. Add IPC handlers for video generation
5. Add video tab toggle UI (Image / Video)

### Phase 2 — Video Generation
6. Video-specific PromptBar controls (duration, resolution)
7. Video model selector with `AVAILABLE_VIDEO_MODELS`
8. Text-to-video generation flow with queue/progress
9. Image-to-video: attach start frame from gallery or disk
10. Save MP4 to disk + thumbnail extraction

### Phase 3 — Gallery & Playback
11. Video thumbnails in gallery cards (play icon, duration badge)
12. Video player in lightbox
13. Type filter in GalleryToolbar
14. "Generate Video" action on gallery image hover

### Phase 4 — Advanced Features
15. Start + end frame support (Kling, Luma, Seedance, Vidu)
16. Audio generation toggle (Veo 3, Kling v3, Seedance 1.5)
17. Camera controls (Seedance)
18. Loop mode (Luma Ray 2)
19. Video export options (format, quality)
20. Video-to-video / extend (future)

---

## Dependencies

```json
{
  "@fal-ai/client": "^1.x"
}
```

Single new dependency. The fal.ai JS client handles queue submission, polling, and authentication.

---

## Cost Awareness

Since video generation is significantly more expensive than image generation ($0.05-$0.50+ per second), consider:

- Show estimated cost before generating (based on model + duration)
- Confirmation dialog for expensive generations (e.g. > $1)
- Cost tracking in gallery metadata (already exists for images)
- Cost summary in settings or toolbar
