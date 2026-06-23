/**
 * Tiny wall-clock step timer for instrumenting the content-generation
 * pipeline. `lap(name)` records the elapsed time since the previous lap (or
 * since construction / the last `reset`) under `name`, accumulating if the same
 * name is lapped more than once. The result (`durationsMs`) is persisted onto
 * the ContentRun's tokenUsage so a run's per-step breakdown is visible without
 * re-running. `now` is injectable for tests.
 */
export type StepTimer = {
  durationsMs: Record<string, number>
  reset: () => void
  lap: (name: string) => void
}

export function makeStepTimer(now: () => number = Date.now): StepTimer {
  const durationsMs: Record<string, number> = {}
  let mark = now()
  return {
    durationsMs,
    reset() {
      mark = now()
    },
    lap(name) {
      const t = now()
      durationsMs[name] = (durationsMs[name] ?? 0) + (t - mark)
      mark = t
    },
  }
}
