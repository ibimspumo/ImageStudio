import { build } from 'esbuild'
import { mkdtemp, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Bundle TS app modules but keep Node/React dependencies resolvable from the repo.
const root = dirname(fileURLToPath(import.meta.url))
const directory = await mkdtemp(join(root, '.renderer-test-'))
try {
  const output = join(directory, 'suite.mjs')
  await build({ entryPoints: [join(root, 'automation-renderer.test.ts')], bundle: true, platform: 'node', format: 'esm', packages: 'external', outfile: output })
  await import(pathToFileURL(output).href)
} finally {
  await rm(directory, { recursive: true, force: true })
}
