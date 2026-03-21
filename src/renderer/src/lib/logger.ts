/**
 * Lightweight structured logger for the renderer process.
 * Replaces silent `catch {}` blocks with visible, searchable output.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

function log(level: LogLevel, tag: string, message: string, data?: unknown): void {
  const prefix = `[${tag}]`
  const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'

  if (data !== undefined) {
    console[method](prefix, message, data)
  } else {
    console[method](prefix, message)
  }
}

export const logger = {
  debug: (tag: string, message: string, data?: unknown) => log('debug', tag, message, data),
  info: (tag: string, message: string, data?: unknown) => log('info', tag, message, data),
  warn: (tag: string, message: string, data?: unknown) => log('warn', tag, message, data),
  error: (tag: string, message: string, data?: unknown) => log('error', tag, message, data),
}
