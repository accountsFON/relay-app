import type { UpdatePostResult } from '@/server/actions/posts'

/**
 * Human copy for a refused post save.
 *
 * Both save surfaces previously caught every error and rendered "You may not
 * have permission to edit captions" regardless of cause. That was correct by
 * luck during the 2026-08-19 AM permission bug and misleading for anything
 * else, so the reason now drives the wording.
 *
 * The permission line names the exact toggle an admin has to flip, because the
 * key is labelled "Edit captions / hashtags" in the permissions editor and that
 * is the thing someone has to go find.
 */
export function postSaveErrorMessage(
  reason: Extract<UpdatePostResult, { ok: false }>['reason'],
): string {
  switch (reason) {
    case 'no-permission':
      return 'You do not have permission to edit captions. An admin can turn on "Edit captions / hashtags" for your account.'
    case 'locked':
      return 'This relay is completed, so its posts can no longer be edited.'
    case 'not-found':
      return 'That post is no longer available. It may have been removed, or it belongs to a client you are not assigned to.'
  }
}

/** Copy for a save that failed for an unexpected reason (a real fault). */
export const POST_SAVE_UNEXPECTED =
  'Something went wrong saving your changes. Please try again.'

/**
 * True when a caught error is one of our own named refusals rather than a real
 * fault. The preview shell rethrows refusals so the card keeps the editor open,
 * and this stops that rethrow from also firing the generic fault toast.
 */
export function isPostSaveReason(value: string): boolean {
  return value === 'no-permission' || value === 'locked' || value === 'not-found'
}
