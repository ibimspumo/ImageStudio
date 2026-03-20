export type AspectRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4'
export type Resolution = '1K' | '2K' | '4K'

export interface GenerationConfig {
  model: string
  aspectRatio: AspectRatio
  resolution: Resolution
  imageCount: number
}
