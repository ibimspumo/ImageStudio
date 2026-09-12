import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtemp, mkdir, writeFile, readFile, cp, rm, readdir, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
const exec = promisify(execFile)
const root = await realpath(await mkdtemp(join(tmpdir(), 'imagestudio-updater-test-')))
const output = join(root, 'updater.mjs')
await build({ entryPoints: ['src/main/services/mac-update.ts'], outfile: output, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' })
const { verifyArchiveDigest, writableMacBundle, prepareMacUpdate, MAC_INSTALL_SCRIPT } = await import(pathToFileURL(output).href)
after(() => rm(root, { recursive: true, force: true }))
const digest = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`

test('archives require a valid matching GitHub SHA-256 digest', async () => {
  const file = join(root, 'download.zip')
  await writeFile(file, 'archive')
  await verifyArchiveDigest(file, digest('archive'))
  await assert.rejects(verifyArchiveDigest(file, ''), /valid SHA-256/)
  await assert.rejects(verifyArchiveDigest(file, digest('tampered')), /mismatch/)
})

test('macOS stages and verifies a real ad-hoc bundle; rejects version mismatch', { skip: process.platform !== 'darwin' }, async () => {
  const work = await mkdtemp(join(root, 'bundle-'))
  const current = join(work, 'ImageStudio.app')
  async function bundle(path, version) {
    await mkdir(join(path, 'Contents/MacOS'), { recursive: true })
    await cp('/bin/echo', join(path, 'Contents/MacOS/ImageStudio'))
    await writeFile(join(path, 'Contents/Info.plist'), `<?xml version="1.0"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.imagestudio.fixture</string><key>CFBundleExecutable</key><string>ImageStudio</string><key>CFBundleShortVersionString</key><string>${version}</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>`)
    await exec('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', path])
  }
  await bundle(current, '1.0.0')
  const downloaded = join(work, 'source', 'ImageStudio.app')
  await bundle(downloaded, '2.0.0')
  const zip = join(work, 'release.zip')
  await exec('/usr/bin/ditto', ['-c', '-k', '--keepParent', downloaded, zip])
  const checksum = digest(await readFile(zip))
  assert.equal(await writableMacBundle(join(current, 'Contents/MacOS/ImageStudio')), current)
  assert.equal(await writableMacBundle('/Volumes/Installer/ImageStudio.app/Contents/MacOS/ImageStudio'), undefined)
  await assert.rejects(prepareMacUpdate(zip, checksum, current, '3.0.0'), /identity or version/)
  assert.equal((await readdir(work)).filter(n => n.startsWith('.imagestudio-update-')).length, 0)
  const prepared = await prepareMacUpdate(zip, checksum, current, '2.0.0')
  assert.ok((await readFile(join(prepared.staged, 'Contents/Info.plist'), 'utf8')).includes('2.0.0'))
  assert.ok((await readFile(join(current, 'Contents/Info.plist'), 'utf8')).includes('1.0.0'))
})

async function helperFixture(mode) {
  const work = await mkdtemp(join(root, 'helper-'))
  const target = join(work, 'Image Studio; $literal.app')
  const staged = join(work, 'staged.app')
  const backup = join(work, 'previous.app')
  const result = join(work, 'result')
  const ready = join(work, 'ready')
  await mkdir(target); await writeFile(join(target, 'version'), 'old')
  if (mode !== 'missing') { await mkdir(staged); await writeFile(join(staged, 'version'), 'new') }
  const opener = join(work, 'open.sh')
  await writeFile(opener, `#!/bin/sh\n${mode === 'launch-failure' ? 'exit 1' : 'exit 0'}\n`, { mode: 0o700 })
  // LaunchServices itself is mocked; all wait/move/rollback commands are real.
  const script = join(work, 'helper.sh')
  await writeFile(script, MAC_INSTALL_SCRIPT.replaceAll('/usr/bin/open', `"${opener}"`))
  return { work, target, staged, backup, result, ready, script }
}

test('helper waits for app exit, renames bundles, preserves backup and quotes paths', { skip: process.platform === 'win32' }, async () => {
  const f = await helperFixture('success')
  const parent = spawn('/bin/sleep', ['30'])
  await new Promise(resolve => parent.once('spawn', resolve))
  const completion = exec('/bin/sh', [f.script, String(parent.pid), f.staged, f.target, f.backup, f.result, f.ready])
  await new Promise(resolve => setTimeout(resolve, 150))
  assert.equal(await readFile(join(f.target, 'version'), 'utf8'), 'old')
  assert.equal(await readFile(f.ready, 'utf8'), 'ready')
  parent.kill()
  await completion
  assert.equal(await readFile(join(f.target, 'version'), 'utf8'), 'new')
  assert.equal(await readFile(join(f.backup, 'version'), 'utf8'), 'old')
  assert.equal(await readFile(f.result, 'utf8'), 'success')
})

for (const mode of ['missing', 'launch-failure']) test(`helper restores previous app on ${mode}`, { skip: process.platform === 'win32' }, async () => {
  const f = await helperFixture(mode)
  await assert.rejects(exec('/bin/sh', [f.script, '99999999', f.staged, f.target, f.backup, f.result, f.ready]))
  assert.equal(await readFile(join(f.target, 'version'), 'utf8'), 'old')
  assert.match(await readFile(f.result, 'utf8'), /previous app restored/)
})
