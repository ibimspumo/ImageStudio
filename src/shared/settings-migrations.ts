import { DEFAULT_MODEL, normalizeModelId } from './image-models'

/** v1.3.3 moves every existing profile to Sunburst once, then honors later user choices. */
export const IMAGE_DEFAULTS_REVISION = 1
export function migrateImageDefaults(raw: { defaultModel?: string; imageDefaultsRevision?: number }) {
  return {
    defaultModel: raw.imageDefaultsRevision === IMAGE_DEFAULTS_REVISION ? normalizeModelId(raw.defaultModel) : DEFAULT_MODEL,
    imageDefaultsRevision: IMAGE_DEFAULTS_REVISION,
  }
}
