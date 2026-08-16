/** Compare semver-ish version strings; true when `candidate` is newer than `current`. */
export function isNewerVersion(candidate: string, current: string): boolean {
  const parse = (v: string): number[] =>
    v.replace(/^v/, '').split('-')[0].split('.').map((n) => parseInt(n, 10) || 0)
  const a = parse(candidate)
  const b = parse(current)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    if (diff !== 0) return diff > 0
  }
  return false
}
