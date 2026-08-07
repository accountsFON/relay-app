const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Whole days elapsed between `date` and `now` (a millisecond timestamp),
 * floored and clamped at 0. Pure: the caller supplies `now`, so the result is
 * deterministic and testable.
 *
 * Use this in CLIENT components with a mount-captured `now`
 * (`const [now] = useState(() => Date.now())`) so the value is stable across
 * re-renders instead of drifting each render (react-hooks/purity).
 */
export function daysSince(date: Date, now: number): number {
  return Math.max(0, Math.floor((now - date.getTime()) / MS_PER_DAY))
}

/**
 * `daysSince` against the current time. The clock read lives here (a plain
 * helper, not a component) so it is safe to call from SERVER components, which
 * render once per request — there is no re-render for the value to drift across.
 */
export function daysSinceNow(date: Date): number {
  return daysSince(date, Date.now())
}
