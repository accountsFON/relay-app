'use client'

/**
 * Admin-only "force step" control for a batch. Renders as a collapsed
 * "Admin tools" toggle inside the batch detail ChecklistPanel. Expands to a
 * step dropdown + optional reason, then a "Force step" button that opens a
 * confirm dialog before calling forceStepAction.
 *
 * Gated by canForceStep (computed server side from the relay.forceStep
 * permission). When false the component renders nothing.
 */

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RelayStep } from '@prisma/client'
import { toast } from 'sonner'
import { ChevronDown, ChevronUp } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { relayStepLabel, RELAY_STEP_LABELS } from '@/lib/relay-step-labels'
import { forceStepAction } from '@/server/actions/relay'

/** Canonical pipeline order for the step dropdown. Retired steps are excluded
 *  so an admin can't strand a batch on a step with no outgoing transitions:
 *  designs_completed and (2026-06-26) design_revisions, which the merge into
 *  am_review_design left with zero edges.
 *  TODO(followup): this list still predates the 2026-06-22 rework — it omits
 *  the live client_review + scheduling steps and lists their retirees
 *  (sent_to_client/client_decision/ready_to_schedule/revisions_complete/
 *  final_qa_schedule). Refresh to the live step set separately. */
const STEP_ORDER: RelayStep[] = [
  RelayStep.onboarding_gate,
  RelayStep.copy,
  RelayStep.in_design,
  RelayStep.am_review_design,
  RelayStep.sent_to_client,
  RelayStep.client_decision,
  RelayStep.ready_to_schedule,
  RelayStep.implementing_revisions,
  RelayStep.revisions_complete,
  RelayStep.final_qa_schedule,
  RelayStep.completed,
]

export interface AdminForceStepSectionProps {
  batchId: string
  currentStep: RelayStep
  canForceStep: boolean
}

export function AdminForceStepSection({
  batchId,
  currentStep,
  canForceStep,
}: AdminForceStepSectionProps) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const [toStep, setToStep] = useState<RelayStep | ''>('')
  const [reason, setReason] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const options = useMemo(
    () =>
      STEP_ORDER.filter(
        (s) => s !== currentStep && s !== RelayStep.designs_completed,
      ),
    [currentStep],
  )

  if (!canForceStep) return null

  function openConfirm() {
    if (toStep === '') return
    setConfirmOpen(true)
  }

  function submit() {
    if (toStep === '') return
    const chosen = toStep
    startTransition(async () => {
      try {
        await forceStepAction({
          batchId,
          toStep: chosen,
          ...(reason.trim().length > 0 ? { reason: reason.trim() } : {}),
        })
        toast.success(`Moved batch to ${relayStepLabel(chosen)}`)
        setConfirmOpen(false)
        setExpanded(false)
        setToStep('')
        setReason('')
        router.refresh()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Force step failed'
        toast.error(message)
        setConfirmOpen(false)
      }
    })
  }

  return (
    <div className="mt-3 rounded-md border border-amber-200 bg-amber-50/40">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-[12px] font-medium text-amber-900"
        aria-expanded={expanded}
      >
        <span>Admin tools</span>
        {expanded ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </button>

      {expanded && (
        <div className="space-y-2 border-t border-amber-200 px-3 py-3">
          <label className="block text-[12px] font-medium text-foreground">
            Move this relay to:
            <select
              value={toStep}
              onChange={(e) => setToStep(e.target.value as RelayStep | '')}
              className="mt-1 block w-full rounded border border-border bg-background px-2 py-1 text-[13px]"
              aria-label="Move this relay to"
            >
              <option value="">Select step…</option>
              {options.map((step) => (
                <option key={step} value={step}>
                  {RELAY_STEP_LABELS[step]}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-[12px] font-medium text-foreground">
            Reason (optional)
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-[13px]"
              placeholder="Reason (optional)"
            />
          </label>

          <Button
            type="button"
            size="sm"
            onClick={openConfirm}
            disabled={toStep === '' || isPending}
          >
            Force step
          </Button>
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Force step</DialogTitle>
            <DialogDescription>
              This bypasses the normal pipeline. The move is logged to the
              activity thread.
            </DialogDescription>
          </DialogHeader>
          <p className="text-[13px] text-foreground">
            Force this relay from{' '}
            <span className="font-semibold">{relayStepLabel(currentStep)}</span>{' '}
            to{' '}
            <span className="font-semibold">
              {toStep ? relayStepLabel(toStep) : ''}
            </span>
            ?
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="button" onClick={submit} disabled={isPending}>
              {isPending ? 'Forcing…' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default AdminForceStepSection
