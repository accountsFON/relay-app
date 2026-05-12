import type { InFlightRun, InFlightRunIntent } from '@/server/actions/in-flight-runs'

export const INTENT_PRIORITY: Record<InFlightRunIntent, number> = {
  awaiting_choice: 0,
  active: 1,
  failed: 2,
}

export function stepLabel(run: InFlightRun): string {
  if (run.intent === 'failed') return `Failed: ${run.errorMessage ?? 'unknown error'}`
  if (run.intent === 'awaiting_choice') return 'Ready, decide where posts go'
  if (run.postCount > 0) return 'Writing captions'
  if (run.supportingFacts) return 'Extracting facts'
  if (run.crawledContent) return 'Crawling site'
  if (run.brief) return 'Writing brief'
  return 'Starting up'
}
