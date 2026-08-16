export interface AppSettings {
  /** fal.ai API key — the app's only credential (images, video, uploads) */
  falApiKey: string
  defaultModel: string
  defaultAspectRatio: string
  defaultResolution: string
  defaultImageCount: number
  defaultVideoModel: string
  autoCheckUpdates: boolean
  /**
   * Run generated images and thumbnails through the anti-detection pipeline
   * (`lib/anti-detection.ts`) before they are written to disk. Videos are
   * never affected.
   */
  antiDetection: boolean
}
