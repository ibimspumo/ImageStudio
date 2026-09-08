import { stat } from 'node:fs/promises'
import { resolve } from 'node:path'

/** Shared by native UI and MCP exports: exporting must not modify the original asset. */
export async function assertSeparateExportDestination(source: string, destination: string): Promise<void> {
  if (resolve(source) === resolve(destination)) throw new Error('Choose a separate export path to preserve the original image.')
  const target = await stat(destination).catch(error => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  })
  if (target) {
    const original = await stat(source)
    if (original.dev === target.dev && original.ino === target.ino) throw new Error('Choose a separate export path to preserve the original image.')
  }
}
