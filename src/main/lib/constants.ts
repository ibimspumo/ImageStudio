export const IPC_CHANNELS = {
  IMAGE_GENERATE: 'image:generate',
  IMAGE_GENERATE_PROGRESS: 'image:generate-progress',
  IMAGE_SAVE: 'image:save',
  IMAGE_EXPORT: 'image:export',
  IMAGE_START_DRAG: 'image:start-drag',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  HISTORY_LOAD: 'history:load',
  HISTORY_SAVE: 'history:save',
  HISTORY_DELETE: 'history:delete',
  HISTORY_LIST: 'history:list',
  IMAGE_READ: 'image:read',
  IMAGE_DELETE: 'image:delete',
  MIGRATE_RUN: 'migrate:run',
  IMAGE_UPLOAD_URLS: 'image:upload-urls',
  VIDEO_GENERATE: 'video:generate',
  VIDEO_GENERATE_PROGRESS: 'video:generate-progress',
  VIDEO_EXPORT: 'video:export',
} as const

export const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'
export const DEFAULT_MODEL = 'openai/gpt-5.4-image-2'

export const ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '2:3', '3:2', '5:4', '4:5', '21:9'] as const
export const RESOLUTIONS = ['1K', '2K', '4K'] as const
export const MAX_IMAGE_COUNT = 4

/** Models that support negative_prompt parameter */
export const NEGATIVE_PROMPT_MODELS = new Set(['flux', 'seedream'])
