import Link from 'next/link'
import { RelayStep } from '@prisma/client'
import { CalendarClock, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NECTR_CRM_URL } from '@/lib/nectr'

interface Props {
  currentStep: RelayStep
}

/**
 * The scheduling stage. The 2026-06-22 pipeline rework merged the old
 * `ready_to_schedule` + `final_qa_schedule` into a single `scheduling` step,
 * but batches that reached scheduling before the rework still sit on the
 * retired steps, so the chip must show on all three (otherwise it's invisible
 * for every in-flight pre-rework batch).
 */
const SCHEDULING_STEPS: ReadonlySet<RelayStep> = new Set([
  RelayStep.scheduling,
  RelayStep.ready_to_schedule,
  RelayStep.final_qa_schedule,
])

/**
 * GoToNectrCrmButton: chip on the batch detail action row that opens
 * NectrCRM (the white-labeled GoHighLevel app) in a new tab so the AM can
 * upload the exported Social Planner CSV.
 *
 * Visibility gate (item 37): renders at the scheduling stage (see
 * `SCHEDULING_STEPS`), where the AM finalizes and schedules. Links to the
 * app home (no subaccount deep link); the AM selects the location inside
 * NectrCRM. Sits next to the Export CSV chip, the CSV the AM just downloaded
 * to upload there.
 *
 * Matches the visual contract of the sibling "Open in Canva" / "Open client
 * content" chips.
 */
export function GoToNectrCrmButton({ currentStep }: Props) {
  if (!SCHEDULING_STEPS.has(currentStep)) return null
  return (
    <Button
      variant="secondary"
      size="sm"
      render={
        <Link
          href={NECTR_CRM_URL}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="go-to-nectrcrm-link"
        />
      }
    >
      <CalendarClock className="text-muted-foreground" />
      <span>Go to NectrCRM</span>
      <ExternalLink className="opacity-60" />
    </Button>
  )
}
