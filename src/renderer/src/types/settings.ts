import type { PrintFormat, PrintStyle } from '../../../shared/print-prompt'

export interface AppSettings {
  /** fal.ai API key — used for images, video and uploads */
  falApiKey: string
  /** Optional Admin key used only for read-only billing reconciliation. */
  falBillingApiKey: string
  printPrompt: string
  defaultPrintFormat: PrintFormat
  defaultPrintStyle: PrintStyle
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
