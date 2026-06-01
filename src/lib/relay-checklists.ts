import { RelayStep } from '@prisma/client'

export interface ChecklistSeedItem {
  label: string
  required?: boolean
}

export const CHECKLIST_SEED: Record<RelayStep, ChecklistSeedItem[]> = {
  [RelayStep.onboarding_gate]: [
    { label: 'Brand assets received and saved' },
    { label: 'Brand voice captured in Client profile' },
    { label: 'Posting cadence and excluded dates confirmed' },
    { label: 'Main CTA and focus areas filled in' },
  ],
  [RelayStep.copy]: [
    { label: 'Copy draft generated' },
    { label: 'AM-reviewed all captions' },
    { label: 'Hashtags pass brand-voice check' },
    { label: 'Sub-state advanced to approved' },
  ],
  [RelayStep.in_design]: [
    { label: 'Visual concept aligned with brief' },
    { label: 'All posts have draft graphics' },
  ],
  // Retired step (Phase 3 item 15 PR1). Kept as an empty entry so the
  // CHECKLIST_SEED record stays total over RelayStep, and reseeding for a
  // legacy batch sitting on this step before the backfill yields zero items
  // instead of throwing. PR2 (Wave F5) tombstones the enum entirely.
  [RelayStep.designs_completed]: [],
  [RelayStep.am_review_design]: [
    { label: 'Designs match brand guidelines' },
    { label: 'Copy / image alignment verified' },
    { label: 'No spelling or layout issues' },
    // Merged from the retired `designs_completed` step (Phase 3 item 15 PR1).
    { label: 'Designs match copy themes' },
  ],
  [RelayStep.design_revisions]: [
    { label: 'All flagged revisions addressed' },
  ],
  [RelayStep.am_qa_pre_client]: [
    { label: 'Final captions reviewed' },
    { label: 'Designs final-pass reviewed' },
    { label: 'Posting dates correct' },
  ],
  [RelayStep.sent_to_client]: [
    { label: 'Client opened the relay' },
  ],
  [RelayStep.client_decision]: [
    { label: 'Client decision recorded (approve or revisions)' },
  ],
  [RelayStep.ready_to_schedule]: [
    { label: 'AM confirmed relay ready to schedule' },
  ],
  [RelayStep.implementing_revisions]: [
    { label: 'Revision plan composed' },
    { label: 'All revision items dispatched' },
  ],
  [RelayStep.revisions_complete]: [
    { label: 'Revision-vs-client decision made (loop or schedule)' },
  ],
  [RelayStep.final_qa_schedule]: [
    { label: 'All posts scheduled in destination platform' },
    { label: 'Posting dates double-checked' },
  ],
  [RelayStep.completed]: [],
}
