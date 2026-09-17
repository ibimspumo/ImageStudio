import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const directory = await mkdtemp(join(process.cwd(), 'node_modules', '.gallery-save-'))
after(() => rm(directory, { recursive: true, force: true }))
await build({ entryPoints: ['src/renderer/src/lib/coalesced-save.ts'], outfile: join(directory, 'save.mjs'), bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' })
const { createCoalescedSave } = await import(pathToFileURL(join(directory, 'save.mjs')).href)

const turn = () => new Promise(resolve => setImmediate(resolve))
test('slow history writes never overlap or retain intermediate snapshots', async () => {
  let state = 0
  const captured = []
  const releases = []
  const save = createCoalescedSave(async () => {
    captured.push(state)
    await new Promise(resolve => releases.push(resolve))
  })
  const first = save()
  await turn()
  const requests = []
  for (state = 1; state <= 100; state++) requests.push(save())
  assert.equal(releases.length, 1)
  assert.ok(requests.every(request => request === first))
  releases[0]()
  await turn()
  assert.deepEqual(captured, [0, 101])
  releases[1]()
  await Promise.all(requests)
})

test('a rejected write is visible to callers and a later save can recover', async () => {
  let shouldFail = true
  const save = createCoalescedSave(async () => {
    if (shouldFail) throw new Error('Disk full')
  })
  await assert.rejects(save(), /Disk full/)
  shouldFail = false
  await save()
})
