import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtemp, rm, readFile, writeFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const temporary = await mkdtemp(join(process.cwd(), 'node_modules', '.history-transport-'))
after(() => rm(temporary, { recursive: true, force: true }))
for (const [name, source] of [['server', 'src/main/services/history-transport.ts'], ['client', 'src/shared/history-transport.ts']]) {
  await build({ entryPoints: [source], outfile: join(temporary, `${name}.mjs`), bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' })
}
const { createHistoryTransport } = await import(pathToFileURL(join(temporary, 'server.mjs')))
const { createHistoryClient, HISTORY_CHUNK_SIZE } = await import(pathToFileURL(join(temporary, 'client.mjs')))
const directory = join(temporary, 'history')
const transport = createHistoryTransport(() => directory)
const calls = []
const client = createHistoryClient(async request => {
  calls.push(request.action)
  if (request.data) assert.ok(request.data.length <= HISTORY_CHUNK_SIZE)
  const result = await transport.invoke(1, request)
  if (result.data) assert.ok(result.data.byteLength <= HISTORY_CHUNK_SIZE)
  return result
})

test('bounded transport preserves multibyte content, scopes loads and orders overlapping saves', async () => {
  const large = 'a'.repeat(HISTORY_CHUNK_SIZE - 1) + '🦊ä'.repeat(HISTORY_CHUNK_SIZE)
  assert.equal((await client.saveHistory('gallery', large)).success, true)
  await writeFile(join(directory, 'legacy.json'), 'legacy remains')
  assert.deepEqual(await client.listHistory('gallery'), { success: true, sessions: [{ id: 'gallery', data: large }] })
  assert.equal(calls.filter(action => action === 'open-read').length, 1)
  const first = client.saveHistory('gallery', large)
  const second = client.saveHistory('gallery', 'newest')
  await Promise.all([first, second])
  assert.equal(await readFile(join(directory, 'gallery.json'), 'utf8'), 'newest')
  assert.equal(await readFile(join(directory, 'legacy.json'), 'utf8'), 'legacy remains')
  assert.deepEqual(await client.listHistory('absent'), { success: true, sessions: [] })
})

test('interrupted writes preserve original history and renderer disposal removes staging files', async () => {
  const { token } = await transport.invoke(2, { action: 'open-write', id: 'gallery' })
  await transport.invoke(2, { action: 'append', token, data: 'incomplete' })
  assert.equal((await transport.invoke(3, { action: 'commit', token })).success, false)
  assert.equal((await transport.invoke(2, { action: 'append', token, data: 'x'.repeat(HISTORY_CHUNK_SIZE + 1) })).success, false)
  await transport.closeOwner(2)
  assert.equal(await readFile(join(directory, 'gallery.json'), 'utf8'), 'newest')
  assert.equal((await readdir(directory)).some(name => name.endsWith('.tmp')), false)
  assert.equal((await client.saveHistory('../escape', 'bad')).success, false)
})

test('open reader retains consistent snapshot while a save atomically replaces history', async () => {
  await client.saveHistory('snapshot', 'old value')
  const { token } = await transport.invoke(4, { action: 'open-read', id: 'snapshot' })
  await client.saveHistory('snapshot', 'new value')
  const reply = await transport.invoke(4, { action: 'read', token })
  assert.equal(Buffer.from(reply.data).toString(), 'old value')
  await transport.closeOwner(4)
})
