/**
 * The final QA "once-over" shown in the Design Review → Client Review / Final QA
 * confirm modal (P1 #13). Ephemeral, client-side only — NOT a persisted
 * checklist. Replaces the retired am_qa_pre_client step's persisted items.
 */
export const QA_ONCE_OVER_ITEMS: readonly string[] = [
  'Final captions have been reviewed',
  'Designs have received a final pass review',
  'Posting dates have been verified',
] as const
