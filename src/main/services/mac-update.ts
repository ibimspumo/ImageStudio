import { execFile, spawn } from 'child_process'
import { constants, createReadStream } from 'fs'
import { access, lstat, mkdtemp, open, readFile, readdir, realpath, rm, writeFile } from 'fs/promises'
import { createHash } from 'crypto'
import { basename, dirname, join } from 'path'
import { promisify } from 'util'

const exec = promisify(execFile)

/** Only replace an installed, same-user writable bundle. Never elevate permissions. */
export async function writableMacBundle(executable: string): Promise<string | undefined> {
  const bundle = dirname(dirname(dirname(executable)))
  try {
    if (!bundle.endsWith('.app') || bundle.startsWith('/Volumes/') || bundle.includes('/AppTranslocation/')) return
    if ((await realpath(bundle)) !== bundle || (await lstat(bundle)).isSymbolicLink()) return
    await access(dirname(bundle), constants.W_OK)
    await access(bundle, constants.W_OK)
    return bundle
  } catch { return }
}

export async function verifyArchiveDigest(path: string, digest: string): Promise<void> {
  if (!/^sha256:[a-f0-9]{64}$/i.test(digest)) throw new Error('The release has no valid SHA-256 digest. Use its manual installer.')
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  if (`sha256:${hash.digest('hex')}` !== digest.toLowerCase()) throw new Error('Update checksum mismatch. Download the update again.')
}

async function plist(path: string, key: string): Promise<string> {
  return (await exec('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, join(path, 'Contents/Info.plist')])).stdout.trim()
}

export interface PreparedMacUpdate { root: string; staged: string; target: string }

/** Read Mach-O CPU types directly: lipo would require developer tools on users' Macs. */
async function verifyArchitecture(path: string): Promise<void> {
  const file = await open(path, 'r')
  const header = Buffer.alloc(4096)
  let bytesRead: number
  try { ({ bytesRead } = await file.read(header)) } finally { await file.close() }
  const wanted = process.arch === 'arm64' ? 0x0100000c : 0x01000007
  if (bytesRead >= 8) {
    if (header.readUInt32LE(0) === 0xfeedfacf && header.readUInt32LE(4) === wanted) return
    const magic = header.readUInt32BE(0)
    if (magic === 0xcafebabe || magic === 0xcafebabf) {
      const count = header.readUInt32BE(4)
      const entrySize = magic === 0xcafebabf ? 32 : 20
      if (count <= (bytesRead - 8) / entrySize) {
        for (let index = 0; index < count; index++) if (header.readUInt32BE(8 + index * entrySize) === wanted) return
      }
    }
  }
  throw new Error('The update executable does not support this Mac architecture.')
}

export async function prepareMacUpdate(archive: string, digest: string, target: string, version: string): Promise<PreparedMacUpdate> {
  await verifyArchiveDigest(archive, digest)
  const root = await mkdtemp(join(dirname(target), '.imagestudio-update-'))
  try {
    const listing = (await exec('/usr/bin/unzip', ['-Z1', archive], { maxBuffer: 16 * 1024 * 1024 })).stdout.split('\n').filter(Boolean)
    if (listing.some((name) => name.startsWith('/') || name.split('/').includes('..'))) throw new Error('Unsafe paths in update archive.')
    await exec('/usr/bin/ditto', ['-x', '-k', archive, root])
    const bundles = (await readdir(root)).filter((name) => name.endsWith('.app'))
    if (bundles.length !== 1) throw new Error('The update archive must contain exactly one application.')
    const staged = join(root, bundles[0])
    if ((await lstat(staged)).isSymbolicLink()) throw new Error('Invalid application bundle in update.')
    const [currentId, nextId, nextVersion, executable] = await Promise.all([
      plist(target, 'CFBundleIdentifier'), plist(staged, 'CFBundleIdentifier'),
      plist(staged, 'CFBundleShortVersionString'), plist(staged, 'CFBundleExecutable'),
    ])
    if (currentId !== nextId || nextVersion !== version || basename(executable) !== executable) throw new Error('Update application identity or version does not match the selected release.')
    await verifyArchitecture(join(staged, 'Contents/MacOS', executable))
    // Verify sealed resources even for an ad-hoc build. No Gatekeeper bypass or re-signing.
    await exec('/usr/bin/codesign', ['--verify', '--deep', '--strict', staged])
    await writeFile(join(root, 'owner.json'), JSON.stringify({ target, version }))
    // Keep the most recent rollback copy until the next update is fully staged.
    // Only remove directories created by this updater for this exact target.
    for (const name of await readdir(dirname(target))) {
      const prior = join(dirname(target), name)
      if (!name.startsWith('.imagestudio-update-') || prior === root) continue
      try {
        const owner = JSON.parse(await readFile(join(prior, 'owner.json'), 'utf8'))
        if (owner.target === target && !(await lstat(prior)).isSymbolicLink()) await rm(prior, { recursive: true, force: true })
      } catch { /* Unknown directories and unavailable old backups stay untouched. */ }
    }
    return { root, staged, target }
  } catch (error) { await rm(root, { recursive: true, force: true }); throw error }
}

/** Arguments are positional, never interpolated into shell source. Backups survive success. */
export const MAC_INSTALL_SCRIPT = `#!/bin/sh
set -eu
parent="$1"
staged="$2"
target="$3"
backup="$4"
result="$5"
ready="$6"
printf 'ready' > "$ready"
i=0
while kill -0 "$parent" 2>/dev/null; do
  i=$((i + 1))
  if [ "$i" -ge 120 ]; then printf 'Update cancelled: application did not quit.' > "$result"; exit 1; fi
  sleep 1
done
if ! /bin/mv "$target" "$backup"; then
  printf 'Update failed: could not preserve previous app.' > "$result"
  /usr/bin/open "$target"
  exit 1
fi
if ! /bin/mv "$staged" "$target"; then
  /bin/mv "$backup" "$target"
  printf 'Update failed; previous app restored.' > "$result"
  /usr/bin/open "$target"
  exit 1
fi
if ! /usr/bin/open "$target"; then
  /bin/mv "$target" "$staged"
  /bin/mv "$backup" "$target"
  printf 'Update launch failed; previous app restored.' > "$result"
  /usr/bin/open "$target"
  exit 1
fi
printf 'success' > "$result"
`

export async function launchMacInstaller(update: PreparedMacUpdate, resultPath: string): Promise<void> {
  if (!(await writableMacBundle(join(update.target, 'Contents/MacOS/ImageStudio')))) throw new Error('The installed app is no longer writable. Use the manual installer.')
  const script = join(update.root, 'install.sh')
  const ready = join(update.root, 'ready')
  await writeFile(script, MAC_INSTALL_SCRIPT, { mode: 0o700 })
  const child = spawn('/bin/sh', [script, String(process.pid), update.staged, update.target, join(update.root, 'previous.app'), resultPath, ready], { detached: true, stdio: 'ignore' })
  await new Promise<void>((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject) })
  child.unref()
  for (let attempt = 0; attempt < 50; attempt++) {
    if (await readFile(ready, 'utf8').catch(() => '') === 'ready') return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  child.kill()
  throw new Error('The update installer could not start. The current app has been kept.')
}
