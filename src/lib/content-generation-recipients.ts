/**
 * Who gets an inbox notification when a content generation completes.
 *
 * Always the user who triggered it (so they hear about it whether they stayed
 * on the page or navigated away), plus the client's assigned account manager
 * if different (so the relay's owner knows content is ready to review, even
 * when an admin triggered the generation). Deduped, order preserved.
 */
export function completionMentionUserIds(
  triggeredById: string,
  assignedAmId: string | null,
): string[] {
  const ids = [triggeredById]
  if (assignedAmId && assignedAmId !== triggeredById) ids.push(assignedAmId)
  return ids
}
