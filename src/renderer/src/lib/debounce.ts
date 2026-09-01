/**
 * Creates a debounced function that delays invoking `fn` until after `ms`
 * milliseconds have elapsed since the last invocation.
 * Trailing-edge only — the function runs once after calls stop.
 */
export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => unknown,
  ms: number
): (...args: Args) => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  return (...args: Args) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      fn(...args)
    }, ms)
  }
}
