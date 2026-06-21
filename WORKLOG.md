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
