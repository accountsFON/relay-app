# Relay — Work Log

Running **task list + shipped log** for the Relay app, maintained across Claude
Code sessions on Julio's machine. Updated when a task ships and pushed to
`main`, so a `git pull` always shows the latest. Newest first.

Every shipped item below was built with tests (TDD), passed CI (Typecheck &
Test), and was deployed to prod (`accountsfons-projects/relay-app`).

---

## Open / in progress

- _(nothing in progress right now)_

## Notes / standing rules

- **Mobile:** every UI change is tested and adapted for phone width before it ships.
- **Hyperlinks:** any URL in user-entered free text is auto-linked, opens in a new tab, and wraps if long (centralized in `src/lib/linkify.ts` + `<Linkify>`).

---

## Shipped

- [x] **2026-06-22 — Client review: Approve All button** (PR #234)
  An "Approve all N posts" button on the client review surface flips every post to
  Approved at once (via the existing per-post draft PATCH, `suggestedCaption: null`
  to clear caption edits, keeping notes), skipping already-approved posts. Confirms
  first only when it would override existing Changes/caption-edits
  (`changesRequested + captionEdited > 0`). Submit stays separate. Hidden for a
  single post; disabled when all approved or in flight. UI only, no schema/endpoint
  change. 1680 unit tests. Caleb/Julio item 29.

- [x] **2026-06-22 — Client review: notes auto-save + visible save state** (PR #233)
  The Notes field on the client review surface auto-saved only on blur with no
  feedback (a note typed then abandoned without blurring was lost). Now it
  debounce-saves ~1s after the last keystroke + flushes on blur, with a save-state
  indicator (Saving… / Saved ✓ / Couldn't save · Retry, aria-live). `persistDraft`
  returns `Promise<boolean>` and `onCommentChange` is `Promise<boolean>` so the card
  drives the indicator; an out-of-order guard prevents a stale save flipping the
  state. Notes only (verdict pills + caption editor already signal state). UI only,
  no schema/endpoint change. 1671 unit tests. Caleb/Julio item 28.

- [x] **2026-06-22 — Cancel follow-ups: queued-cancel start guard + StatusDot color** (PR #232)
  Closes the last two cancel follow-ups. (1) The pipeline job's opening write was
  an unconditional `status:'running'`, which could clobber a cancel set while the
  run sat queued (resurrecting it + running the whole pipeline). Now
  `markRunRunningIfNotCancelled` does a guarded `updateMany`; on a concurrent cancel
  the job exits early (no work, not resurrected). (2) StatusDot gained a
  `cancelled → bg-neutral-400` color so cancelled runs in run-history get a distinct
  muted dot instead of the inactive gray. 1666 unit tests.

- [x] **2026-06-22 — Cancel: close TOCTOU window (atomic complete)** (PR #231)
  Follow-up hardening to #230. The pipeline's finalize point did a read-then-write
  (isRunCancelled guard, then an unconditional `status:'complete'` update), so a
  cancel committing between the read and write could be clobbered back to complete.
  Now a single atomic guarded write — `markRunCompleteIfNotCancelled` →
  `updateMany({ where: { id, status: { not: 'cancelled' } }, data: {...,status:'complete'} })`,
  returns `count>0`; on a concurrent cancel (count 0) the job returns early, skipping
  finalize/attach/notify. All cost/usage fields preserved. 1662 unit tests.

- [x] **2026-06-22 — Cancel content generation mid-flight** (PR #230)
  A user can cancel an in-progress generation run. Cancel discards everything
  (target batch untouched); the run lands in a new neutral `cancelled` RunStatus
  (additive enum migration), distinct from `failed`. `ContentRun.triggerJobId` is
  now populated at trigger time so a run is reachable; `cancelGenerationAction`
  (scoped to org + client assignment, gated on `client.edit`) marks the row
  `cancelled` (source of truth) then best-effort `runs.cancel()`. The pipeline
  guards on the DB status via `isRunCancelled` — before finalize (never attaches
  posts / marks complete / notifies) and in its catch (never re-labels failed),
  so it's race-proof. Cancel buttons on the in-flight banner + pill (confirm →
  action → poll refresh). 1660 unit tests; UI + a Trigger.dev pipeline change
  (the guard ships in the job). Known non-blocking follow-ups: a narrow TOCTOU
  window between the finalize guard read and the complete write; a cosmetic
  `StatusDot` color for cancelled.

- [x] **2026-06-22 — Client review: two verdicts + inline Edit copy** (PR #229)
  The magic-link client review surface dropped from three confusing buttons
  (Approve / Changes / Edit Copy) to two clear verdicts (Approve / Changes), with
  copy editing moved to an inline "Edit copy" link on the post caption; Notes stay
  optional under both. Approach: `caption_edited` is kept as an internal decision
  value (never a button) — saving a copy edit still persists
  `caption_edited` + `suggestedCaption`, and the Changes pill renders active for
  both `changes_requested` and `caption_edited`, so the AM side, summaries, digest
  email, `mapReviewDecision`, and the state machine are untouched. Editing reads as
  Changes; Approve on an edited post discards the pending suggestion
  (`suggestedCaption: null`). New `onEditCaption` prop on the IG/FB post
  components (gated, AM/designer surfaces unaffected); `DecisionButtonRow` reduced
  to two pills. 1644 unit tests; UI-only, no schema/migration. Caleb/Julio item 26.

- [x] **2026-06-22 — Comment image attachments Phase 2: use as post image** (PR #228)
  AM-only consumption of a client's attached reference image. New
  `useCommentImageAsPostMediaAction({postId,commentId})` (gated by
  `post.media.edit`, cross-tenant guarded, validates the image is a
  `comment-images/` blob URL) swaps the reference into `Post.mediaUrls[0]`
  (replace semantics, via `attachMediaToPost`), and a "Use as post image" button
  shows on attached images in `mode === 'internal'` only (clients never see it).
  `comment.id` threaded through the view types + hydration. No auto-resolve of
  the pin. Caleb/Julio item 25.

- [x] **2026-06-22 — Comment image attachments Phase 1: attach + upload + render** (PR #227)
  Reviewers (client, via magic link) and AMs can attach a single reference image
  to a review pin comment ("change the image to this"), rendered inline in the
  pin thread. New `PostComment.imageUrl` (+ dims). Two Vercel Blob upload routes,
  each forcing a server-side per-actor prefix + png/jpeg/webp/gif + 5MB cap: AM
  (`/api/comment-image/upload`, Clerk) and the reviewer route
  (`/api/review/[token]/comment-image/upload`, authed by the signed magic-link
  cookie + URL-token-hash match, NOT Clerk — the only upload path open to a
  token-only client; full security review, no gaps). Shared attach control in
  both pin composers, wired through the IG/FB feed posts to all three hosts with
  the `userDbId`/`tokenHash` upload identity threaded; write path persists with
  an `isCommentImageBlobUrl` guard. 1635 unit tests. Caleb/Julio item 25.

- [x] **2026-06-22 — Pipeline rework Phase 2: auto-advance silent client reviews** (PR #226)
  A relay sitting in Client Review with no client response now auto-advances to
  Scheduling after a per-org window (`Organization.reviewWindowDays`, default 7),
  treating silence as approval. New daily cron `auto-advance-stale-reviews`
  (`0 15 * * *`) + a `findStaleClientReviews` selector; `Batch.clientReviewStartedAt`
  stamps the window start on entering Client Review; per-relay opt-out
  (`Batch.autoAdvanceOnTimeout`) via a toggle on the Client Review surface. The
  per-org window editing UI was deferred (no editable org-settings page exists
  yet) so it ships at the 7-day default. 1562 unit tests; migration + Trigger.dev
  cron deploy verified in prod.

- [x] **2026-06-22 — Pipeline rework Phase 1: merged Client Review + Scheduling, renamed steps** (PR #225)
  Reworked the relay state machine for both tracks. Merged `sent_to_client` +
  `client_decision` into a single `client_review` step, and `ready_to_schedule` +
  `final_qa_schedule` into `scheduling` (two new RelayStep values; the old ones
  retained for historical rows). Renamed every step to its canonical name, made
  Onboarding AM-held (`relay.completeOnboarding` widened to account managers), the
  QA step renders Pre-Client QA / Final QA by `clientReviewEnabled`, rewrote all
  per-step checklists from the rework doc, and pointed `advanceFromClientReview`
  at the merged steps. A one-off cutover script moved the 10 in-flight prod batches
  off the retired steps (4 to client_review, 6 to scheduling, 0 stranded). 1545
  unit tests. Spec + plan: vault `projects/relay-app/2026-06-22-pipeline-rework-*`.

- [x] **2026-06-21 — Comment popover: close on outside click + unsaved warning** (PR #224)
  The client review comment popover only closed via the X; it now closes on an
  outside click too (Escape already worked), and every close path warns
  (`window.confirm`) before discarding an unsaved comment draft. Applied to both
  the thread popover (`PinPopover`) and the new-pin draft composer; shared, so AM
  pin surfaces get it too. Caleb/Julio item 24. (Follow-up: 2 optional regression
  tests deferred due to a transient API outage.)

- [x] **2026-06-21 — Full comment threads on review pins** (PR #223)
  Bug: pin/markup threads (client magic-link review + AM review/preview) only
  showed the first comment — replies saved to the DB but vanished on refresh
  ("can't leave more than one comment per post"). Root cause: `toHydratedThread`
  collapsed each thread to firstComment+count and the carrier types/adapters
  never passed the rest to PinPopover. Fix: carry the full `comments[]` through
  the pipeline, typed required so it can't regress. No schema change.
  Caleb/Julio item 23.

- [x] **2026-06-21 — Client review tutorial fires every load** (PR #222)
  The magic-link review tutorial now shows on every load (was once-per-reviewer,
  and had a first-load gate bug), with a Skip. Copy names all features (Approve /
  Changes / Edit Copy, click an image, select caption text, Submit Review); demo
  video kept; modal made mobile-friendly (`max-h-[90dvh]` scroll); Escape closes.
  Dropped the dead seen-persistence (tutorial-seen route + service removed; DB
  column left vestigial).

- [x] **2026-06-21 — Send review link is a checklist step** (PR #221)
  "Send review link" is now a required checklist item on the AM review step
  (when client review is on): it opens the send modal and checks itself once the
  link is sent, or "Mark done without sending" to skip — the pass into client
  review stays locked until one is chosen. Supersedes item 20's pass-time modal
  (removed); keeps the clientReviewEmail field, send→store sync, profile field,
  and prefill. Caleb/Julio item 21.

- [x] **2026-06-21 — Client review email + pass-time modal** (PR #219)
  Passing a relay into client review with no review email on file now interrupts
  with a modal (set the client's email → sends the magic link → advances),
  instead of an easy-to-miss inline banner. Adds `Client.clientReviewEmail`
  (editable on the profile with change-history, prefills the send-link modal,
  kept in sync by every send). On email-send failure the modal stays open with
  the error + a copyable review URL and does NOT advance. Retires
  `MissingClientUserBanner` + the dead `linkedClientUsers` count. Caleb/Julio
  item 20.

- [x] **2026-06-16 — Notification copy: baton-pass voice + destination stage** (`509dffc`, PR #218)
  Transition notifications + activity-thread rows now say what happened AND
  where the work moved, in the app's own baton-pass voice: "X passed you the
  baton on \"Label\". Now at Client review." / "X sent \"Label\" back to you for
  changes. Now at Design revisions." / "X brought \"Label\" across the finish
  line." The activity-thread rows previously read "passed Label to Person" with
  no destination stage at all; they now name it too. No writer/schema change
  (`toStep` was already in the payloads). Both surfaces stay in lockstep
  (`src/lib/notification-copy.ts` + `src/components/activity/event-renderer.tsx`).

- [x] **2026-06-16 — App icon / favicon get a solid background** (`d858dfa`, PR #217)
  All four icon assets (`icon-192`, `icon-512`, `apple-touch-icon`, `favicon.ico`)
  were a dark navy "R" on a fully transparent background, so the mark vanished
  on dark surfaces (Safari dark-mode tabs, dark home-screen wallpaper, Android
  adaptive-icon background) — and the apple icon was flagged `maskable`, which
  requires a solid fill. Regenerated from the brand source (`public/brand/icon-r-dark.svg`)
  onto a solid brand off-white (`--neutral-50`, #F6F7F6, matching the manifest
  PWA splash) with a ~13% safe-zone inset so the R survives rounded / maskable
  cropping. Added a reproducible generator: `scripts/generate-icons.mjs`.

- [x] **2026-06-15 — Client thread no longer clipped at the bottom** (`73f9470`)
  The client-thread chat box was cut off by the bottom of the screen. One root
  cause, two severities (verified live in-browser, before + after, on the prod
  deploy). **Mobile:** the floating-chat sheet used a bare `max-h-[85dvh]` with
  no definite height, so the `h-full` message list grew to its natural length
  (~1267px in a 567px sheet) and shoved the pinned composer ~645px off-screen —
  only history showed. **Desktop:** the sticky right rail's `max-h-[calc(100vh-2rem)]`
  ignored the 48px top bar + 16px sticky offset, clipping the Send button ~32px
  below the fold with no way to scroll to it. Fix: mobile sheet gets a definite
  `h-[85dvh]` + `overflow-hidden` + safe-area bottom inset; desktop rail + thread
  card move to `max-h-[calc(100dvh-5rem)]`. Adds a real mobile-thread-fab
  regression test (its discriminating assertions fail on the old code).

- [x] **2026-06-15 — Hyperlinks clickable app-wide** (`a0f9923`, `431a051`)
  URLs in thread comments, post captions / graphic hook / designer notes,
  markup pin comments, and review-session captions now auto-link, open in a new
  tab, and long URLs wrap instead of breaking layout. Reusable `lib/linkify.ts`
  (`splitOnUrls`) + `<Linkify>` component. Profile fields already had it.

- [x] **2026-06-10 — Mobile: relay timeline + action bar** (`c5efdce`)
  Relay stage timeline is now one horizontal swipe track on every viewport
  (was a 13-row vertical stack on mobile). Batch action buttons (Preview / Open
  in Canva / Open client / Send link) are a horizontal scroll bar on mobile
  instead of wrapping into stacked rows.

- [x] **2026-06-10 — Batch controls cleanup** (`fb84120`)
  "Collapse all / Expand all" restyled from borderless text to a clear bordered
  button. "Show archived" posts toggle removed (with its query plumbing).

- [x] **2026-06-10 — Inbox: Mark all as read = primary** (`7662690`)
  "Mark all as read" is the prominent primary action (greyed/disabled when
  nothing is unread); "Clear all" demoted to a subtle ghost. Also fixed a scope
  bug where mark-all-read crossed orgs.

- [x] **2026-06-10 — Inbox: scope + notify + paginate** (`760b8f9`)
  Inbox + bell scoped to the viewer's assigned clients (AM/designer; admins see
  all). Content-generation completion now always notifies the triggerer + the
  assigned AM. Inbox lazy-loads 10 with a "Load more" button.

- [x] **2026-06-10 — Terminology unification** (`574e334`)
  "Relay" replaces "batch" in all user-facing copy. "Content Generation" is the
  generation-event term (with "runs" as casual shorthand). Models/routes
  unchanged internally.

- [x] **2026-06-10 — Content runs: clickable + retention** (`0982242`)
  Content-gone runs hidden from the client list; clicking a run whose batch was
  archived now lands on it; retention extended to 67 days (auto-archive 37 +
  purge 30).

- [x] **2026-06-10 — Avatar fallback in completion lap** (`7ded0c9`)
  The "Relay complete" celebration shows a participant's Clerk profile photo as
  a fallback when they haven't uploaded an avatar (defers to uploads).
