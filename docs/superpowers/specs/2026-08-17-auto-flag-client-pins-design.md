# Auto-flag the designer from client magic-link pins

**Date:** 2026-08-17
**Requested by:** Julio: "when pins are created by the magic link then it should auto flag the designer"

## Problem

When a client leaves a pin through their magic-link review, an AM then hand-clicks
"Flag for designer" on each one to route it to the designer. A client pin is almost
always a request to change the design, so that click confirms the obvious. It is
per pin, per post, per round.

## Key findings from the code

**1. Flags do not notify the designer.** A `DesignerFlag` existing is not the same as
the designer being engaged. That happens on the AM's explicit "Send to designer"
(`requestDesignChangesAction`), which sets the `awaiting_design_revisions` sub-state and
notifies the assigned designer. So auto-created flags pre-fill the AM's triage list
without pinging anyone. This is what makes the feature safe.

**2. Attribution needs a real user, and there is one.** `DesignerFlag.createdById` is a
required FK to `User`. A magic-link reviewer is a `MagicLinkReviewer`, not a `User`, so
the client cannot own the flag. `MagicLink.createdBy` is also required and non-null, so
the AM who minted the link is always available. Use that. No migration, no nullable
column, and it reads honestly as "arrived through the link this person sent."

Rejected: the client's assigned AM (`Client.assignedAmId`), which is nullable. We were
already bitten by a null assigned AM on 2026-08-13 when submit notifications appeared
to be broken.

**3. The client cannot call the existing action.** `flagFeedbackForDesignerAction` opens
with `requireClientEditor()`. Auto-flagging therefore lives in a service invoked from
the already-authenticated submit path, not by reusing that action.

## Decisions (approved by Julio)

### Timing: on review submit

Flags are created when the client submits, not when each pin is dropped.

Clients add, edit, and delete pins while working. Flagging at creation time would need
matching delete and edit cleanup, and an abandoned review would leave stale flags on the
AM's list forever. Submit is one clean moment, and `submitSessionAction` already queries
exactly the rows needed (open, client-authored pins on the batch, with their coordinate
columns) to build the digest email, so the classification data is already in hand.

### Scope: image pins and post-level notes, never caption pins

A pin's kind is derived from its columns, matching the existing `DigestPin` logic:

| Columns set | Kind | Auto-flag |
|---|---|---|
| `imageX` + `imageY` | image | yes |
| `captionFrom` + `captionTo` | caption | **no** |
| none | post note | yes |

Caption pins are excluded because the codebase already treats caption edits as the AM's
work, not the designer's. `review-feedback-rail.tsx` hides the flag control for
`verdict === 'caption_edited'`, with the comment: "Caption edits are excluded: the AM
handles that copy inline (accept/reject), it is not designer work." Auto-flagging them
would hand the designer work they do not own.

### Verdict is not a filter

Every open client pin is flagged regardless of the post's verdict, including a post the
client approved but still pinned. A pin is a change request whichever button they
pressed, and the rail already shows pins independent of verdict. Simplest predictable
rule.

## Design

New service `src/server/services/autoFlagClientPins.ts`:

```ts
export interface AutoFlagClientPinsInput {
  batchId: string
  /** MagicLink.createdBy — the AM who sent the link. Always a real User. */
  createdById: string
}

export interface AutoFlagClientPinsResult {
  flagged: number
  skippedCaption: number
  skippedExisting: number
}
```

Behaviour:

1. Load open, client-authored threads on the batch (`reviewerToken` not null,
   `status: 'open'`) with `postId` and the four coordinate columns.
2. Skip caption-kind threads.
3. Skip threads that already carry a `DesignerFlag` (idempotency).
4. Create one flag per remaining thread, `note: null`. The rail already renders a
   null-note flag as "Revise this item".

Dependencies are injectable so the unit tests need no database.

### Wiring

Called from `submitSessionAction` after the submit and the activity emit, wrapped so a
failure can never block submission or the digest email. Mirrors the best-effort
side-effect pattern PR #425 established for the Drive upload on the scheduling
transition.

### Idempotency

Step 3 makes re-submit and round 2 safe. A round-2 pin is a new thread with no flag, so
it flags; a round-1 pin the AM already flagged is skipped rather than duplicated. An AM
who deliberately unflagged a pin **will** see it return if the client re-submits the same
session, which is an accepted edge: re-submitting is a fresh statement of the feedback.

## Testing

TDD on the service, no database:

- flags an image pin
- flags a post-level note
- skips a caption pin
- skips a thread that already has a flag
- skips AM-authored threads (`reviewerToken` null) so internal pins never route back
- attributes every flag to the passed `createdById`
- returns accurate counts

Plus action-level tests that `submitSessionAction` calls the service with the batch id
and the link creator, and that a service failure leaves the submission successful.

## Out of scope

No change to the designer notification, the "Send to designer" step, or the digest
email. No schema change. The AM can still unflag anything.
