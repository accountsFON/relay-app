import { RelayStep } from '@prisma/client'

/**
 * Label of the special "Send review link" checklist item. Conditionally
 * appended to the AM review step when the client has client review enabled
 * (see checklistRowsForStep). Recognized by label in ChecklistPanel to render
 * it as an action row instead of a plain checkbox.
 */
export const SEND_REVIEW_LINK_LABEL = 'Send review link'

export interface ChecklistSeedItem {
  label: string
  required?: boolean
}

export const CHECKLIST_SEED: Record<RelayStep, ChecklistSeedItem[]> = {
  // Onboarding: no checklist (decision 2026-06-22). It is the entry gate that
  // creates the first batch; completion is via completeOnboardingAction.
  [RelayStep.onboarding_gate]: [],
  [RelayStep.copy]: [
    { label: 'Content has been reviewed for clarity, brand alignment, and messaging consistency' },
    { label: 'CTAs and hashtags have been verified' },
    { label: 'Copy edits have been finalized' },
  ],
  [RelayStep.in_design]: [
    { label: 'Graphics have been created and photos sourced for each post' },
    { label: 'Graphics have been self checked for errors (misinformation, typos, missing elements)' },
    { label: 'Visual content has been confirmed to align with its caption' },
    { label: 'Visual content has been uploaded to the corresponding Dropbox' },
  ],
  // Retired step, kept empty so the record stays total.
  [RelayStep.designs_completed]: [],
  [RelayStep.am_review_design]: [
    { label: 'Every caption has corresponding visual content' },
    { label: 'Designs align with brand guidelines' },
    { label: 'Copy and image alignment have been verified' },
    { label: 'Designs are free of spelling and layout issues' },
    { label: 'Designs reflect the themes of the copy' },
  ],
  [RelayStep.design_revisions]: [
    { label: 'All flagged revisions have been addressed' },
    { label: 'Updated content has been uploaded where needed' },
  ],
  [RelayStep.am_qa_pre_client]: [
    { label: 'Final captions have been reviewed' },
    { label: 'Designs have received a final pass review' },
    { label: 'Posting dates have been verified' },
  ],
  // Client Review: no agency checklist; the client submitting (or the window
  // expiring) is the gate.
  [RelayStep.client_review]: [],
  [RelayStep.implementing_revisions]: [
    { label: 'All client feedback has been addressed' },
  ],
  [RelayStep.scheduling]: [
    { label: 'All posts have been scheduled' },
    { label: 'All posting dates have been double checked' },
    { label: 'All caption and image pairings have been double checked' },
  ],
  // Retired steps, kept empty for totality + legacy batches before cutover.
  [RelayStep.sent_to_client]: [],
  [RelayStep.client_decision]: [],
  [RelayStep.ready_to_schedule]: [],
  [RelayStep.revisions_complete]: [],
  [RelayStep.final_qa_schedule]: [],
  [RelayStep.completed]: [],
}
