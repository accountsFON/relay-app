# Relay — Work Log

Running **task list + shipped log** for the Relay app, maintained across Claude
Code sessions on Julio's machine. Updated when a task ships and pushed to
`main`, so a `git pull` always shows the latest. Newest first.

Every shipped item below was built with tests (TDD), passed CI (Typecheck &
Test), and was deployed to prod (`accountsfons-projects/relay-app`).

---

## Open / in progress

From the 2026-06-26 triage (Batch A + B + C shipped; Batch D Phases 1+2+3 done — full internal review parity):
- [ ] **(follow-up) Bell "Post N" copy** — the notification builder doesn't populate a per-post number (posts have no stored position); the copy ships fallback-safe. Add a cheap per-batch index map in `listMentionsForUser` to render true "Post N". (Batch B follow-up)
- [ ] **(follow-up) Set `NEXT_PUBLIC_APP_URL` in prod** to the friendly domain so review links don't depend on the Vercel alias fallback (see PR #268).
- [ ] **(follow-up, force-step) Harden the `LIVE_PIPELINE_STEPS` client-import boundary** — `admin-force-step-section.tsx` (client) imports it from `@/server/lib/relay-state-machine`. Safe today (the module has only type-only db imports), but relocating `LIVE_PIPELINE_STEPS` + the transition tables to a non-`@/server` module (or prop-passing the list from the server parent) would remove the latent risk of a future runtime server import breaking the client bundle. (surfaced in the #334 review)
- [ ] **(follow-up, designer flags) DB unique constraint on `DesignerFlag(postId, threadId, reviewItemId)`** to harden the flag find-then-create against a same-instant duplicate. Idempotent today (note gets updated); a partial unique index would make it airtight.
- [ ] **(cleanup, designer flags) Stale JSDoc on `AdvanceFromClientReviewInput.reviewSessionId`** still references the removed designer deep-link rationale (the auto `revision_images_requested` ping was deleted in #303). Tidy the comment.
- [ ] **(follow-up, designer gate) Page test for the archived-batch skip** — the designer onboarding gate correctly skips archived relays (`!batch.deletedAt`), but that specific guard has no page-layer test. Cheap add; guard is correct today.
- [ ] **(follow-up, designer tour) Test `startIfUnseen`'s `activeTourId` guard branch** — only the already-seen branch is exercised; the "no-op when a tour is already active" branch is untested. Code is correct. Also note `TourAutostart` fires for the rare designer-at-a-non-designer-step case (gate never shows there); still once-per-designer-global, acceptable.
- [ ] **(cleanup, image replace) Consolidate `DesignerRevisionUpload` + `MediaUpload` onto `useReplacePostImage`** — both still carry their own copy of the blob-upload → POST /media → refresh flow; the new shared hook is the single source of truth. Refactor them onto it when convenient.
- [ ] **(note, image replace) IG/FB posts now call `useRouter` unconditionally** (via `usePostImageReplace`) — any test rendering a real InstagramFeedPost/FacebookPost must mock `@/components/preview/post-image-replace`'s `usePostImageReplace` (or mount a router). Existing tests handled; keep in mind for new ones.

## Notes / standing rules

- **Mobile:** every UI change is tested and adapted for phone width before it ships.
- **Hyperlinks:** any URL in user-entered free text is auto-linked, opens in a new tab, and wraps if long (centralized in `src/lib/linkify.ts` + `<Linkify>`).

---

## Shipped

- [x] **2026-07-22 — "Social Preview" heading rendered as a muted pill** (PR #361, `91b6a2a`)
  Follow-up to #360. Styled the Social Preview heading as a rounded muted pill (`bg-neutral-100`,
  `rounded-full`, `px-4 py-1.5`) matching the retired PlatformToggle's footprint, instead of plain
  muted text. Shows on all 5 preview/review surfaces via `FeedShell` + `review-feedback-shell`.
  className-only change; `SocialPreviewHeading` + `FeedShell` tests pass, tsc + lint clean. No migration,
  no jobs.

- [x] **2026-07-22 — Facebook-only post previews with a "Social Preview" heading** (PR #360, `1e7bceb`)
  Retired the Instagram/Facebook platform toggle across all five preview/review surfaces (`/preview`,
  internal review, both client magic-link review surfaces, and the AM review-session detail) — every
  preview now renders the Facebook layout, with a small muted "Social Preview" heading where the toggle
  sat (new shared `SocialPreviewHeading`, rendered by `FeedShell` + `review-feedback-shell`). Instagram
  chrome is left dormant, not deleted: `InstagramFeedPost`, `PlatformToggle`, and `/design/preview-ig`
  stay in the tree; each surface seeds `const [platform] = useState<Platform>('facebook')` (value only,
  no setter) so re-enabling is just add `setPlatform` back + render the toggle. `FeedShell` dropped its
  `platform`/`onPlatformChange` props; downstream `ReviewPostCard`/`ReviewPostsCanvas` keep their
  `platform` prop (always fed `'facebook'`) so no component API/test churn. TDD: new `SocialPreviewHeading`
  + `FeedShell` tests; `review-feedback-shell` test moved to the Facebook post-pin badge (`fb-pin-badge`)
  + heading. 2589 tests, tsc + `next build` clean. No migration, no jobs.

- [x] **2026-07-21 — Populate completion-lap avatars with an initials fallback** (PR #356, `5961d0d`)
  The final completion celebration (`BatchCompletionLap`) resolves each racer's avatar (uploaded photo →
  real Clerk photo → fallback), but the fallback was a generic gray `UserCircle2` icon, so photo-less
  participants (common on prod's Clerk DEV keys, where auto-initials avatars are excluded) rendered as
  blank gray circles. Fallback now shows the participant's `initials()` on a brand-color circle
  (matching the app's avatar fallbacks) — always populated + identifiable; real photos still take
  precedence. TDD (photo-less → initials). 2584 tests, tsc + `next build` clean. No migration, no jobs.
  Note: real profile photos appear once team members upload avatars or after the prod Clerk keys cutover.

- [x] **2026-07-21 — Auto-close the pin popover when its post scrolls out of view** (PR #355, `6da5e98`)
  Follow-up to #354. The popover follows its pin; when the pin scrolled off it clamped to the viewport
  edge. Now, once you scroll BEYOND the post it originates from, it auto-dismisses: an
  `IntersectionObserver` on the post (`pinEl.closest('[data-post-id]')`) fires when the post fully leaves
  the viewport and calls `onClose`. Image pins only. Guarded by a draft ref so an in-progress reply is
  never silently discarded — a drafting user keeps the popover open. TDD (post-leaves → onClose; draft →
  stays). 2583 tests, tsc + `next build` clean. No migration, no jobs.

- [x] **2026-07-21 — Pin popover follows the pin via scroll-parent listeners** (PR #354, `95ae760`)
  Third + correct take after #351/#352 were reverted. Relay's review canvas scrolls inside a NESTED
  `main.overflow-y-auto` container, not the window — #351 listened only on window (nested scroll never
  reached it), #352's perpetual rAF loop didn't reposition + risked a freeze. This attaches an
  rAF-throttled reposition to the pin's actual scrollable ANCESTORS (Popper "scroll parents": walk up
  from the pin badge collecting overflow auto/scroll els) + window + resize — no perpetual loop, no
  freeze risk. Image pins only; listeners torn down on close. Also fixes the earlier mis-verification:
  test with a REAL wheel scroll, not programmatic scrollTop. TDD (scroll event on the pin's scroll
  parent re-anchors the popover). 2581 tests, tsc + `next build` clean. No migration, no jobs.

- [x] **2026-07-21 — REVERTED pin-popover scroll tracking (#351 + #352)** (PR #353, `3ea4d61`)
  Both scroll-follow attempts failed to work on prod (sampled measurements: the popover stayed at its
  open-time position while the pin scrolled away in the nested `main.overflow-y-auto` container), and
  #352's rAF polling loop coincided with a renderer freeze in testing — a real risk for every user who
  opens a pin popover, including external clients on the review surface. Reverted to the stable #350
  state (popover opens anchored at the pin; no scroll-follow). The rail→pin open (#348) and open-at-pin
  anchoring (#349/#350) are UNAFFECTED. **Open follow-up: "popover follows the pin on scroll" is still
  wanted** — needs a different approach (likely rendering the popover inside the scroll container so it
  moves with CSS, or resolving why the rAF loop didn't take on prod). 2580 tests, tsc + `next build`
  clean.

- [ ] **(follow-up) Pin popover should stick to the pin on scroll** — reverted #351/#352 didn't work on
  the nested-scroll-container review surface + risked a freeze. Revisit with the popover rendered inside
  the scroll container (CSS-native follow) rather than fixed-position + JS tracking.

- [x] **2026-07-21 — Fix: pin popover actually tracks its pin, via rAF polling** (PR #352, `5918161`)
  #351's window `scroll`/`resize` listeners did NOT work: Relay's review surfaces scroll inside a nested
  `main.overflow-y-auto` container whose scroll events don't reach a window listener (verified on prod —
  popover stayed put while the pin scrolled away). Replaced with an animation-frame polling loop (the
  Floating-UI `autoUpdate` pattern): while open, re-measure the live pin badge each frame and reposition
  only when it moves, so the popover stays glued to the pin regardless of what scrolls. Image pins only;
  loop torn down on close. 2581 tests, tsc + `next build` clean. No migration, no jobs.

- [x] **2026-07-21 — Pin popover stays glued to its pin while scrolling** (PR #351, `1c09e92`)
  The `PinPopover` is `position:fixed` at its open-time viewport coordinate, so scrolling left it behind
  while the pin moved with the content. It now re-measures the live pin badge on `scroll` (capture-phase,
  to catch nested scroll containers) + `resize`, rAF-throttled, and repositions — so it tracks the pin.
  Image pins only (they have a `markup-overlay-pin` badge); caption/post-level pins keep their static
  anchor. Applies to every pin-popover surface (rail open + direct pin click); listeners torn down on
  close/unmount. TDD (moving the live badge + a scroll event repositions the popover). 2581 tests, tsc +
  `next build` clean. No migration, no jobs.

- [x] **2026-07-21 — Fix: rail comment click again opens the pin popover (regression from #349)** (PR #350, `fcad6f6`)
  #349 wrapped the shell's `setFocusRequest` in `requestAnimationFrame` to measure the pin badge
  post-scroll; that deferral broke the OPEN entirely (popover never appeared on a rail click — caught on
  prod). The open must fire in the React click handler (as in #348). Since `selectPost` scrolls
  instantly, we read the badge's post-scroll `getBoundingClientRect` SYNCHRONOUSLY right after and set
  the anchor in the same handler — restores the open AND keeps the pin-anchored popover. 2580 tests, tsc
  + `next build` clean.

- [x] **2026-07-21 — Open the rail-focused pin popover AT the pin (not centered)** (PR #349, `7fc99eb`)
  Follow-up to #348. Opening a pin from the rail used a null anchor (centered popover). Now the rail
  measures the pin badge's post-scroll viewport position (`internal-review-shell` scroll is instant;
  `selectThread` rAF-measures `[data-testid="markup-overlay-pin"][data-thread-id=…]`) and threads it as
  `focusRequest.anchor` → `focusThread.anchor` → IG/FB `setPopoverAnchor`, so the popover opens next to
  the pin on the image (matching a direct pin click). Image pins only; caption/post-level pins have no
  badge → null → centered (unchanged). 2580 unit tests, tsc + `next build` clean. No migration, no jobs.

- [x] **2026-07-21 — Clicking a rail comment opens its pin on the internal review canvas** (PR #348, `1d814c0`)
  On `/preview`, clicking a feedback comment in the left rail now scrolls the canvas to its post AND
  opens that pin's popover (was post-level scroll only). Rail comment click → shell `selectThread`
  (scroll + bump a `focusRequest {threadId,postId,nonce}`) → per-post `focusThread` → IG/FB post opens
  the thread's `PinPopover` via a render-time reconcile (mirrors `openThreadAt(id,null)`, centered
  popover; works for image/caption/post pins). `ResolveCheckbox` gained an optional `onSelect`: the
  comment becomes its own button, a SIBLING of the resolve checkbox — resolving and opening are two
  independent, keyboard-accessible controls (no nested-interactive, no keydown cross-fire). Adversarial
  review CHANGES_REQUESTED → all findings fixed (keyboard Space/Enter on the checkbox no longer opens
  the pin; no button-in-button; dropped render-time `onOpenThread`). Cross-surface safe (focusThread
  undefined → reconcile never fires; onSelect absent → plain text). TDD mouse + keyboard. 2580 unit
  tests, tsc + `next build` clean. No migration, no jobs change.

- [x] **2026-07-21 — Widen the "Request changes?" modal further (md → lg)** (PR #347, `4c60274`)
  Follow-up to #346: `sm:max-w-md` (448px) still left the two long buttons edge-to-edge with a slight
  overrun. Bumped to `sm:max-w-lg` (512px) for breathing room (still a mobile-safe responsive override).
  Pure CSS. 2575 tests, tsc + lint clean.

- [x] **2026-07-21 — Widen the "Request changes?" modal so its buttons don't overflow** (PR #346, `d48a866`)
  The confirmation modal used the shared `DialogContent` default (`sm:max-w-sm` = 384px), too narrow for
  its two long footer buttons ("No, go back and add notes" + "Yes, request changes"), which overflowed the
  box. Widened to `sm:max-w-md` via a responsive override (twMerge swaps the default, keeps the mobile
  `max-w-[calc(100%-2rem)]` margin) — same mobile-safe pattern as the #340/#341 gate-modal fixes. TDD
  (asserts the dialog carries `sm:max-w-md`). Pure CSS. 2575 unit tests, tsc + lint clean. No migration,
  no jobs change.

- [x] **2026-07-21 — Platform-aware "⌘↵ / Ctrl+↵ to send" hint on comment composers** (PR #345, `45d837b`)
  The pin comment composers had the Cmd/Ctrl+Enter submit shortcut wired (PR #327) but no visible hint.
  Added a muted `⌘↵ to send` affordance to all three client-review composers (new-pin `PinDraftComposer`,
  pin-reply `PinPopover`, post-level `CommentThread`) via a new reusable `<SubmitCombo/>` that renders the
  platform-correct combo (`⌘↵` on macOS, `Ctrl+↵` on Windows/Linux) using `useSyncExternalStore` so SSR
  hydration matches (Mac default) then corrects on the client. Also swapped the two existing hardcoded
  `⌘↵` hints (activity comment composer + client-profile editors) onto it, fixing the wrong symbol shown
  to Windows users. TDD (SubmitCombo mac/win/linux/userAgentData tests). 2574 unit tests, tsc + `next build`
  clean. No migration, no jobs change.

- [x] **2026-07-20 — "Restart guided tour" now clears seenTours (replays all coachmarks)** (PR #344, `e8d4550`)
  `resetTour` cleared only `onboardingTourSeenAt` + `launchPadDismissedAt`, never the `seenTours` array —
  but the page coachmark tours (batch-detail, designer-batch-detail, client-detail, inbox, scheduling,
  clients) gate on `seenTours` via `startIfUnseen`. And `seenTours` was append-only (no other clear
  path), so once a user saw a coachmark tour, Restart left it suppressed with no way to replay. Now
  clears `seenTours: []` too, so Restart genuinely restarts every tour. TDD (resetTour test asserts
  `seenTours: []`). 2570 unit tests, tsc + `next build` + lint clean. No migration, no jobs change.

- [x] **2026-07-20 — Rework the designer relay tour to match the real page + spotlight uploads** (PR #343, `e72f288`)
  The designer relay walkthrough (`DESIGNER_BATCH_DETAIL_STOPS`) opened with the checklist, never showed
  the Upload images panel or the per-post image box, and merged "upload + hand back" into one coachmark.
  Reworked to 7 stops that walk the page in the order a designer actually works it (grounded via View-as
  on prod): track → posts → graphic hook → designer notes → **upload** → checklist → hand back. New
  "Upload your designs" stop spotlights the Upload images panel and explains BOTH paths — bulk (drop all,
  auto match by filename) and single (click the image box on any post). New
  `data-tour-anchor="relay-upload-images"` on the `BulkMediaUploadPanel` root. Tour id kept
  `designer-batch-detail-v1` (new designers only). TDD: 5-stop anchor assertion → 7-stop sequence + a
  test that the upload stop mentions bulk + single. 2570 unit tests, tsc + `next build` + lint clean. No
  migration, no `src/server/jobs/**` change.

- [x] **2026-07-20 — Seed the Copy Review checklist on pipeline batch creation + backfill** (PR #342, `f631d73`)
  Finished workflow-test **#8** properly. The Copy Review checklist rendered empty on real
  (AI-pipeline-generated) batches with Pass wrongly enabled. Root cause: checklist items are persisted
  `checklist_items` rows, seeded only on a transition INTO a step or in the admin create-batch path.
  The pipeline path `createBatchForRun` (`services/finalize-post-generation.ts`) created the batch at
  `currentStep:'copy'` but never seeded, and `copy` is the first step so nothing ever transitions into
  it to reseed. PR #320 shipped the UI + `CHECKLIST_SEED[copy]` but its tests fed items in directly,
  masking the gap. **Fix:** (1) `createBatchForRun` now seeds the copy checklist right after create,
  mirroring the admin path (covers `new` + `auto-new`); (2) data migration
  `20260720120000_backfill_copy_checklists` seeds the 3 copy items for every live copy-step batch with
  zero checklist rows — idempotent (deterministic `mig_ccb_` md5 ids + `NOT EXISTS` guard), skips
  soft-deleted / non-copy / already-seeded batches; (3) 2 new TDD tests on both create paths.
  Adversarial review READY_TO_MERGE, 0 critical/important. 2569 unit tests, tsc + `next build` + lint
  clean. Migration validated on ephemeral Postgres (idempotent, correct skip logic). No
  `src/server/jobs/**` change → Trigger.dev deploy skips.

- [x] **2026-07-20 — Widen the designer-gate client-profile modal (mobile-safe)** (PR #341, `03e5c24`)
  Parity with #340. The designer onboarding gate's profile Dialog passed a base `max-w-2xl`, but the shared
  `DialogContent` default caps at `sm:max-w-sm` (384px) on desktop, so the responsive class won and the modal
  rendered narrow. Fixed with `sm:max-w-3xl` (768px at >=640px) + dropping the base max-w so the default
  `max-w-[calc(100%-2rem)]` keeps 2rem mobile margins. Pure CSS: component test (5) passes, tsc + lint clean,
  CI green, accountsFON prod deploy succeeded. No migration, no jobs change.

- [x] **2026-07-13 — Copy-step onboarding gate for AMs + admins** (PR #339, `f34adc6`)
  Mirrored the shipped designer onboarding gate onto the `copy` step. An AM or admin opening a relay at `copy`
  now gets the workspace masked behind a one-item review card (open the client-profile modal → **Enter
  workspace**), recorded once per `(batch, user)`. New `CopyGateAck` model + additive migration
  `20260713120000_add_copy_gate_acks`, `copyGateAcks` repo, org-scoped `acknowledgeCopyGateAction`
  (`account_manager`/`admin` only, rejects designer/client + cross-org), single-item `CopyOnboardingGate`, and a
  page mount short-circuit right after the designer gate (fires only for AM/admin at `RelayStep.copy`, skips
  archived). Storage = dedicated model (zero touch to the shipped designer gate). Adversarial review
  READY_TO_MERGE 0 findings. TDD, 17 new tests, 2567 unit tests, tsc + `next build` clean. No `src/server/jobs/**`
  change so Trigger.dev deploy skips.

- [x] **2026-07-09 — Tenant-scope the thread action surface** (SECURITY, PR #338, `07fcee7`)
  Closed a CONFIRMED cross-tenant / cross-batch gap on `src/server/actions/threads.ts` (traced from the #336
  follow-up). Every thread action operated on the caller-supplied `postId`/`threadId`/`batchId`/`reviewItemId`
  with NO scope check: `resolveActor` dropped the AM's org and the magic-link reviewer's batch binding, and the
  services mutate/read by id. AM path = defense-in-depth; **reviewer path = the serious one** — an EXTERNAL
  magic-link reviewer is batch-bound but that binding was never enforced against the id they pass, and server
  actions are directly POST-able, so a reviewer could create/comment/read threads on another batch or org.
  **Fix (action layer; service attribution unchanged):** surfaced `batchId` on `MagicLinkReviewerContext`;
  richer `ActionActor` carries scope (AM → `organizationId`, reviewer → `batchId`) with `toThreadActor()`
  stripping back for the service; `assertScope` + `loadPost/Thread/Batch/ReviewItemScope` run BEFORE the
  service on all 8 actions (create/add/resolve/reopen/bulkResolve/replyToPostFeedback + 2 list reads) — AM must
  match org, reviewer must match their link's batch; unknown id or (reviewer) unbatched post → generic
  "Not found" (no existence leak). Mirrors the already-correct `useCommentImageAsPostMediaAction`. Adversarial
  security review READY_TO_MERGE, 0 critical/important (verified every action guarded, reviewer `batchId`
  server-derived + non-spoofable via the HMAC-signed cookie, AM-only actions still reject reviewers, no leak,
  loaders traverse non-nullable relations). TDD: 20 new cross-org / cross-batch / AM-only-rejects-reviewer /
  unknown-id / unbatched-denied / in-scope-succeeds tests, each asserting reject + service-not-called.
  2550 unit tests, tsc + `next build` clean. No `src/server/jobs/**` change → Trigger.dev deploy SKIPPED.
  Design: vault `projects/relay-app/2026-07-09-threads-tenant-scope-design.md`.

- [x] **2026-07-09 — Dedup dashboard `AM_TRACK_STEPS` onto `LIVE_PIPELINE_STEPS`** (force-step follow-up, PR #337)
  `dashboard/page.tsx` hand-maintained a second copy of the live-step list (fed to `bucketRunners` for the
  AM + designer relay track) — the same drift class #334 killed for the force-step dropdown. Pointed it at the
  derived `LIVE_PIPELINE_STEPS` (`const AM_TRACK_STEPS = LIVE_PIPELINE_STEPS`) and widened `bucketRunners`'
  `steps` param to `readonly RelayStep[]` (it only iterates). Value-identical refactor — the list matched
  exactly, so no behavior change; the existing dashboard bucketing tests (relays at copy/client_review/
  scheduling/completed bucket correctly) still pass and now exercise the derived source. Last hand-maintained
  copy of the pipeline step list is gone. 2530 unit tests, tsc + `next build` clean. No `src/server/jobs/**`
  change → Trigger.dev deploy SKIPPED.

- [x] **2026-07-09 — Org-scope guard on `tickChecklistItemAction`** (tenant-safety follow-up, PR #336)
  Defense-in-depth: the checklist-tick action loaded the batch with `currentHolder`/`clientId` but NOT
  `client.organizationId`, and the holder-override gate checks role but not org — so an AM/admin in org A with a
  foreign `itemId` could tick a checklist item on org B's batch. Added the org-scope guard mirroring
  `markBatchReviewedAction` (load `client.organizationId`, throw "Relay not found" on mismatch), placed BEFORE
  the holder gate so cross-tenant reads fail as not-found without leaking the item's existence. Strict check, no
  platformOwner bypass (matches the cited reference). Swept the sibling relay/notifications actions while here:
  all org-scope correctly (`notifications.submitPreviewReviewAction` scopes via `findClientForUser`); logged a
  follow-up to separately verify the `threads.ts` `resolveActor`-based thread actions (different auth model).
  TDD: cross-tenant test asserting reject + no mutation + guard-before-holder ordering (an admin who'd pass the
  holder override still gets "not found" cross-org). 2530 unit tests, tsc + `next build` clean. No
  `src/server/jobs/**` change → Trigger.dev deploy SKIPPED.

- [x] **2026-07-09 — Remove dead Fix-with-AI code** (WORKLOG cleanup, PR #335)
  Fix-with-AI was fully unmounted from the UI (redoPost / Regenerate-with-AI is the only AI caption tool now).
  Removed the orphaned chain: `fix-with-ai-button.tsx`, `diff-modal.tsx` (only the button used it), both
  `/api/posts/[id]/fix-with-ai` routes (`route.ts` + `accept/route.ts`), `services/fixWithAi.ts` (only the
  routes used it), `prompts/fixWithAiPrompt.ts` (only fixWithAi used it), their 5 test files, and the vestigial
  "never renders Fix with AI" absence-test block in `review-feedback-rail.test.tsx`. **Kept (verified live):**
  `redoPost`, `text-diff` (used by the digest email + review rail + caption-diff-view; has its own test), and
  the whole `post_caption_ai_fixed` RENDER path (event-renderer branch, `caption-ai-fixed-row`,
  notification-copy, `ActivityKind` enum) so historical events fixWithAi once wrote still render — fixWithAi was
  only the writer. Reworded three comments that referenced the deleted service. Net **-2167 lines**. Recon
  traced every importer + confirmed no runtime/string route references; the compiler (tsc + `next build`, clean
  after `rm -rf .next` to clear stale route-manifest types) proves nothing dangles. 2525 unit tests. No
  `src/server/jobs/**` change → Trigger.dev deploy SKIPPED.

- [x] **2026-07-09 — Refresh admin force-step dropdown to the live step set** (WORKLOG cleanup, PR #334, `892787e`)
  The admin "Force step" dropdown hand-maintained a `STEP_ORDER` list that drifted through three pipeline
  reworks: it listed 5 retired steps + `onboarding_gate` and OMITTED the two live steps `client_review` +
  `scheduling`, so an admin could not force a relay to either current step and could strand one on a dead-end.
  Derived the offerable steps from the state machine instead: new `LIVE_PIPELINE_STEPS` in
  `relay-state-machine.ts` = the ordered set of every step with an outgoing transition in either track
  (`copy → in_design → am_review_design → client_review → implementing_revisions → scheduling → completed`),
  structurally drift-proof. `admin-force-step-section.tsx` imports it and offers all-but-current-step; dropped
  the redundant `designs_completed` filter. No server-action change (`forceStepAction` already validates the
  target + `relay.forceStep` server-side; this strictly reduces the footgun surface). Adversarial review
  READY_TO_MERGE, 0 blocking defects; took its test-honesty nit (dropped a tautological drift-guard test — the
  exact-order `toEqual` is the real guard). TDD: state-machine describe (exact ordered set, includes the 2 live
  steps, excludes every retired step) + component test (offers the live steps incl. client_review/scheduling,
  never a retiree, excludes current). 2560 unit tests, tsc + `next build` clean. No `src/server/jobs/**` change
  → Trigger.dev deploy SKIPPED. Design: vault `projects/relay-app/2026-07-09-admin-force-step-live-steps-design.md`.
  Follow-ups logged above (dashboard `AM_TRACK_STEPS` dedup; client-import boundary).

- [x] **2026-07-09 — White-label client review email + review page** (P2 #21, PR #333, `b3483b1`)
  Org-level white-label for the client-facing surfaces. Admin-only `/settings/org` sets a logo URL + one
  accent color (`admin.portal` gated, double-enforced in the action; AM/designer/client blocked). New
  `Organization.brandLogoUrl` + `brandColor` (additive nullable migration `20260709120000_add_org_branding`,
  instant/metadata-only). New `src/lib/org-branding.ts` sanitizes both on write AND on read:
  `normalizeBrandColor` hex-anchored regex only, `normalizeBrandLogoUrl` `http(s)`-allowlisted via `new URL()`;
  rendered into React style objects / escaped attributes → no CSS or attribute-value injection. Client
  magic-link email: logo replaces the FON wordmark, accent color tints the CTA, org name in wordmark + footer.
  `/review/[token]` page: accent border-top. **Branding wired into ALL THREE `sendMagicLinkEmail` callers** —
  first send + resend (`magicLink.ts`) and the review re-round (`startNextRoundAction` in `reviewSessions.ts`,
  which previously sent the un-branded default), so a branded org keeps its branding on round 2+. Per Julio:
  every org's email shows its own `org.name` (`getOrgBranding` returns `org.name` unconditionally); logo +
  color only apply when set. Adversarial review READY_TO_MERGE on the security axis (injection blocked, admin
  gating solid, migration safe); the two behavioral findings resolved — #4 (name-for-all-orgs) is intended,
  #5 (third caller un-branded) fixed. TDD: org-branding helpers, email default-vs-branded render, action
  gating/validation/org-scope, subject rename, + re-round branding pass-through. 2555 unit tests, tsc +
  `next build` clean. No `src/server/jobs/**` change → Trigger.dev deploy SKIPPED. Design: vault
  `projects/relay-app/2026-07-09-white-label-branding-design.md`. **This was the last buildable punch-list
  item** — only #10 (Caleb wording) + #11 (Caleb + Mollie notification copy) remain, both blocked on input.
  **Follow-up (nit):** neither the review layout nor the email re-normalizes the DB value at render (safe
  today via the single normalized write path + React escaping; add normalize-on-read if a future write path
  bypasses the action).

- [x] **2026-07-09 — Review-link expiry date picker + expired page** (P2 #23)
  Three parts. (1) **Expired page:** new `inspectToken` in `magic-link.ts` distinguishes `expired` (valid
  HMAC, past expiry) from `invalid`; the middleware serves a friendly "This review link has expired" page for
  expired (via an `x-magic-link-expired` header + `<ReviewLinkExpired>`), still 404 for malformed/bad-sig and
  410 for revoked/missing. The guard now STRIPS all three trust headers from inbound and sets them
  authoritatively, so no crafted request header can reach the page (hardens the pre-existing id/batch trust
  too). (2) **Date picker + org default:** the modal's "Expires in (days)" number input is now a `type=date`
  picker defaulting to today + `Organization.reviewWindowDays` (the setting already existed; default 7), min
  tomorrow / max +90; submit converts the picked date to `expiresInDays` (action + 1..90 clamp unchanged).
  New pure `src/lib/expiry-date.ts` (format/addDays/daysUntilDate). (3) **Plumbing:** `reviewWindowDays`
  threaded through both send paths (batch page → `ChecklistPanel` → `SendToClientReviewButton` → modal;
  /preview → `MarkBatchReviewedButton` → modal) via a new `getReviewWindowDays(orgId)` repo read. Scope
  (Julio): read-only default now (no editable `/settings/org` UI — placeholder page, follow-up). Default
  expiry flips from a hardcoded 30 to the org value (7) — intended. Adversarial review READY_TO_MERGE, 0
  critical/important (security boundary verified: `expired` requires a valid signature; header-strip closes
  spoofing; fails closed). TDD: 11 new tests (expiry-date helpers, `inspectToken` statuses, expired-page
  short-circuit, date default + past-date reject). 2544 unit tests, tsc + `next build` clean.
  **Follow-up (nit):** no direct `guardReviewRoute` middleware test for the header-strip invariant —
  `middleware.ts` can't be imported in jsdom (Clerk), so a regression guard needs the guard extracted to a
  Clerk-free module. No `src/server/jobs/**` change -> Trigger.dev deploy SKIPPED. Design: vault
  `projects/relay-app/2026-07-09-review-link-expiry-picker-design.md`.

- [x] **2026-07-09 — Review link multi-recipient** (P2 #22)
  The Send review link modal now accepts comma-separated emails and sends ONE shared magic link to each
  recipient (the review model already supports multiple reviewers per link — each confirms their own name on
  arrival). New pure `src/lib/recipient-emails.ts` `parseRecipientEmails` (split on comma/semicolon/newline,
  trim, dedupe case-insensitively, validate). `createAndSendMagicLinkAction` input `recipientEmail: string`
  → `recipientEmails: string[]`; validates + dedupes server-side (defense in depth, throws before any side
  effect), mints ONE link (primary = first address), loops `sendMagicLinkEmail` per recipient with a
  per-recipient result (`recipients: {email,sent,error}[]`), keeps `emailSent`/`emailError`. A partial send
  failure never rolls back the link; the modal names the failed addresses. Activity payload keeps
  `recipientEmail` (primary) + adds `recipientEmails` + `recipientCount`. Modal email input `type=email` →
  `type=text inputMode=email` (native email input rejects comma lists), success line shows the recipient
  count. Adversarial review READY_TO_MERGE, 0 defects (only caller migrated; payload renderers key on
  recipientName; partial-failure + validation parity verified). TDD: 11 new tests (7 helper, 3 action incl.
  multi/partial/invalid, 1 modal). 2533 unit tests, tsc + `next build` clean. No `src/server/jobs/**` change
  -> Trigger.dev deploy SKIPPED. Design: vault
  `projects/relay-app/2026-07-09-review-link-multi-recipient-design.md`.

- [x] **2026-07-08 — Quieter designer notifications during client review** (P2 #28)
  A magic-link client dropping a pin during client review pinged the assigned designer's bell on every pin:
  `createThread` (`threads.ts`) auto-added `assignedDesignerId` to the `post_thread_opened` mentions
  regardless of actor. Gated that auto-notify to AM actors only (`isAmActor && designerId`). Now a client
  pin/reply pings only the AM (via `notifyAmOfClientReply`, unchanged) and still records for the activity
  feed; the designer is notified on the ACTIONABLE events instead — review submit (`reviewSessions.ts`
  mentions AM + designer) and the revision / designer-flag flows (`relay.ts`). AM internal-review pins still
  notify the designer + honor @-mentions (unchanged). Adversarial review READY_TO_MERGE, 0 defects (verified
  `createThread` was the only per-comment client→designer ping; all actionable designer paths intact). Minor
  incidental effect (consistent with the ticket): `promotePostFeedbackToThread`'s reviewer-authored seed
  (AM replying to client Notes) also no longer pings the designer once. TDD: flipped the reviewer-actor unit
  test to assert no designer mention; AM cases still assert it. 2522 unit tests, tsc + `next build` clean.
  No `src/server/jobs/**` change -> Trigger.dev deploy SKIPPED. Design: vault
  `projects/relay-app/2026-07-08-quiet-designer-notifs-design.md`.

- [x] **2026-07-08 — "Next step" banner label (no more clickable-looking arrow)** (P2 #20)
  The `NextActionBoard` "what to do next" banner showed a solid dark `ArrowRight` as its leading icon on the
  `action` tone, which read like a clickable button. Replaced it (action tone only) with a muted-gray
  uppercase "Next step" eyebrow label above the title; `done` (check) and `waiting` (clock) keep their
  leading icons. The action button's own arrow (inside `ActionLink`, on real buttons) is untouched. Pure
  presentational, one component. Adversarial review READY_TO_MERGE, 0 defects (tone union is a closed
  3-value set so the `else`→null branch is exactly `action`; layout fine with a single flex child; only
  consumer is the batch page via `primaryActionSlot`, unaffected). TDD: 4 new tests (eyebrow present on
  action / absent on waiting+done / no leading icon on action). 2521 unit tests, tsc + `next build` clean.
  No `src/server/jobs/**` change -> Trigger.dev deploy SKIPPED. Design: vault
  `projects/relay-app/2026-07-08-next-step-banner-label-design.md`.

- [x] **2026-07-08 — Resolved pins stay visible (greyed/struck), don't vanish** (P2 #26)
  Resolved pins used to disappear on the client magic-link review and the internal `/preview` because both
  hydrated threads via `listThreadsForBatch({ batchId })`, which excludes resolved by default. Flipped both to
  `includeResolved: true`. Rendering was already resolved-ready (image dots grey, caption pins grey +
  `line-through`, popover disabled + "Thread resolved"); added `line-through` to the resolved post-level
  badge in `instagram-post.tsx` + `facebook-post.tsx` for consistency (dot markers stay greyed — a struck
  digit reads worse). **Critical ripple fixed:** the client shell's `openPinCount` filtered by client-author
  but not status, so a resolved client pin would have counted as open feedback and flipped an approved post
  to "changes" on submit; added `t.status === 'open'` so it matches the server's open-client-pin routing
  (server is authoritative regardless, but the client counter now agrees). Also fixed the ChangesNavigator
  nav item `resolved` flag (was hardcoded false). The AM review-session page already included resolved (no
  change); every `/preview` open-feedback count already filtered open. Adversarial review READY_TO_MERGE, 0
  blocking defects (verified submit-routing parity across all four approved/resolved/AM/client pin cases).
  TDD: 7 new tests (resolved-client-pin-doesn't-count [critical], post-badge strike in ig/fb, + both pages
  assert `includeResolved: true` to guard against a silent revert). 2518 unit tests, tsc + `next build`
  clean. No `src/server/jobs/**` change -> Trigger.dev deploy SKIPPED. Design: vault
  `projects/relay-app/2026-07-08-resolved-pins-visible-design.md`. Follow-up: `postHasNewAmReply` doesn't
  filter status, so a resolved client thread with an unseen AM reply now shows a "new reply" badge (cosmetic,
  clears on view).

- [x] **2026-07-08 — Cmd/Ctrl+Enter to send comments on the client review** (P2 #25)
  The client magic-link review had keyboard-submit on the new-pin composer (`PinDraftComposer`) but not on
  its two reply/comment composers. Added Cmd/Ctrl+Enter to both `PinPopover` (pin-thread reply) and
  `CommentThread` (post-level "Comments" / "Start a discussion"), mirroring the draft composer: mention
  dropdown consumes nav/insert keys first, then `Enter && (metaKey || ctrlKey)` submits; plain Enter still
  inserts a newline. Extracted a `submit()` core in each so the form path and the shortcut share one guard
  (empty/`submitting`). PinPopover is shared, so internal `/preview` + AM inline replies get it too.
  Adversarial review of the initial PinPopover-only cut flagged the `CommentThread` gap (folded in) + a
  resolved-guard nit (added `thread.status === 'resolved'` short-circuit for defense-in-depth). Out of scope:
  `PinCommentRow` (AM feedback rail, not the client view). TDD: 8 new tests (metaKey/ctrlKey/plain-Enter/empty
  across both composers). 2512 unit tests, tsc + `next build` clean. No `src/server/jobs/**` change ->
  Trigger.dev deploy SKIPPED. Design: vault
  `projects/relay-app/2026-07-08-cmd-enter-send-comment-design.md`.

- [x] **2026-07-08 — Client feedback pin label → "N comments"** (P2 #24)
  The post-level feedback pin badge on a feed post used to read `📍 Post · N` (Caleb read "Post · 2" as a
  post number on the 2026-07-02 workflow test). It now shows a lucide `MessageSquare` icon + `N comments`
  (pluralized; `1 comment` singular). `commentCount = comments.length`, always ≥1 for a post-level thread,
  so no "0 comments" case. Shared one-spot change in `instagram-post.tsx` + `facebook-post.tsx`, so it fixes
  the client magic-link review, internal `/preview`, and AM review-session surfaces at once; image/caption
  pins (numbered dots / highlights) are separate primitives, untouched. No server/data/schema change. TDD
  (label assertions added to both preview post test suites). Adversarial whole-branch review READY_TO_MERGE,
  0 defects. 2504 unit tests, tsc + `next build` clean, changed-file lint clean. No `src/server/jobs/**`
  change -> Trigger.dev deploy SKIPPED. Design: vault
  `projects/relay-app/2026-07-08-pin-comment-count-label-design.md`.

- [x] **2026-07-08 — Designer feedback view filtered to changed posts** (P2 #29)
  On the review-session detail page a designer now sees only the posts relevant to them, not the whole
  batch. Signal: `hadFeedback` (client changed/edited, a thread, or a comment) OR any post the AM flagged
  for the designer. Extracted a shared `hadFeedback` (rail + page share it) and a distinct
  `isRelevantToDesigner = hadFeedback || flags.length > 0`; the page filters the designer's posts
  server-side; the shell shows a "No changes to work on" empty state when the filtered set is empty. AM/admin
  unchanged. **Adversarial review caught a CRITICAL bug** (fixed): the first cut filtered on `hadFeedback`
  alone, so an AM-flagged CLEAN-APPROVED post vanished from the designer's view — and if it was the only
  flagged post, `shellPosts` went empty, the empty state hid the flag + the mark-revisions-done control, and
  the batch could DEADLOCK in `awaiting_design_revisions`. Fixed by folding flags into the designer-relevance
  predicate (kept the rail's AM "Changes only" toggle on `hadFeedback` only) + a flag-coverage regression
  test. Re-review RESOLVED. 2500 unit tests, tsc + `next build` clean. No `src/server/jobs/**` change ->
  Trigger.dev deploy SKIPPED. Design + plan: vault
  `projects/relay-app/2026-07-08-designer-feedback-view-filter-{design,plan}.md`.

- [x] **2026-07-08 — Scheduling export consolidation** (P2 #30)
  The always-on top-toolbar "Export CSV" button is gone; the Scheduling step's next-steps banner now
  carries ONE combined "Export CSV & go to NectrCRM" button — one click downloads the Social Planner CSV
  then opens NectrCRM in a new tab (relay stays open). New `ExportAndScheduleButton` (reuses
  `toSocialPlannerCsv` + `NECTR_CRM_URL`); `NextActionBoard` gained a `primaryActionSlot`; the batch page
  passes the button into it at scheduling and drops the standalone toolbar Export (kept the plain
  `GoToNectrCrmButton` chip). The banner's plain Go-to-NectrCRM link was dropped from `nextActionForRelay`
  (batch-page-only consumer); `SCHEDULING_STEPS` exported; orphaned `ExportButton` deleted. **Adversarial
  review caught 2 real regressions** (fixed): the new slot dropped the old `isLive && canAct` guards, so the
  button would have shown to non-AM roles (inside a "Waiting on the AM" banner) and on archived batches —
  re-gated on `isLive && canAct`. 2489 unit tests, tsc + `next build` clean. No `src/server/jobs/**` change
  -> Trigger.dev deploy SKIPPED. Design + plan: vault
  `projects/relay-app/2026-07-08-scheduling-export-consolidation-{design,plan}.md`.

- [x] **2026-07-08 — Client review counter accuracy** (P2 #27)
  Reframed by Julio (punch list said "remove the broken '1 approved / 0 changes / 2 edits' banner"; instead
  FIX it). The client magic-link review counter (`SubmitReviewBar`) counted a post marked approved-but-
  carrying-feedback (a saved copy edit or an open CLIENT pin) as a clean "approved", mismatching the server
  submit routing (`isApprovedWithFeedback`) and causing a false "all approved" flash. New pure
  `summarizeReviewDecisions` helper (reuses `isApprovedWithFeedback`) reclassifies approved-with-feedback →
  changes; the shell's summary useMemo calls it. Also fixes the `ApproveAllButton` all-approved gate for
  free. **Adversarial review caught a real gap** (fixed + tested): the pin count must scope to CLIENT-
  authored open pins (`firstComment.author.kind === 'client'`), mirroring the server's `reviewerToken != null`
  — an AM pin on an approved post must NOT make it "changes" or the counter would disagree with submit again;
  plus corrected the Approve-all confirm `overrideCount` to count explicit `changes_requested` only. 2486
  unit tests, tsc + `next build` clean. No `src/server/jobs/**` change -> Trigger.dev deploy SKIPPED. Design +
  plan: vault `projects/relay-app/2026-07-08-client-review-counter-accuracy-{design,plan}.md`.

- [x] **2026-07-08 — Removed Pre-Client QA as its own step** (P1 #13)
  From the 2026-07-02 workflow-test punch list — the heaviest P1. `am_qa_pre_client` is removed from the
  live flow (enum kept for history): Design Review now advances STRAIGHT to Client Review (review clients)
  or Scheduling (no-review), through a confirm modal that folds in the final-QA once-over (3 ephemeral
  checkboxes, client-side gate) + the review-link generation (the existing SendLinkModal), on BOTH the
  batch-page Pass button (new `SendToClientReviewButton`) and the /preview Mark-reviewed modal (merged into
  the #12 modal). Modal titled "Send to Client Review" (review) / "Final QA" (no-review). Send-backs that
  targeted QA (from client_review + scheduling) now target Design Review. Old QA checklist seed emptied;
  the "Send review link" checklist row + `sendLinkAlreadyActive` removed. `am_qa_pre_client` stripped from
  the live tracks/dashboard/next-action/sub-status/admin-force-step (labels kept for history). Migration
  script `scripts/remove-pre-client-qa.ts` moves any stuck QA batch back to Design Review (run --apply after
  deploy; dry-run showed the prod count first). Built subagent-driven (8 tasks) + a whole-branch adversarial
  review (READY_TO_MERGE, 0 critical/important; 2 nits fixed: skip-link bypass now gated on the once-over,
  dev seed retargeted off QA). 2479 unit tests, tsc + `next build` clean. No `src/server/jobs/**` change ->
  Trigger.dev deploy SKIPPED. Design + plan: vault `projects/relay-app/2026-07-07-remove-pre-client-qa-step-{design,plan}.md`.

- [x] **2026-07-07 — Designer My Relay shows the full lifecycle** (P1 #14)
  From the 2026-07-02 workflow-test punch list. The designer "My relay" track bucketed by
  `DESIGNER_TRACK_STEPS` = `[in_design]` only, so a relay assigned to the designer at any other step was
  invisible. Now the designer track buckets by the full lifecycle (scoped to their assigned clients).
  **Fixed a latent bug found en route:** the shared `AM_TRACK_STEPS` was stale — it listed the RETIRED
  pre-2026-06-22 steps and was MISSING the current `client_review` + `scheduling`, so `bucketRunners`
  (exact `currentStep` match) silently dropped current-step relays from BOTH the AM and designer tracks and
  rendered 5 empty zombie stations. Rewrote it to the live set: `copy, in_design, am_review_design,
  am_qa_pre_client, client_review, implementing_revisions, scheduling, completed`. Kept the "Awaiting your
  revisions" tile; refreshed 2 copy strings. No schema/query/server change. 2482 unit tests, tsc + `next
  build` clean. Adversarial whole-branch review READY_TO_MERGE (0 critical/important). No `src/server/jobs/**`
  change → Trigger.dev deploy SKIPPED. **Known caveat (acceptable):** a pre-rework batch stranded at the
  retired `revisions_complete` step (not in the cutover MOVES map) no longer shows on the track, but is still
  reachable via the client page's Active Batches + admin force-step/archive. Design + plan: vault
  `projects/relay-app/2026-07-07-designer-my-relay-full-lifecycle-{design,plan}.md`.

- [x] **2026-07-07 — Copy step collapsed to a single checklist** (P1 #8)
  From the 2026-07-02 workflow-test punch list. The copy step was the only step with a two-panel
  sidebar: a `CopySubStatePanel` (`generating → drafted → approved` sub-state machine) stacked above the
  standard `ChecklistPanel`. Removed the sub-state panel so copy renders one checklist like every other
  step. Key finding: the "enforce all checked before Pass" half was ALREADY done — copy checklist items
  are seeded `required` via `required: item.required ?? true`, so Pass was already gated. Deleted the panel
  + its dead `advanceCopySubStateAction` + the stale QA-index entry; the one display consumer
  (`batch-sub-status.ts` kanban chip) now shows a static "Reviewing copy". `Batch.currentSubState` stays
  (still used by `am_review_design`'s `awaiting_design_revisions`); vestigial writes in
  `finalize-post-generation.ts` + `relay-admin.ts` left as harmless cleanup follow-ups. 2480 unit tests,
  tsc + `next build` clean. Adversarial whole-branch review READY_TO_MERGE (0 critical/important). No
  `src/server/jobs/**` change → Trigger.dev deploy SKIPPED. Design + plan:
  vault `projects/relay-app/2026-07-07-copy-step-single-checklist-{design,plan}.md`.

- [x] **2026-07-07 — Active Relays excludes completed (auto-archive already existed)** (P1 #7)
  From the 2026-07-02 workflow-test punch list ("4 active when 2 completed"). Root cause: the
  `listActiveBatchesForClient` query excluded only the RETIRED `final_qa_schedule` terminal step, not the
  current terminal `completed` (added in the pipeline rework), so completed relays counted as active.
  Fixed to `currentStep notIn [completed, final_qa_schedule]`. Archived relays were already excluded (the
  Prisma soft-delete extension). **The "auto-archive completed relays" half was already shipped:** the
  `autoArchiveCompletedRelays` cron sweeps `completed` batches past 37 days (`completedAt` anchor set in
  `finishBatch`, invoked daily from `purgeArchivedItems`) — so no new cron was needed and no
  `src/server/jobs/**` change -> Trigger.dev deploy SKIPPED. 2479 unit tests (updated the active-query
  test to assert the two-terminal `notIn`). tsc + `next build` clean.

- [x] **2026-07-07 — Notification click anchors to the review banner** (P1 #19)
  From the 2026-07-02 workflow-test punch list. Clicking a batch-level notification (baton passed, step
  advanced, sent back, content ready) dumped the AM at the top of the batch page, because it anchored to a
  `#comment-{eventId}` activity-thread row that lives in a desktop-only rail / mobile drawer and often
  isn't in view. Now those notifications anchor to the relay's "what to do next" banner (NextActionBoard).
  New `#action-{batchId}` anchor prefix in `EventAnchor`, `data-action-board={batchId}` + `scroll-mt-20` on
  the board (new `anchorId` prop), and `resolveHref`'s batch-level branch routes to `#action-{batchId}`.
  Post (`#post`) and client-root (`#comment`) anchors unchanged. 2479 unit tests (updated the inbox +
  summary-route href assertions + 2 new for the anchor/board). tsc + `next build` clean; changed-file lint
  clean (the pre-existing `Date.now()` purity error in the batch page is not mine). No `src/server/jobs/**`
  change -> Trigger.dev deploy SKIPPED.

- [x] **2026-07-07 — Approve preserves copy edits; approved-with-feedback routes to Client revisions** (P1 #16)
  Reframed by Julio in the walkthrough (not "disable Approve"). Client magic-link review: clicking Approve
  now PRESERVES a saved copy edit instead of nulling it (`review-session-shell.tsx` `handleDecisionChange`);
  Approve-all skips posts carrying an edit (never discards) and only confirms plain Changes it would flip.
  A post the client marked `approved` but that carries a copy edit OR an open client pin is not a clean
  approval: new shared `isApprovedWithFeedback` (`src/lib/relay-review-decision.ts`) forces the submit
  routing to `changes` -> Client revisions (`reviewSessions.ts` `submitSessionAction`, using `pinsByPostId`),
  and the AM detail page renders its verdict as caption-edit / changes instead of green Approved. **Adversarial
  review caught a real gap:** an approved-with-copy-edit post (no pins) was omitted from the AM digest email
  (`ReviewSubmittedDigestEmail.tsx` `actionableItems` filter + `isEdit`); fixed so it surfaces as a caption
  edit. 2477 unit tests (10 new/inverted), tsc + `next build` clean; whole-branch review READY_TO_MERGE after
  the digest fix. Non-blocking follow-up (client "all approved" bar vs server routing) logged above. No
  `src/server/jobs/**` change -> Trigger.dev deploy SKIPPED. Design: vault
  `projects/relay-app/2026-07-07-approved-with-edits-design.md`.

- [x] **2026-07-07 — Mark Relay Reviewed: confirm modal + checklist gate + double-click fix** (P1 #12)
  From the 2026-07-02 workflow-test punch list. The `/preview` "Mark relay reviewed" button advanced the
  instant it was clicked (gated only on open threads, PR #297). Now: (1) clicking opens a base-ui confirm
  modal (mirrors `request-changes-button.tsx`) with the review checklist embedded (tickable, optimistic
  via `tickChecklistItemAction`) + "this will move it to the next step"; the confirm is enabled only when
  every required item is checked. (2) `markBatchReviewedAction` gained a server-side checklist gate
  (counts required+unchecked items for the current step, throws) as defense in depth, next to the existing
  thread gate. (3) **Double-click fix:** the button (whole `amControlsSlot`) now renders ONLY at
  `am_review_design` — it used to render at every step where `canEdit`, so after advancing design-review →
  QA it reappeared and a second click advanced again. Julio's calls: render the checklist inside the modal
  (the toolbar has no room for a panel), and gate to `am_review_design`. 2467 unit tests (5 new), tsc +
  `next build` clean. Whole-branch adversarial review READY_TO_MERGE (0 defects; confirmed no capability
  stranded — other steps advance via the batch-page Pass button). No `src/server/jobs/**` change →
  Trigger.dev deploy SKIPPED. Design: vault `projects/relay-app/2026-07-07-mark-reviewed-modal-checklist-design.md`.

- [x] **2026-07-07 — Notification mark-as-read + delete affordances** (P1 #18)
  From the 2026-07-02 workflow-test punch list: replace the inbox row's single "X" with explicit
  controls, and add a dismiss action to the bell dropdown. **Inbox rows** (`inbox-row.tsx`) now show an
  envelope (Mark as read, unread only) that marks read in place via `markMentionReadAction` without
  navigating or deleting, plus a trash (Clear notification) that deletes via `clearMentionAction`
  (row-body click still navigates + marks read, unchanged). **Bell dropdown rows** (`notification-row.tsx`)
  gained a Dismiss button; the row was restructured from a single `<button>` to a div wrapper so the two
  buttons are valid siblings (no nested interactive elements). New provider `clear(eventId)`
  (`notification-provider.tsx`) mirrors `markRead`: optimistic remove + rollback, calls
  `clearMentionAction`. Both server actions already existed. 2462 unit tests (5 new), tsc + `next build`
  clean. Whole-branch adversarial review READY_TO_MERGE (0 defects: no nested buttons, outside-click
  preserved, mobile swipe untouched, no stranded `useNotifications` consumers). No `src/server/jobs/**`
  change → Trigger.dev deploy SKIPPED.

- [x] **2026-07-07 — Remove "uploaded to Dropbox" from the Initial Design checklist** (P1 #9)
  From the 2026-07-02 workflow-test punch list: the `in_design` step's checklist carried "Visual content
  has been uploaded to the corresponding Dropbox", which belongs in a later step (upload happens after
  review, not during design). Julio confirmed it was a misstep. Removed the one seed line in
  `src/lib/relay-checklists.ts`; tightened `relay-checklists.test.ts` to assert the exact 3 remaining
  labels (pins the removal). Initial Design now has 3 items. 2457 unit tests, tsc + `next build` clean.
  No `src/server/jobs/**` change → Trigger.dev deploy SKIPPED.

- [x] **2026-07-07 — Block designers from the internal /library QA index** (P1 #15)
  From the 2026-07-02 workflow-test punch list: a designer could reach `/library` (the beta QA index
  listing every internal route + component). New `canViewLibrary(ctx)` predicate (`src/lib/library-access.ts`,
  mirrors `isArchiveViewer`: admin / account_manager / platformOwner only) now gates BOTH the route
  (`library/page.tsx` redirects designers + clients to `/dashboard`) and the sidebar nav link
  (`app-chrome.tsx` `showLibrary`), so link and route agree. The other half of #15 (client review link
  hidden from designers) was already shipped. 2457 unit tests (3 new), tsc + `next build` clean. No
  `src/server/jobs/**` change → Trigger.dev deploy SKIPPED. Triage: vault
  `projects/relay-app/2026-07-02-workflow-test-priorities.md`.

- [x] **2026-07-06 — Drag-and-drop + click image replace on the /preview internal review** (PR #312, `b40406b`)
  P0 #4 (final P0) from the 2026-07-02 workflow test. A media editor (designer + AM) replaces a post's
  design image in place: drag an image onto the post (a "Drop to replace" overlay shows while dragging)
  OR tap a small corner "Replace" button (mobile path). Reuses the existing blob upload flow (no new
  server code; `post.media.edit` + `assertBatchEditable` gates unchanged). New units: `useReplacePostImage`
  (shared upload hook, extracted from the flow DesignerRevisionUpload/MediaUpload each duplicate),
  `useImageDrop` (drag state/handlers, spread on the REAL image container so drag never blocks the AM's
  pin clicks), `usePostImageReplace` (returns `{dragProps, isDragging, overlay}`; overlay is
  pointer-events-none except the corner button). Threaded via a `canReplaceImage` capability
  (`canUploadPostMedia(ctx)`) from the /preview page → InternalReviewShell → ReviewPostCard → IG/FB posts.
  Clients never see it. **Review caught a real regression:** the first design gave the designer a
  whole-image tap-to-pick that occluded the feedback pins the designer must click to reply; fixed to the
  corner button for BOTH roles (Julio's call). 2454 unit tests, tsc + `next build` clean; whole-branch
  adversarial review confirmed the fix (server-untouched, client-unaffected, hooks-rule, pins-intact). No
  `src/server/jobs/**` change → Trigger.dev deploy SKIPPED. Design + plan: vault
  `projects/relay-app/2026-07-06-drag-to-replace-image-{design,plan}.md`.

- [x] **2026-07-06 — Confirm modal before "Request changes" sends** (PR #311, `98d458d`)
  P0 #5 from the 2026-07-02 workflow test. The AM's "Request changes" button on `/preview` auto-sent
  `requestDesignChangesAction` the instant it was clicked (Caleb hit it by accident, no notes). Now it
  opens a base-ui confirmation `Dialog` (mirrors `close-account-panel.tsx`): "Request changes? This will
  notify [designer] that you've completed your feedback." with **Yes, request changes** (fires the
  action) / **No, go back and add notes** (closes, no-op). All existing states (pending/sent/error,
  disabled) unchanged, just gated behind the confirm; the action + page + designer buttons + client
  surface untouched. Change is contained to `RequestChangesButton`. 2439 unit tests (8 on the component:
  4 updated from direct-fire to click-through + 4 new), tsc + `next build` clean; diff verified (action
  fires only from confirm, cancel is a true no-op, no double-fire). No `src/server/jobs/**` change →
  Trigger.dev deploy SKIPPED. Design + plan: vault
  `projects/relay-app/2026-07-06-request-changes-confirm-modal-design-plan.md`.

- [x] **2026-07-06 — Gate designer "Mark revisions done" on all threads resolved** (PR #310, `a67d2de`)
  P0 #3 from the 2026-07-02 workflow test. On the `/preview` internal review, the designer's "Mark
  revisions done" button let them complete a revision round with open pins/comments still standing
  (Caleb's flag). The AM's "Mark relay reviewed" was already gated (PR #297); this adds the identical
  gate to the designer button, client + server. Server: `markDesignRevisionsDoneAction` counts open
  threads (`PostThread.status === 'open'` across the batch's posts) after the auth block, before the
  service call, throws when > 0 (same query shape as `markBatchReviewedAction`). Client:
  `MarkRevisionsDoneButton` gains an `openThreadCount` prop → disabled + hint ("Resolve N open
  thread(s) before marking revisions done") + `handleClick` early-return (defense in depth; server
  holds even if UI bypassed). Page passes the same `feedPosts.reduce(...status==='open'...)` count the
  AM button uses, so both gate consistently. AM button/action untouched. 2435 unit tests, tsc +
  `next build` clean; whole-branch adversarial review READY_TO_MERGE (0 defects). No `src/server/jobs/**`
  change → Trigger.dev deploy SKIPPED. One full-suite catch: a separate `mark-design-revisions-done-real-
  permissions.test.ts` needed `db.postThread.count` mocked to 0 in its happy paths (the new gate's data
  dep); rejection paths throw at auth before the gate, so untouched. Design + plan: vault
  `projects/relay-app/2026-07-06-designer-revisions-gate-design-plan.md`.

- [x] **2026-07-06 — Designer first-time workspace tour** (PR #309, `da09843`)
  P0 #2 from the 2026-07-02 workflow test. The first time a designer lands on a relay's design
  workspace, a 5-stop guided tour auto-runs once (your checklist → the post content → the graphic hook
  → designer notes → upload & hand back), persisted in `User.seenTours`. Fires explicitly on workspace
  mount, NOT via the route auto-fire: the engine's auto-fire effect keys on `pathname` (+ role/seen),
  and clearing the onboarding gate (PR #308) swaps gate→workspace via a same-route revalidation with no
  pathname change, so a plain `trigger:'auto'` tour would silently miss the first visit. Mechanism: new
  `designer-batch-detail-v1` tour (`trigger:'manual'`, so it's excluded from route auto-fire and never
  double-fires); new `startIfUnseen(tourId)` controller method (starts only if unseen AND nothing
  active); a `TourAutostart` component rendered only in the designer workspace path (mounts after the
  gate clears, anchors present same paint) that calls `startIfUnseen` on mount. Shared `batch-detail-v1`
  narrowed to `['admin','account_manager']` so designers get the tailored tour; AMs/admins unchanged.
  Added `relay-graphic-hook` + `relay-designer-notes` anchors to PostCard. 2429 unit tests (12 new),
  tsc + `next build` clean; whole-branch adversarial review READY_TO_MERGE (0 critical/important; fires-
  once-after-gate, no double-fire, no regression to other tours, anchor fidelity all verified). No
  `src/server/jobs/**` change → Trigger.dev deploy SKIPPED. One mid-build catch: an implementer briefly
  removed designer from the unrelated `overview-v1` dashboard tour to satisfy a test; reverted, the test
  was fixed to use a non-matching pathname instead. Design + plan: vault
  `projects/relay-app/2026-07-06-designer-first-time-tour-{design,plan}.md`.

- [x] **2026-07-06 — Designer onboarding gate (per-run mask + review checklist)** (PR #308, `7f93844`)
  P0 #1 from the 2026-07-02 workflow test. When a **designer** opens a relay at a designer step
  (`in_design` or `implementing_revisions`) and hasn't acknowledged yet, the batch page renders a
  masked **DesignerOnboardingGate** (skeleton backdrop) instead of the workspace, with a two-item
  click-to-review checklist: (1) Review client profile → in-app modal with read-only `ClientProfileView`;
  (2) Review brand guide → opens `resolveCanvaUrl(client.canvaUrl)` (client Canva, or the agency
  fallback folder) in a new tab. Opening a resource marks it done; both done → **Enter workspace** →
  `acknowledgeDesignerGateAction` upserts a `DesignerGateAck`. **Once per relay per designer** (keyed
  `batchId+userId`, so one ack covers both designer steps; a refresh/return doesn't re-gate, a new
  relay does). Admins/AMs/clients never see it; archived relays skip it. It's a UX/render gate
  (server-rendered), not a hard per-action lock (explicit non-goal). New additive `DesignerGateAck`
  model + hand-authored `migrate deploy`-safe migration, org-scoped repo, designer-only org-scoped
  action, base-ui Dialog component, batch-page branch that short-circuits before the expensive load.
  2417 unit tests (16 new), tsc + `next build` clean; whole-branch adversarial review READY_TO_MERGE
  (0 defects: tenant isolation, ack idempotency, trigger matrix, build-gate rules, migration safety all
  verified). No `src/server/jobs/**` change → `detect-pipeline-changes` + Trigger.dev deploy SKIPPED.
  Design + plan: vault `projects/relay-app/2026-07-06-designer-onboarding-gate-{design,plan}.md`.

- [x] **2026-07-03 — Email the new holder when a relay's baton is passed** (PR #307, `0b79656`)
  The in-app bell fired on every baton pass but no email did, so an off-app holder never learned a
  relay bounced back to them for re-review (Caleb's flag). Added a transactional email to the new
  holder on **Pass Baton (forward) AND Send Back (back)** (scope decision: all baton handoffs, so the
  next person always knows it's their turn). New `RelayHandoffEmail` template + `sendRelayHandoffEmail`
  service (Resend, mirrors `sendMagicLinkEmail`) + `notifyHolderOfBatonHandoff` helper, wired into
  `passBatonAction` + `sendBackBatonAction` **post-commit + best-effort** (sent after the baton
  `db.$transaction` commits, swallows all errors so a Resend hiccup never breaks the pass; awaited so
  it isn't killed when the serverless action returns). **Internal teammates only:** skips client-role
  recipients (they get the magic-link review invite, not this), self-passes, and holders with no email.
  Reply-to = the person who passed it; deep-links to the relay; send-back includes the reason. Out of
  v1 scope (easy to add): force-step, client-review advance, request-design-changes. TDD (service
  subjects/reply-to, helper every skip rule + error swallow, both actions call the helper). 2401 unit
  tests, tsc + `next build` clean; adversarial whole-branch review READY_TO_MERGE (all 7 invariants
  clean, incl. clients-never-emailed two ways). No `src/server/jobs/**` change → Trigger.dev deploy
  SKIPPED. Note: prod deliverability still relies on `NEXT_PUBLIC_APP_URL` being set (existing WORKLOG
  follow-up) for correct deep links.

- [x] **2026-07-03 — Remove Generate Content from inside an active relay** (PR #306, `61e4304`)
  In-relay, the Generate Content button was locked to the relay's own month and did only a full
  **destructive regenerate** (overwrite every post) — a mid-relay footgun that throws away
  design/review/revision work. Removed it from the batch page. **Nothing stranded:** per-post
  "Regenerate caption with AI" (`redoPostAction`) stays for content refresh; a full regenerate for any
  month is still reachable from the client detail page's Generate dialog (which has a month picker, not
  month-locked, same Replace flow); Archive stays as the explicit restart path. The onboarding tour's
  `generate-content` anchor lives on the client detail route (`CLIENT_DETAIL_STOPS` → "Start a relay
  here"), so it's unaffected and now more consistent. Supporting facts: every other Generate mount
  targets *next* month (new relay); the batch page was the only month-locked one; `regenerateContentRun`
  is dead code (zero UI). Removed the `GenerateContentDialog` block + now-unused `canTriggerGeneration`
  import/derivation from the batch page; test flipped "renders when holder can generate" → "never on the
  batch page". 2388 unit tests, tsc + `next build` clean. No `src/server/jobs/**` change →
  `detect-pipeline-changes` + Trigger.dev deploy SKIPPED. From Caleb's "confirm role-scoped views"
  review recording (~6:52). Built on PR #305 (which had just wired `generation.trigger` onto this same
  button).

- [x] **2026-07-03 — Enforce `generation.trigger` on every generation surface** (PR #305, `f0ce0c8`)
  Wired up the previously **dead** `generation.trigger` permission key. It was defined + labeled in
  the permissions editor but enforced nowhere — every generate surface actually gated on `client.edit`,
  so toggling `generation.trigger` did nothing. Now every "cause the AI pipeline to run" surface
  enforces it: the four server actions (`generateContentAction`, `triggerGeneration`,
  `regenerateContentRun`, `bulkGenerateContent`) via a new `requireGenerationTrigger()`; the UI gates
  (client-detail top-bar dialog + `ActiveBatchesSection`, batch-page dialog, bulk-generate list) via a
  new `canTriggerGeneration()`. Read/delete helpers (`getRunStatus`, `getClientCrawlInfo`,
  `deleteContentRun`) intentionally stay on `client.edit`. **Zero behavior change for default roles**
  (admin + AM hold both keys, designer + client hold neither) — but the per-user toggle is now real.
  Came out of Caleb's "confirm role-scoped views" review ask: cost breakdown (`cost.viewAll`) + admin
  task board (`admin.portal`) were already correctly admin-only; "Generate Content" was the gap (gated
  on `client.edit`, toggle inert). TDD: matrix + per-user-override decoupling, action gate swaps, UI
  hide-on-false. 2389 unit tests, tsc + `next build` clean; adversarial whole-branch review
  READY_TO_MERGE. No `src/server/jobs/**` change → `detect-pipeline-changes` + Trigger.dev deploy
  SKIPPED. Follow-ups (non-blocking): the client-detail top-bar dialog requires BOTH `client.edit` AND
  `generation.trigger` (nested; cosmetic only, same capability reachable via the other generation.trigger-only
  surfaces, server enforces correctly); `BulkGenerateList`'s `canGenerate` prop defaults `true` (sole
  caller passes it explicitly + server enforces regardless).

- [x] **2026-07-03 — Review author names + wrapping + persistent crossed-out checklist items** (PR #304, `f9c2acb`)
  Three consistency fixes across all review surfaces (review-session feedback rail, `/preview` internal
  rail, pin popover). (1) Every message / pin / checklist item now shows WHO it came from, account name
  for agency users, the magic-link name for clients, filling the gaps (internal-rail labels were text
  only; the general post note + designer flagged-task rows had no byline). Consolidated to one shared
  `authorName` helper so all surfaces show identical names (deleted the popover's duplicate
  `authorLabel`); added an optional `byline` prop to `ResolveCheckbox`. (2) Long names/words wrap
  instead of truncating, removed a 60-char label truncation on the internal rail; `break-words` +
  `min-w-0` on name spans everywhere. (3) Resolved checklist items STAY visible, crossed out, instead
  of vanishing, the "Changes only" filter now hides only posts that never had feedback (`hadFeedback`
  on the feedback rail; `pinStatus !== 'none'` on the internal rail), anything that ever had feedback
  stays struck-through after resolve; the Prev/Next stepper is unchanged. UI only, no schema/server/auth
  change → Trigger.dev deploy skipped. 2375 unit/component tests, tsc + eslint clean, `next build`
  clean; per-commit reviews + whole-branch adversarial review (READY_TO_MERGE).

- [x] **2026-07-03 — Route feedback to the designer** (PR #303, `54424b6`)
  The AM triages client feedback once and hands the designer a clean, curated task list instead of
  re-commenting; designers also get direct read-only visibility into client reviews. On the
  review-session page (runs at `implementing_revisions`): each client pin or post-note gets a "Flag
  for designer" toggle with an optional note (caption-edit suggestions are not flaggable); one **Send
  to designer** flips the shared `awaiting_design_revisions` sub-state (no step/holder change, the AM
  keeps the step) and pings the assigned designer via a new `feedback_sent_to_designer` activity. The
  **designer view is read-only** for client feedback (no comment/resolve/accept), with their flagged
  items shown as a per-item done checklist, a compact per-post **"Upload revised image"** control
  (reuses the existing `/api/media/upload` → `/api/posts/[id]/media` flow, gated to the designer at
  `implementing_revisions`), and **Mark revisions done** (all flags done) to return the relay to the
  AM. The AM still owns final resolution via the existing addressed / note-resolve / thread-resolve
  paths. Also removed the premature auto `revision_images_requested` ping in `advanceFromClientReview`
  (it fired before the AM triaged; the enum value is kept for historical rows). New additive
  `DesignerFlag` model (references one pin OR one note) + two migrations; no data backfill. TDD
  throughout (16 commits, per-task spec + code-quality review + a whole-branch adversarial review);
  2362 unit/component tests, tsc + eslint clean, `next build` clean, integration at parity with main.
  Two build-gate bugs caught after the per-task reviews (tsc + vitest miss both): a repo call missing
  `organizationId` (added `designerFlags.ts` to the org-filter-lint ALLOWLIST, since the actions
  enforce org scope) and a `'use server'` module exporting a class (`next build` only — made
  `DesignerFlagActionError` module-private). Schema touched → prod deploy + migration ran on merge;
  `detect-pipeline-changes` + Trigger.dev deploy skipped (no `src/server/jobs/**` change). Spec + plan:
  `vault projects/relay-app/2026-07-02-route-feedback-to-designer-design.md` + `-plan.md`.

- [x] **2026-07-02 — Restrict client creation to agency admins** (PR #302)
  Removed the create-a-client capability from account managers; it is now agency-admin-only by
  default. AMs keep `client.edit` (edit existing clients, onboarding, generation) but can no longer
  create or import new clients. Root cause the ask exposed: the create surfaces were gated
  inconsistently — the `/clients/new` form + `createClientAction` + the New client / Import CSV
  buttons checked `client.edit`, while only the CSV import checked `client.create`, so flipping one
  flag would not have stopped creation. Made `client.create` the single gate on every creation
  surface: `SYSTEM_DEFAULTS.account_manager['client.create']` → false (admin stays true; still
  per-user overridable so an admin can re-grant it via the permissions editor), and re-gated
  `createClientAction` / `/clients/new/page.tsx` / the clients-page button block from `client.edit`
  → `client.create`. Onboarding tour copy updated. New tests: permission-matrix (admin-only default
  + override re-grant) + the `createClientAction` gate. 2271 unit tests, tsc + scoped lint clean; no
  schema/jobs/services change → Trigger.dev deploy skips.

- [x] **2026-07-01 — Review navigation cleanup (5 follow-ups)** (PR #301)
  Cleared the post-ship review follow-ups from the resolve-checklist slices. (1) `ChangesNavigator`
  resets its stepper cursor when the item set changes (no more stale position after a server
  refresh); (2) the review-session rail stepper walks only the visible (filtered) posts when
  "Changes only" is on; (3) the `/preview` rail stepper does the same; (4) removed the dead
  `|| post.addressed` term in `review-feedback-rail` `capDone` and made `onScrollToAnchor` a required
  prop; (5) "Mark relay reviewed" is now disabled with a hint on steps that can't auto-advance
  (≠1 forward edge, e.g. `implementing_revisions`), instead of erroring on click. All behavior-
  preserving on the default paths; the shared `ChangesNavigator` resolve mode stays byte-identical
  (regression tested). 2270 unit tests, tsc + scoped lint clean; no server/schema/jobs change →
  Trigger.dev deploy skips. Whole-branch review READY_TO_MERGE.

- [x] **2026-07-01 — Client magic-link changes navigation** (PR #300)
  Slice 4 (final) of the review resolve-checklist. The client, on the magic-link review page, can now
  jump to and step through the posts they marked "Changes" before submitting — navigation only, no
  resolve, no new writes. `ChangesNavigator` gained a `mode: 'navigate'` (position counter "X of Y",
  walks all items, filter hidden; default `mode: 'resolve'` for the AM rails is byte-identical +
  regression-tested). `ReviewProgressBar` gained optional clickable segments (`onSegmentClick` →
  buttons; default `<span>` unchanged). The client shell builds item-level nav items (pins + note per
  Changes post, ordered under posts, post-anchored) and scrolls via a `[data-post-id]` DOM query
  (`scrollToPost`, SSR/jsdom-safe); navigator shown only when `!locked && changesNavItems.length > 0`.
  Whole-branch review READY_TO_MERGE (AM non-regression verified at both call sites; client path is
  read-only DOM ops, no mutation). 2263 unit tests, tsc + scoped lint clean. No server/schema/jobs
  change → Trigger.dev deploy skips. The **review resolve-checklist feature is now complete** across
  all four slices (#297 gate, #298 note-resolve core, #299 both AM rails, #300 client nav). Spec +
  plan: `vault projects/relay-app/2026-07-01-review-changes-checklist-design.md` +
  `2026-07-01-review-client-changes-nav-plan.md`.

- [x] **2026-07-01 — Resolve checklist + ChangesNavigator on both AM rails** (PR #299)
  Slice 3 of the review resolve-checklist. Two shared presentational components — `ResolveCheckbox`
  (optimistic tick) + `ChangesNavigator` (changes-only filter + item-level Prev/Next stepper +
  counter) — wired into BOTH AM rails. Review-session rail: the client's general note is now a
  tickable checkbox (slice-2 `resolveNoteAction`/`unresolveNoteAction`); ticking the LAST unresolved
  item on a post auto-fires `markAddressed` (single-shot snapshot, no useEffect; `caption_edited`
  guard prevents premature address); navigator + verdict-based filter on top; stepper scrolls the
  canvas. /preview rail: each PostThread is a two-way `ResolveCheckbox` (`resolveThreadAction` +
  `reopenThreadAction`); navigator; "changes" = posts with open threads; no auto-address (no
  ReviewItem). `noteResolvedAt` threaded through `ReviewItemHydrated` + `toHydratedItem` mapper (+
  inert client-page field pass-through). Whole-branch review READY_TO_MERGE; auto-address verified
  across all cases; no regressions. 2254 unit tests, tsc + scoped lint clean. No schema/jobs/services
  change → Trigger.dev deploy skips. Shared components built with their first consumer (not
  speculative). Spec + plan: `vault projects/relay-app/2026-07-01-review-changes-checklist-design.md`
  + `2026-07-01-review-resolve-checklist-rails-plan.md`.

- [x] **2026-07-01 — Review note-resolve server core** (PR #298)
  Slice 2 of the review resolve-checklist. Additive `ReviewItem.noteResolvedAt` / `noteResolvedBy`
  (nullable, no backfill) so a client's general note (`ReviewItem.comment`) becomes resolvable.
  `markPostAddressedAction` / `unmarkPostAddressedAction` now also resolve / clear the note (Mark
  addressed resolves the whole post incl. its note; un-address reverses it symmetrically — no
  "un-addressed but note-resolved" limbo). New `resolveNoteAction` / `unresolveNoteAction` for
  per-note resolve, mirroring markPostAddressed's guard posture (requireClientEditor + org scope +
  item-belongs-to-post + postId validation); unused until slice 3 wires the UI. Whole-branch opus
  review READY_TO_MERGE (schema/migration drift-free, symmetry correct, guard not bypassable,
  verifiably inert until slice 3). 2233 unit tests, tsc + scoped lint clean. Migration applies on
  deploy; no `src/server/jobs/**` change → Trigger.dev deploy skips. Shared `ChangesNavigator` UI
  deferred to slice 3 (build-with-first-consumer). Spec + plan: `vault
  projects/relay-app/2026-07-01-review-changes-checklist-design.md` +
  `2026-07-01-review-note-resolve-core-plan.md`.

- [x] **2026-07-01 — Gate Mark relay reviewed on all-resolved; designer-notified Request changes** (PR #297)
  Slice 1 of the review resolve-checklist. On `/preview`, "Mark relay reviewed" is now hard-gated
  (disabled until every open thread on a live post is resolved, refuses server-side) — the old
  force-advance override (auto-resolved threads with a canned reason, then advanced) is removed;
  admin force-step stays as the emergency escape. "Request changes" now names the notified designer
  and disables after send (no double-fire). Two bugs caught + fixed mid-build by the per-task
  reviews: the gate first counted threads on soft-deleted posts (UI hides them) → would block
  advance forever, fixed to `deletedAt: null` so page count + server gate agree on scope; and the
  Request-changes double-fire. Whole-branch opus review READY_TO_MERGE. 2227 unit tests, tsc +
  eslint clean; Trigger.dev deploy skipped. Spec + plan: `vault
  projects/relay-app/2026-07-01-preview-mark-reviewed-gate-plan.md`.

- [x] **2026-07-01 — Lock a completed relay (permanent read-only)** (PR #296)
  Once a relay reaches the terminal `completed` step it locks: the page grays out with a
  "This Relay is completed" banner and every post/relay edit is blocked in the UI AND
  server-side. Permanent (no reopen for anyone — send-back AND admin force-step both removed
  on completed), uniform (tied to the step, same for every viewer), chat stays open, archive
  stays available (the only recourse for a mis-completion). Server guard `assertBatchEditable`
  (throws `RelayCompletedError` when completed) covers every post-mutating path: updatePost /
  redo / restore / useCommentImageAsPostMedia / media route (→409) / the two review-session
  caption writers (acceptCaptionEdit, unmarkPostAddressed). Pure comment/thread actions left
  open. Whole-branch opus review caught a Critical (the two review-session caption writes
  bypassed the lock) — guarded with tests before merge. 2218 unit tests, tsc + eslint clean.
  No schema change; Trigger.dev deploy skipped (actions/routes only). Spec + plan:
  `vault projects/relay-app/2026-07-01-lock-completed-relay-{design,plan}.md`.

- [x] **2026-07-01 — Gate bulk-generate on onboarding** (PR #295)
  Follow-up to #293/#294. The bulk-generate list let you select any active client, including
  not-onboarded ones, which the server then rejected per-row with no UI signal (silent "why didn't that
  client generate?"). Not-onboarded active clients now stay visible but are unselectable (no checkbox)
  and show a "Needs onboarding" badge, with their row still linking to the client page where the
  onboarding checklist lives. After #294's backfill this only affects brand-new clients mid-setup.
  4 new tests, full suite 2192 pass, tsc + eslint clean. No schema/jobs/services change → Trigger.dev
  deploy skips.

- [x] **2026-07-01 — Grandfather existing clients as onboarded (hotfix for #293)** (PR #294)
  Caught in live browser verification: #293's onboarding gate re-gated established clients whose
  `onboardingCompletedAt` was never set — that field was only ever written by the admin Onboarding
  queue, so clients set up + generated via the Generate flow (the common path) never had it, and
  post-deploy active clients (e.g. Effect Med Spa, mid-relay with 14 posts) showed a fresh onboarding
  checklist with Generate disabled + Re-run blocked. Data-only idempotent backfill:
  `UPDATE clients SET onboardingCompletedAt = createdAt WHERE onboardingCompletedAt IS NULL`
  (migration `20260701180000`), grandfathering all existing clients; new clients still onboard. No
  schema/code change → Trigger.dev deploy skips. Re-verified live: Effect Med Spa now generates. Lesson:
  a migration that only defaults new rows must also backfill existing rows — verify data-state
  assumptions on prod, not just logic.

- [x] **2026-07-01 — Move onboarding to the client page; relays start at Copy Review** (PR #293)
  Retired `onboarding_gate` from the visible pipeline (track arrays, both transition tables, dashboard
  `AM_TRACK_STEPS`, batch empty-state; enum value kept for history + idempotent backfill for any stray
  batch). Added a one-time client-page onboarding checklist (three manual attestation booleans on
  `Client`; gate stays `onboardingCompletedAt`): `ClientOnboardingChecklist` card shown pre-onboarding,
  `setClientOnboardingItemAction` + `completeClientOnboardingAction` (client.edit-gated, org-scoped,
  all-three enforced server-side). Generate is disabled in the UI until onboarded AND blocked server-side
  at every entry point — `generateContentAction` (friendly error), `triggerGeneration` +
  `regenerateContentRun` (throw), `bulkGenerateContent` (per-row "Onboarding incomplete", batch continues).
  Plus a required "all content updated for this client this month" confirmation on every Generate fire.
  Admin onboarding queue left untouched (both paths coexist). Whole-branch review caught + fixed a
  Critical bulk/regenerate gate bypass. 2188 unit tests, tsc + eslint clean. Schema + services touched →
  Trigger.dev deploy fires on merge; additive migrations + enum ADD VALUE + backfill apply on deploy.
  Follow-ups: annotate not-onboarded clients in the bulk-generate list (server already fails safe);
  `SELECT count(*) WHERE currentStep='onboarding_gate'` sanity check before deploy (expected 0). Spec +
  plan: `vault projects/relay-app/2026-07-01-onboarding-to-client-page-{design,plan}.md`.

- [x] **2026-07-01 — Drop the empty media box from the review tutorial welcome card** (PR #292)
  The magic-link review tutorial teaches via the anchored tooltip + highlight tour (since #256), but
  the welcome card still rendered a 180px media panel with an `<img>` pointing at a missing SVG that
  onError-hid to an empty gray box ("the video"). Removed the media box + img; kept the welcome copy,
  buttons, and the tour. Extended the tutorial test to assert no `<img>`. Pure UI deletion, no
  schema/services change → Trigger.dev deploy skips. Full suite + tsc + eslint clean. Spec:
  `vault projects/relay-app/2026-07-01-review-tutorial-remove-media-box-design.md`.

- [x] **2026-07-01 — Send the client review link on Pre-Client QA, not Design Review** (PR #291)
  Caleb's "biggest one": the required "Send review link" checklist item was seeded on Design Review
  (step 4), forcing the link out BEFORE the final internal QA (step 5). Transitions were already
  correct; only the checklist gate was on the wrong step. Moved the required send-link item to
  am_qa_pre_client, so the AM runs final QA + sends the link on step 5 then passes to Client Review
  with the link already out. Plus: the QA send-link item auto-checks when a live magic link already
  exists (no double-prompt on reseed/migration/loop-back); pass labels fixed (Design Review -> "Send
  to Pre-Client QA", QA -> "Send to client review"); toolbar Send button gated to step 5 (Copy/Resend
  row still shows during Client Review); QA next-action card prompts sending the link (only when
  client review is on). Backfill migration relocates the item for in-flight relays (idempotent).
  No schema/jobs/services/prompts change → Trigger.dev deploy skips; data migration applies on deploy.
  2165 unit tests pass, tsc + eslint clean; whole-branch opus review READY_TO_MERGE (its one Important
  no-review-copy finding fixed in-PR). Spec + plan:
  `vault projects/relay-app/2026-07-01-send-link-on-pre-client-qa-{design,plan}.md`.

- [x] **2026-07-01 — Client quick-access row wraps so Assets/Canva don't bleed over** (PR #290)
  On the client page, with many website links the quick-access Links block wrapped to multiple rows
  but the top-level flex row (Links | Assets | Canva) could NOT wrap, so the Assets + Canva blocks
  were squeezed onto one line, collided, and bled past the card edge, even at full width. Reproduced
  live in the browser (row scrollWidth exceeded clientWidth ~50px). Fix: `sm:flex-wrap` on the row +
  `min-w-0` -> `shrink-0` on the Assets/Canva blocks (co-dependent; the regression test locks both).
  Verified live: overflow -> 0, Assets/Canva wrap to their own right-aligned line; few-links layout
  unchanged; mobile inert. NO schema/jobs/services/prompts change -> Trigger.dev deploy skips. 2156
  unit tests pass, tsc + eslint clean; whole-branch opus review READY_TO_MERGE. Spec:
  `vault projects/relay-app/2026-07-01-client-quick-access-overflow-design.md`.

- [x] **2026-07-01 — Bulk media tray auto-fills empty post slots (CSV "only one image" root cause)** (PR #289)
  Reported as "CSV export only includes the first post's image." The export is actually correct
  (Relay is single-image-per-post by design; the export maps every post's `mediaUrls[0]`). Real
  cause: the bulk media tray only persisted files that auto-matched by filename (`MM-DD` / trailing
  digit); arbitrarily-named files sat unassigned and were skipped on Apply, so only the matched
  (often first) post got an image. Added a pure `fillEmptyPostSlots()` (src/lib/media-match.ts)
  called after filename matching: leftover files fill the remaining empty post slots in order, so a
  bulk drop lands on every post. Visible preview + manual drag-reassign remain as the safety net;
  extra files still surface in the Unassigned zone. Export code unchanged (proven correct). NO
  schema/jobs/services/prompts change → Trigger.dev deploy skips. 2155 unit tests pass, tsc + eslint
  clean; whole-branch opus review READY_TO_MERGE. Spec:
  `vault projects/relay-app/2026-07-01-bulk-media-autofill-design.md`.
  Follow-ups (non-blocking): parked-file re-fill on a second drop; order-pairing UI hint for
  arbitrary filenames; latent CSV multi-image drop (only `mediaUrls[0]` exported) when v2 carousels land.

- [x] **2026-07-01 — Review emails greet with the full name, not a first-token shorten** (PR #288)
  The client review emails mangled a business recipient name: "Old Plank" became "Old"
  ("Hi Old," / "Hey Old,"). Cause: the send-link modal defaults the Recipient name to the
  client business name, and each of the three client-facing templates had its own local
  `firstName()` that took only the first whitespace token. Extracted one shared
  `src/lib/greeting.ts` `greetingName()` (full trimmed name, whitespace collapsed, "there"
  fallback) and used it in `MagicLinkInviteEmail` ("Hi"), `ReviewSessionReminderEmail`
  ("Hey"), and `AmReplyEmail` ("Hey"), removing the three duplicated helpers. Invite greeting
  switched to a template literal so it renders contiguously (no React Email comment nodes).
  AM-facing digest emails left unchanged (they greet a real internal user). NO schema change;
  no jobs/services/prompts change → Trigger.dev deploy skips. 2148 unit tests pass, tsc +
  eslint clean; whole-branch opus review READY_TO_MERGE. Spec:
  `vault projects/relay-app/2026-07-01-review-email-greeting-fix-design.md`.

- [x] **2026-06-30 — Gate Edit/Restore on canEdit + kill the masked digest on save failures** (PR #287)
  A designer hit the masked Next.js error digest (the long `ref:` number) trying to edit a post
  on the batch detail page. Two affordances rendered without a permission check and their handlers
  had no try/catch, so the thrown server-action error reached the `(app)/error.tsx` boundary. Fix
  (layered): the PostCard **Edit** button and the PostVersionHistory **Restore** button are now
  gated on the existing `canEdit` permission (designers no longer see them — version history stays
  readable, only the Restore action is gated), and the save/restore handlers fail soft with a
  friendly toast instead of crashing. The internal `/preview` caption save also fails soft and
  preserves the draft on failure (re-throws after toasting so the shared `ReviewPostCard` keeps the
  editor open). Toasts use a generic message, never `e.message` (prod masks thrown action errors as
  the digest). Permission decision unchanged from the system default: designers can't edit captions
  or restore versions but keep image upload (`post.media.edit`). Server gates (`requireClientEditor`)
  untouched; client magic-link review path unaffected (its save never rejects). NO schema change;
  no `src/server/jobs|services|prompts` change → Trigger.dev deploy skips. 2137 unit tests pass,
  tsc + eslint clean; whole-branch opus review caught + fixed one draft-loss regression. Spec + plan:
  `vault projects/relay-app/2026-06-30-designer-edit-gate-and-friendly-error-{design,plan}.md`.

- [x] **2026-06-30 — Drop the internal submit/round loop; shared markup /preview** (PR #285)
  Follow-up to #284. The internal `/preview` "Submit Review" button was broken/redundant
  (`submitInternalReviewAction` only advanced to QA when EVERY post was explicitly approved; any
  other state silently routed to "changes" or errored), so the submit/round machinery was dropped
  and `/preview` is now a shared PURE-MARKUP surface for the AM + the assigned designer. Three
  viewer tiers: AM/admin (full markup + controls), assigned designer (image pins + thread replies
  only — no caption edit, no post-level pins, no AM controls), everyone else (read-only feed,
  unchanged). Removed the per-post verdict, Submit bar/modal, progress, Approve-all, and ALL internal
  ReviewSession creation/reading; the rail status chip now shows pin state. Coordination via the
  existing sub-state controls relocated onto `/preview`: Mark relay reviewed (AM→QA), Request changes
  (AM→notify designer), Mark revisions done (designer→AM). Deleted orphaned server code
  (`submitInternalReviewAction`, internal `saveInternalDraftAction`, `startInternalReviewAction`,
  `startInternalNextRoundAction`, `advanceFromDesignReview`, `resolveInternalReviewContext`). Retired
  the internal branch of the read-back page — **the client (magic-link) read-back is locked by a
  regression test** and an internal-kind session now redirects (stale prod rows handled). Client
  review flow unchanged (sacred); designer auth enforced in depth (UI + server: `updatePostAction`
  requires `requireClientEditor`, the control actions self-gate); new pins/comments still notify.
  NO schema change; touches services so the Trigger.dev deploy fires on merge. 2130 unit tests pass,
  tsc + eslint clean; whole-branch opus review READY_TO_MERGE. Spec + plan:
  `vault projects/relay-app/2026-06-30-internal-review-drop-submit-loop-{design,plan}.md`.

- [x] **2026-06-30 — Reshape internal /preview into the markup layout** (PR #284)
  The AM internal review surface (`/preview`) was a client-style single-column verdict feed
  (Phase 2); it is now the three-zone markup layout that matches the read-back page: a left
  per-post rail (number, thumbnail, verdict status chip, pin count; click scrolls the canvas),
  the existing center canvas (`ReviewPostCard mode="internal"` with droppable pins + verdict
  toggle + inline caption edit), and a slide-in AM/designer chat popup (`MobileThreadFab`,
  `showOnDesktop`). The Phase 1-3 verdict/submit engine is byte-for-byte unchanged (per-post
  Approve/Request-changes -> `saveInternalDraftAction`; Submit -> `submitInternalReviewAction`
  advances Design Review). New pins and new comments still notify (the explicit gate): pin-create
  notifies the designer; replies route through `addCommentAction` -> `notifyInternalThreadReply`
  (deep-links to `/preview`), both locked with regression tests. Round cadence unchanged (the
  designer still responds on the read-back page). New `InternalReviewRail` component; the FAB is
  lifted above the sticky Submit bar on narrow phones. NO schema change and no
  `src/server/jobs|services|prompts` change, so the Trigger.dev deploy skips. 2144 unit tests pass,
  tsc + eslint clean; whole-branch opus review READY_TO_MERGE. Spec + plan:
  `vault projects/relay-app/2026-06-30-internal-review-markup-layout-{design,plan}.md`.

- [x] **2026-06-29 — Collapse client review to one pill + feedback badge** (PR #TBD)
  The batch detail "Review Sessions" list now shows ONE client pill per batch (was one per
  ReviewSession, so re-opening the magic link or prior rounds stacked extra pills). Root cause:
  re-confirming the name on the magic link mints a fresh reviewer identity, so the session lookup
  (keyed on reviewerId) missed the prior session and lazily created a new round-1 one. Fixed by
  resolving the client session by `magicLinkId` (new `findActiveClientSessionForLink` /
  `findLatestClientSessionForLink`), reused across the review page load + start/save/submit actions,
  plus a guard so a post-submit revisit can't fork a new round-1 (only the AM opens a new round).
  Render side: a pure `selectClientReviewPill` selector collapses to the current client session
  (highest round, submitted over in-progress, excludes internal + superseded) — no data migration,
  existing duplicate rows are just hidden. New amber "N Feedback" badge on the pill when the client
  left changes/caption-edits/comments (clean approve-all shows none). AM submit notification was
  already firing (review_session_submitted + client_review_decided) — left as is. The whole-branch
  review caught that the LIVE client draft path is `/api/review/[token]/draft` → `saveItemDraft`
  (`src/server/services/reviewDraft.ts`), not the legacy `saveReviewDraftAction`, so the root-cause
  fix was ported there too (by-link resolution + a `ReviewDraftSessionClosedError` 409 guard so an
  already-submitted/superseded round can't fork a new round-1). No schema change; `reviewDraft.ts` is
  a service, so the Trigger.dev deploy DOES fire on merge (no generation logic changed). 2134 unit
  tests pass, tsc + eslint clean (only the pre-existing batch-page Date.now purity error remains,
  untouched). Spec + plan:
  `vault projects/relay-app/2026-06-29-client-review-pill-collapse-{design,plan}.md`.

- [x] **2026-06-29 — Internal review parity, Phase 3: designer respond surface (closes Batch D)** (PR #TBD)
  Closes the AM<->designer round loop, the internal review now flows like the client link end to end.
  (1) `markDesignRevisionsDone` service + `markDesignRevisionsDoneAction`: the inverse of
  `requestDesignChanges`, clears `awaiting_design_revisions` back to null on a batch at `am_review_design`
  (no step/holder change), notifies the assigned AM (reuses `ActivityKind.batch_revision_completed` —
  no new enum/schema — with `surface:'internal_review'`+batchId so the AM bell deep-links to `/preview`),
  never throws on the activity write, cross-tenant scoped, allowed for the ASSIGNED DESIGNER or an
  AM/admin (gate differs from request-changes since the batch is AM-held while awaiting revisions).
  (2) The read-back page (`review-sessions/[sessionId]`) now branches on `session.kind`: internal
  sessions skip the magic-link redirect, resolve the reviewer from the AM `User`, reach the batch via
  the session's direct `batchId`, and grant the assigned designer (+ AM/admin) view access. Client path
  byte-for-byte identical (negative test added). (3) Designer respond UI: a "Mark revisions done"
  control (`MarkRevisionsDoneButton`) in the shell's new `respondSlot`, shown only to the assigned
  designer while awaiting revisions; the designer reads the AM's verdicts/notes/pins via the existing
  rail/canvas. (4) `startInternalNextRoundAction` (keyed on batch + AM, no email) wired into the
  read-back's start-next-round control for the AM so they re-review on `/preview` after the designer
  marks done. Decision: read-back page (the AM-feedback mirror), not inline `/preview`. 2109 unit tests
  green, tsc clean, eslint clean on all touched files. NO schema change (Phase 1 owns the data layer);
  `relay.ts` (services) is touched so the Trigger.dev deploy fires on merge. Plan:
  `vault projects/relay-app/2026-06-29-internal-review-parity-phase3-plan.md`.

- [x] **2026-06-29 — Internal review parity, Phase 2: AM /preview verdict surface** (PR #TBD)
  The visible parity: `/preview` is now a client-style review for the AM. Widened `ReviewPostCard` to
  `mode:'internal'`; new `InternalReviewShell` (per-post Approve/Request-changes, Notes, inline edit-copy,
  progress, Approve-all, Submit) backed by the Phase 1 internal `ReviewSession` + Clerk-authed
  `saveInternalDraftAction`/`submitInternalReviewAction` (Submit advances the Design Review step per
  Phase 1: all approved -> QA; changes -> notify designer). The page resumes-or-creates the AM's active
  internal session on open; editors get the verdict surface, non-editors keep the read-only view. Built
  subagent-driven TDD; whole-branch review caught that the first cut DROPPED four AM capabilities
  (per-pin Resolve, image-attach, @-mention autocomplete, use-comment-as-post-image) — all RESTORED as
  forwarded `ReviewPostCard` props so the surface is a true superset of the old `/preview`, plus a
  "Review submitted" banner + soft advance-error notice, plus a deleted-posts fix on the approval counts.
  Client `mode='review'` path behaviorally identical (negative test added). 2078 unit tests, tsc + eslint
  clean. Touches `src/server/services/approval.ts` (deletedAt filter) so the Trigger.dev deploy fires on
  merge. Plan: `vault projects/relay-app/2026-06-29-internal-review-parity-phase2-plan.md`.

- [x] **2026-06-29 — Internal review parity, Phase 1: data + engine** (PR #TBD)
  Makes the `ReviewSession`/`ReviewItem` engine able to back an INTERNAL (Clerk AM) review beside the
  client (magic-link) flow, anchored on the Design Review step. Schema: `ReviewSessionKind {client,
  internal}` + a direct required `batchId` + `reviewerUserId` on `ReviewSession`, `magicLinkId` made
  nullable, existing rows backfilled to `client` (one transaction: add cols -> drop NOT NULL -> backfill
  batchId from the magic link -> SET NOT NULL -> FKs+index). Engine: internal Clerk-authed
  create/draft/submit actions (real `actorId`, not the client path's null); internal submit ->
  `advanceFromDesignReview` (all approved -> QA `am_qa_pre_client`; any changes -> reuse
  `requestDesignChanges` -> awaiting_design_revisions + notify designer); `startNextRound` +
  `listSessionsForBatch` generalized (query by direct `batchId`); kind invariant enforced at create;
  internal excluded from the reminder cron. **NO UI change — `/preview` unchanged** (Phases 2-3 add the
  surface). Client (magic-link) flow behaviorally identical. Built subagent-driven TDD (6 tasks);
  whole-branch review clean/ship-ready (no Critical/Important; cosmetic minors only). 2063 unit + 32
  review integration tests pass, tsc + eslint clean. Touches `schema.prisma` + services -> Trigger.dev
  deploy fires on merge. Spec + plan: `vault projects/relay-app/2026-06-29-internal-review-parity-design.md`
  + `-phase1-plan.md`.

- [x] **2026-06-29 — Next-action board + designer revision tile (Batch C, part 2)** (PR #TBD)
  A role-aware "what to do next" board on the relay detail page: a pure `nextActionForRelay(step, subState,
  viewerRole, ...)` map -> a `NextActionBoard` banner showing the viewer's next action + a button to the
  right place (e.g. Design Review -> "Review designs" -> `/preview`; scheduling -> "Go to NectrCRM"; client
  review -> "View client feedback" when a session is submitted). Non-actors see a muted "waiting on X".
  The cost breakdown stays admin-only and now sits ABOVE the board. Also restores designer visibility lost
  in the step merge: an "Awaiting your revisions" dashboard tile collecting the designer's
  `am_review_design`+`awaiting_design_revisions` batches, plus a sub-state-aware `designerKanbanColumn`.
  No schema/services change -> Trigger.dev deploy skips. 18 action-map + 5 component + page + dashboard
  tests; full unit suite 2044 pass, tsc clean, eslint clean (one pre-existing batch-page `Date.now`
  warning untouched). Spec + plan: `vault projects/relay-app/2026-06-29-next-action-board-{design,plan}.md`.

- [x] **2026-06-26 — Merge Design Review + Design Revision into one step (Batch C, part 1)** (PR #274)
  Collapsed the design phase to one AM-held `am_review_design` (Design Review) step; `design_revisions`
  is retired (kept in the enum/HOLDER_ROLE for history). The review<->revise loop edges were removed
  from both transition tables, and the QA send-back was redirected `am_qa_pre_client -> am_review_design`
  (its only send-back target, since design_revisions is gone). New in-step **"Request changes"** action
  (`requestDesignChanges`): AM-only, sets `currentSubState='awaiting_design_revisions'` with NO step/holder
  change, and records a new `design_changes_requested` ActivityKind mentioning the designer with
  `surface:'internal_review'`+batchId so their bell deep-links to the internal review page (`/preview`).
  Ripple: timeline arrays (8/6), labels/colors/checklist/dashboard retire `design_revisions`, sub-status
  label "Awaiting design revisions", the "Request changes" button replaces send-back-to-revision on the
  batch page, and the "Open client content" chip now shows on `am_review_design` so designers keep content
  access during revisions. Migrations: additive `ActivityKind` ADD VALUE + a data backfill
  (`design_revisions` batches -> `am_review_design`, AM holder, awaiting-revisions sub-state, checklist
  reseeded). Built subagent-driven TDD (10 tasks); whole-branch review no Critical, 1 Important (designer
  board visibility — deferred to the next-action board, see Open) + 1 Minor (admin force-step list, fixed).
  Full unit suite 2012 pass, tsc + eslint clean. NOTE: touches `relay.ts` + `schema.prisma`, so the
  Trigger.dev pipeline deploy fires on merge (expected; no generation logic changed). Spec + plan:
  `vault projects/relay-app/2026-06-26-merge-design-steps-{design,plan}.md`.

- [x] **2026-06-26 — Remove Fix-with-AI from the /preview markup pin popover** (PR #273)
  Per Julio: Fix copy with AI should only live on the main relay page (whose post cards already have
  "Regenerate caption with AI"); the feedback-based rewrite comes out everywhere else. #270 removed it
  from the View-client-feedback rail; this removes its last mount (the `/preview` pin popover) plus the
  now-dead `postId`/`postCaption`/`onFixAccepted` props threaded into `PinPopover` and the three callers
  (`instagram-post`, `facebook-post`, `review-pinned-post`). `FixWithAIButton` is now fully unmounted
  (component + API routes left in place as a separate cleanup, logged above). Full unit suite 1984 pass,
  tsc + eslint clean. No schema change.

- [x] **2026-06-26 — Internal review notifications (Batch B)** (PR #272)
  Internal-review pins now reach people. (1) Replying on a pin notifies via the header bell: targets =
  thread participants ∪ the relay's current holder ∪ @-mentioned, minus the actor, **internal users
  only** (a role filter keeps client-role holders/commenters out, important during client_review).
  (2) **@-mention "pinging"** now works on the pin/thread path — a per-client roster (assigned AM +
  designer + org admins) drives an @ autocomplete in the pin composers AND the reply popover; mentions
  are resolved server-side from the body (never a client-supplied id list). (3) Pin creates notify the
  designer ∪ @-mentioned. (4) These notifications **deep-link to the internal review page**
  (`/preview#post-`) via a `surface:'internal_review'` payload discriminator + a new `resolveHref`
  branch; client-review + run-view notifications are untouched, and reviewer-created (magic-link) pins
  are NOT tagged so the client path is unchanged. (5) Cleaner notification copy (fallback-safe "Post N").
  New helpers live in `src/server/lib/` (not `services/`) so the Trigger.dev deploy skips; no schema
  change (`surface` rides in the free-form `payload` Json). Built subagent-driven TDD; whole-branch
  review READY (2 IMPORTANT findings fixed: the role filter + the reviewer-pin surface gate). tsc + eslint
  clean; 112 new-suite + 245 preview/review tests green. Spec + plan:
  `vault projects/relay-app/2026-06-26-internal-review-notifications-{design,plan}.md`.

- [x] **2026-06-26 — Fix: close the View as dropdown on outside click / Escape** (PR #271)
  The View as menu only closed via the toggle button. Added a dismissal effect (active while open) that
  closes it on a mousedown outside the container or an Escape press (mirrors the pin-draft composer
  pattern); inside clicks keep it open. 4 component tests, tsc + eslint clean. No schema change.

- [x] **2026-06-26 — Fix: remove "Fix copy with AI" from the AM View client feedback rail** (PR #270)
  Per Julio (triage item 9): Fix-with-AI should not be on the client-feedback surface. Removed the
  `FixWithAIButton` mount + `showFixWithAi`/`hasCopyFeedback` derivation + the now-unused `useRouter`
  from `ReviewFeedbackRail`. The API routes + component are untouched and still mounted in the `/preview`
  internal markup pin popover (open question logged: remove there too?). Already double-guarded off the
  client magic-link `/review/[token]` page. Rail tests flipped to "never renders the button"; tsc + eslint
  clean. No schema change.

- [x] **2026-06-26 — Fix: clickable links in the chat thread** (PR #269)
  Comment bodies already linkified; the gap was system-event rows (`SystemEventRow`), which rendered
  their message (embedding user-entered send-back / force-move / thread-resolved **reasons**) as plain
  text. Wrapped the message in the shared `<Linkify>` primitive. Regression test: a URL in a
  `batch_sent_back` reason renders an `<a target=_blank rel=noopener>`. tsc + eslint clean. No schema change.

- [x] **2026-06-26 — Fix: AM-reply email linked to localhost / dead links -> error page** (PR #268)
  Client got the "AM replied" email but the link hit an error page. Two causes in
  `notifyClientOfAmReply.ts`: (1) **dominant** — `appBaseUrl()` was `NEXT_PUBLIC_APP_URL ?? localhost`
  with no Vercel fallback, and `NEXT_PUBLIC_APP_URL` is **not set in prod** (verified via `vercel env ls`),
  so every link pointed at localhost; fixed to the canonical chain (`NEXT_PUBLIC_APP_URL ->
  VERCEL_PROJECT_PRODUCTION_URL -> VERCEL_URL -> localhost`). (2) No validity filtering — the email
  re-mints a token to `/review/[token]`, but middleware 404s an expired token and 410s a revoked link /
  archived batch; added a guard mirroring middleware **before** the cooldown claim so a dead link doesn't
  burn the 30-min window. 4 new tests; tsc + eslint clean. No schema change. Follow-up: set
  `NEXT_PUBLIC_APP_URL` in prod.

- [x] **2026-06-26 — Fix: pipeline timeline went blank after the QA -> client review handoff** (PR #267)
  Root cause: `src/lib/relay-track-shape.ts` was never updated for the 2026-06-22 step rework. The
  `FULL_TRACK`/`NO_REVIEW_TRACK` arrays still listed the retired steps (`sent_to_client`,
  `client_decision`, `ready_to_schedule`, `revisions_complete`, `final_qa_schedule`) and omitted the new
  live `client_review` + `scheduling`. `relay-track.tsx` does `steps.indexOf(batch.currentStep)`, so the
  moment a batch advanced out of `am_qa_pre_client` into `client_review` (or `scheduling`), indexOf
  returned **-1** and the whole timeline blanked ("Step 0 of 12", no current node). Fix: rebuilt both
  arrays to the 9 / 7 live steps and fixed `CLIENT_TRACK_VIEW` (same retired-step bug for the client
  audience). No schema / jobs change, so the Trigger.dev deploy skips. Regression tests added (shape +
  a `client_review` render assertion that was -1 before the fix). tsc + eslint clean.

- [x] **2026-06-26 — View as user (admin impersonation)** (PR #266)
  A searchable top-bar **View as** dropdown lets an admin (or platform owner) fully act as another
  non-admin user, seeing ONLY that user's scoped clients/relays/inbox — a full identity substitution,
  not an overlay. Built on the existing step-into pattern: a `relay_view_as_user` cookie read by
  `getOrgContext`, which re-validates eligibility every request and rebuilds the context as the target
  with `platformOwner` forced false (so a forged cookie is inert and impersonation can never elevate).
  Targets are non-admins only (org-scoped for admins, any org for the platform owner). Amber Exit banner
  on every page while acting-as; `ImpersonationLog` table records start/stop with the real actor; 60-min
  auto-expiry; `secure` cookie. 33 new unit tests, tsc clean, opus whole-branch review READY TO MERGE.
  **Live-verified on prod:** acted as Payton (AM) → Admin/Platform nav disappeared, Clients showed only
  his 2 assigned clients (vs the full ADMARK roster), Exit reverted cleanly, and `impersonation_logs`
  recorded the start + stop. Spec: `vault projects/relay-app/2026-06-26-view-as-user-design.md`.

- [x] **2026-06-25 — Invite member: show the real failure reason instead of a masked 500** (PR #265)
  Inviting a member by email failed with the opaque "An error occurred in the Server Components render"
  digest. Root cause was external: the ADMARK org hit Clerk's **dev-instance cap of 5 memberships**
  (prod still runs on `pk_test_` keys), so `createOrganizationInvitation` returned 403
  `organization_membership_quota_exceeded`. The action **threw** that error, and Next.js masks any thrown
  server-action error in production, so the modal could only show the generic digest. Fix: `inviteMember`
  now **returns** `{ ok: false, error }` for expected Clerk failures (quota, duplicate, bad email),
  surfacing Clerk's own `longMessage` (returned values aren't masked; thrown ones are); unexpected
  non-Clerk errors still throw. Modal reads the result. 8 invite-action tests (5 new: success result,
  quota longMessage, short-message fallback, rethrow of non-Clerk errors, empty-email guard), tsc + eslint
  clean. No schema change. Unblocked the immediate invite by freeing 2 redundant seats in the Clerk org.
  Durable fix is still the Clerk production-keys cutover (standing follow-up).

- [x] **2026-06-25 — Tour coachmarks: tighten over-large anchors so the spotlight is visible** (PR #264)
  Live verification found the `clients-list` and `relay-posts` coachmark anchors wrapped the WHOLE list,
  so when scrolled to center the spotlight cutout was bigger than the viewport and the dim/highlight was
  invisible. Moved both to the FIRST item: `clients-list` -> the first client row (bulk-generate.tsx,
  `index === 0`), `relay-posts` -> the first post card (batch page, `idx === 0`). Now the spotlight frames
  a single client/post, matching the "open one" copy. Small targets (dashboard nav, relay-track,
  relay-actions, NectrCRM chip) were already fine. 1910 unit tests (batch anchor test now seeds a post),
  tsc + eslint clean. No schema change.

- [x] **2026-06-25 — Tour spotlight: smooth scroll tracking + scroll-target-into-view on Next** (PR #263)
  Two issues Julio caught live: (1) the spotlight ring lagged/jittered during scroll, and (2) advancing
  with Next could highlight an element below the fold without scrolling to it. Fixes in `TourPopover`:
  (a) removed the `transition-all duration-150` on the spotlight so it snaps to the target each frame
  instead of CSS-animating behind it during scroll; (b) the rAF tracker now only commits to state when
  the geometry actually changes (no React re-render every frame on a still page); (c) on stop change the
  active stop's target is scrolled into view (instant — smooth scrollIntoView is a no-op in this app's
  scroll containers, per PR #243), so Next always brings the next highlight on screen. Guarded the
  scrollIntoView call (jsdom doesn't implement it). 1910 unit tests (added a scroll-into-view test),
  tsc + eslint clean. No schema change. Shared `TourPopover` change, so it improves every tour +
  coachmark + the magic-link review tutorial at once.

- [x] **2026-06-25 — Fix: Tips/Settings tour replay was a no-op when already on the tour's home route** (PR #262)
  Caught during live verification of the dashboard spotlight: clicking a walkthrough in the Tips menu (or
  Settings) while ALREADY on its home route (e.g. replaying the overview from `/dashboard`) did nothing —
  the replay did `router.push(homePath)` to the current route, which reset the provider before `start()`
  took effect. Fix: both `TipsMenu` and `ToursPanel` now skip the navigation when `pathname === homePath`
  and just call `start()`; cross-route replay is unchanged. Tests added for the same-route case in both.
  (Spotlight positioning itself verified correct live: the dashboard overview cleanly frames the My Relay
  nav item with the dim + ring cutout; the /clients coachmark frames the clients list.) 1909 unit tests,
  tsc + eslint clean. No schema change.

- [x] **2026-06-25 — Tour coachmark: scheduling step (item 39 Phase 2, 4 of 4 — coachmarks complete)** (PR #261)
  The last Phase 2 coachmark. Scheduling is a STATE (step) on the relay route, not its own page, so the
  foundation got a small extension: a `requiresAnchor` field on `TourDef` + a new `eligibleAutoTours()`,
  and the provider now prefers a step-specific tour whose `requiresAnchor` element is in the DOM,
  otherwise falls back to the first route tour with no DOM requirement. `scheduling-v1` shares the relay
  route with `batch-detail-v1` but only fires when the scheduling-only "Go to NectrCRM" chip is present
  (`[data-tour-anchor="schedule-nectrcrm"]`), so it never shows scheduling copy on a non-scheduling relay.
  2 stops: Export the CSV → load it into NectrCRM. Admin/AM only (scheduling is AM-held). Added
  `data-tour-anchor`s `schedule-export` (Export CSV button) + `schedule-nectrcrm` (NectrCRM chip). The
  pure `selectAutoTour` still defaults to `batch-detail-v1` on the route (scheduling listed after it);
  the DOM preference lives in the provider. 1907 unit tests (registry: eligibility, requiresAnchor gate,
  role scope, no menu listing; provider: scheduling fires when anchor present, falls back when absent),
  tsc + eslint clean. No schema change. **Item 39 coachmarks now complete:** overview + relay detail +
  client/generation + inbox + clients + scheduling, all with the spotlight highlight.

- [x] **2026-06-25 — Tour coachmarks: client page (generation), inbox, clients list (item 39 Phase 2, 2 of 4)** (PR #260)
  Three more per-page coachmarks on the foundation. (1) **Client detail page** (`/clients/:id`, admin/AM
  only since generation is gated to them): anchors the "Generate content" button → "start a relay" + a
  pipeline concept stop. (2) **Inbox** (`/inbox`, internal roles): anchors the Timeline/By-client view
  toggle → "anything needing you shows here." (3) **Clients list** (`/clients`, internal roles): anchors
  the clients list → "every brand lives here; open one to start content." Added `data-tour-anchor`s:
  `generate-content` (on the shared GenerateContentDialog trigger), `inbox-views`, `clients-list`. Note
  the `/clients/:id/generate` route is just a redirect to `/clients/:id`, so generation is taught on the
  client page. Inbox + clients are static routes so those tours have a homePath and ARE replayable from
  the Tips/Settings menu (Inbox / Clients walkthrough); the client-detail one is dynamic-route so it's
  auto-fire-only. Load-bearing route regexes (no collision between `/clients`, `/clients/:id`,
  `/clients/:id/batches/:id`, `/clients/new`, `/clients/import`) are all covered by registry tests. 1900
  unit tests, tsc + eslint clean. No schema change. Remaining Phase 2: the scheduling coachmark (needs a
  relay-step predicate — it's a state on the relay route, not its own page).

- [x] **2026-06-25 — Tour coachmark: relay (batch) detail page / review stages (item 39 Phase 2, 1 of 4)** (PR #259)
  First per-page coachmark on the tour foundation — this is what makes tutorials appear on pages beyond
  the dashboard. Added `data-tour-anchor`s to the relay detail page (the pipeline `relay-track`, the
  `relay-posts` review section, the `relay-actions` sidebar/checklist) and a `batch-detail-v1` tour that
  auto-fires once on first visit to the relay detail route (`/clients/:id/batches/:id`, exact route only,
  not /preview or /review-sessions children). 3 stops: where the relay is in the pipeline → review the
  posts → act and advance. Internal roles only. Registry change: `homePath` is now optional —
  page-coachmarks on dynamic routes (no single page to replay-navigate to) auto-fire only and are not
  listed in the Tips/Settings replay menu (`listToursForRole` filters to tours with a homePath). 1890
  unit tests (registry route gating + child-route exclusion + a page-test asserting the 3 anchors render),
  tsc + eslint clean. No schema change. Follow-up: contextual "replay this page's tour" for coachmarks.
  Remaining Phase 2 coachmarks: content generation, inbox/clients, scheduling (needs a step predicate).

- [x] **2026-06-25 — Tour highlight: spotlight the component each step points at (item 39 follow-up)** (PR #258)
  Tours were just floating tooltips with no visual link to the element they describe. Added a spotlight
  to `TourPopover`: when a stop anchors to a real element, the page dims (huge spread box-shadow) with a
  bright cutout + white ring framing the target, tracked every frame by the existing rAF loop. The
  overlay is `pointer-events-none` so the page (and the target) stay clickable through the dim. Concept
  stops (selector matches nothing) get no spotlight + a centered popover, unchanged. Foundational change
  to the shared `TourPopover`, so it improves the dashboard overview tour, every future coachmark, AND
  the magic-link review tutorial at once. 2 new tests (spotlight renders over a resolved target; absent
  for a concept stop). 1884 unit tests, tsc + eslint clean. No schema change. Positioning/visual is best
  eyeballed live (jsdom can't verify getBoundingClientRect). Next: the Phase 2 per-page coachmarks
  (batch/review, scheduling, generation, inbox/clients).

- [x] **2026-06-25 — Full-app onboarding tour: foundation + overview tour + Tips launcher (item 39, Phase 0+1)** (PR #257)
  Built a reusable multi-tour onboarding system and the first tour. **Foundation:** a `tour-registry.ts`
  (pure, shared client+server) of `TourDef`s with `selectAutoTour`/`getTourById`/`listToursForRole`/
  `isValidTourId`; per-tour versioned persistence via a new `User.seenTours String[]` column (additive
  migration) marked through `POST /api/onboarding/tour-seen { tourId }` + a deduped `markSeenTour`
  service; a rewritten role + multi-tour aware `TourProvider` (auto-fires the matching tour by
  route/role/seen-state, supports manual `start(tourId)`, never re-fires once seen); `role` + `seenTours`
  threaded AppChrome → AppShell → TourProvider. **Overview tour** (`overview-v1`, auto-fires once on
  `/dashboard`): role-aware stops (admin/AM 5-stop, designer 3-stop) anchored to always-present sidebar
  nav + centered concept stops, so it works on an empty day-one account; never shown to clients.
  **Two replay entry points:** a sidebar **"Tips"** launcher (between Settings and Report) listing the
  role's walkthroughs ("Account Manager Walkthrough" / "Designer Walkthrough" / "Admin Walkthrough"),
  and a Settings `ToursPanel` — both role-labeled via `labelForRole(role)`, replay via
  `router.push(homePath)` + `start(id)`, hidden for clients. Retired the legacy hardcoded 3-stop tour +
  the now-unused `RestartTourButton`. Client onboarding stays ONLY in the magic-link review tutorial.
  Built subagent-driven TDD (10 tasks) + opus whole-branch review READY TO MERGE (zero Critical/Important;
  verified the no-refire guarantee, role gating, dedup persistence, wiring, hooks ordering). 1882 unit
  tests, tsc clean, eslint clean on all new code (only 3 pre-existing errors remain in app-chrome/app-shell,
  confirmed pre-existing via blame). NOTE: changes `schema.prisma`, so the Trigger.dev pipeline deploy
  runs on merge (expected; additive migration). Contextual per-surface coachmarks (batch/review,
  scheduling, generation, inbox/clients) are later phases on this foundation. Spec + plan:
  `2026-06-25-full-app-tour-foundation-design.md`, `2026-06-25-full-app-tour-foundation-plan.md`.

- [x] **2026-06-25 — Client review tutorial: anchored tooltips replace the (missing) video (item 39, part 1)** (PR #256)
  The magic-link client review tutorial's "Show me how (15 sec video)" step pointed at
  `/tutorial/review-markup.{mp4,webm,jpg}` — assets that were never recorded/committed, so it rendered
  an empty black box ("the video isn't showing"). Per Julio, dropped the video and replaced it with an
  in-page ANCHORED TOOLTIP tour that points at the real review controls, reusing the existing
  `TourPopover` primitive (home-grown, no library, no backdrop, mobile-responsive). Flow: welcome card
  stays; its button (now "Show me how") launches a 3-stop walkthrough anchored to `review-post-card`
  (comment on a post) → `decision-button-row` (Approve / Changes / Edit Copy) → `review-submit-bar`
  (Submit). Removed the `<video>` + asset constants. No persistence change (still shows every load when
  unlocked); shell mount unchanged. No content to record, never goes stale, teaches in-context.
  Rewrote the modal test (welcome has no `<video>`; Show me how → tour; Next walks all 3 stops; Got it /
  Skip / X / ESC close). 1872 unit tests, tsc clean, eslint clean (one pre-existing `<img>` warning on
  the untouched welcome illustration). No schema change → no Trigger.dev deploy. Follow-ups: the welcome
  illustration SVG is also a missing placeholder (degrades via onError); TourPopover could scrollIntoView
  on stop change. Design: vault `2026-06-25-review-tutorial-tooltips-design.md`.

- [x] **2026-06-24 — Fix: "Go to NectrCRM" chip now shows on the retired scheduling steps too (item 37 follow-up)** (PR #255)
  The item 37 chip gated on the NEW `scheduling` step only. Batches that reached scheduling before the
  2026-06-22 pipeline rework still sit on the retired `ready_to_schedule` / `final_qa_schedule` steps,
  so the chip was invisible for every in-flight pre-rework batch (Julio hit this: on a scheduling-stage
  batch, no chip). Broadened the gate to a `SCHEDULING_STEPS` set covering all three. Component test adds
  positive cases for the two retired steps. 1871 unit tests, tsc + eslint clean. No schema change.

- [x] **2026-06-24 — "Go to NectrCRM" outbound link at the scheduling stage (item 37)** (PR #254)
  At the `scheduling` step the AM exports the Social Planner CSV and uploads it into NectrCRM (the
  white-labeled GoHighLevel app). Added a "Go to NectrCRM" chip to the batch detail action row, right
  next to the Export CSV button, that opens the app in a new tab. Self-gates to `RelayStep.scheduling`
  (returns null elsewhere); no subaccount deep link (the AM picks the location inside). New
  `GoToNectrCrmButton` modeled on `OpenClientContentButton` (secondary chip, `Link target="_blank"
  rel="noopener noreferrer"`, ExternalLink icon) + a `NECTR_CRM_URL` constant in `src/lib/nectr.ts`.
  **URL correction:** the brief said `app.nectarcrm.com`, but that host 301-redirects to itself (broken);
  the live app is `app.nectrcrm.com` (HTTP 200, matches the brand spelling + the nectr-pit-setup runbook),
  so the link points there. TDD: component test (renders at scheduling with correct href/target/rel,
  hidden at every other step) + a batch-page describe block (visible at scheduling, hidden at copy).
  1870 unit tests, tsc clean, eslint clean on the new files (only the pre-existing batch-page `Date.now`
  error remains, untouched). Additive only, no schema change → no Trigger.dev deploy. Design: vault
  `2026-06-24-go-to-nectrcrm-button-design.md`.

- [x] **2026-06-24 — Bulk image upload moved to the main run view (item 35)** (PR #253)
  The bulk image upload (drop N images, auto match by filename, drag to assign to posts, Apply)
  used to live at the bottom of the Preview / Internal Review feed. It's now the primary upload
  experience on the main batch run view: a new `BulkMediaUploadPanel` mounts at the TOP of the
  Posts section as a prominent "Upload images" card whose button expands the existing drag-and-drop
  mapping tray inline (`onApplied` → `router.refresh()`). Gated on `canUploadMedia` (`post.media.edit`)
  + `isLive` + posts exist. Preview is now fully **view-only**: removed the bulk tray AND the
  pre-existing per-post `MediaUpload` from the preview shell (per Julio: all upload moved to the main
  view), so the AM sees posts exactly as the client will. The per-post uploader still lives on the
  main run view's `PostCard` (kept), so no upload capability is lost. `BulkMediaTray` itself is
  unchanged (same Vercel Blob + `POST /api/posts/[id]/media` path, no API change); normalized the gate
  from the broader `client.edit` (old preview tray) to `post.media.edit` to match the per-post uploader.
  Brainstorm → design → TDD → independent opus review READY TO MERGE (zero Critical/Important). 1866
  unit tests, tsc clean, eslint clean on the new file (only pre-existing Date.now + rules-of-hooks
  errors remain, untouched). No schema change → no Trigger.dev deploy. Design: vault
  `2026-06-24-bulk-upload-main-view-design.md`.

- [x] **2026-06-24 — Rename confusing "Preview" labels (item 34)** (PR #252)
  "Preview" was used for two different controls and neither is a preview. The batch-page **"Preview"**
  button opens the AM's INTERNAL markup/review surface (pin, comment, approve, submit to designer), so
  it's now **"Internal Review"**. The magic-link row **"Open Preview"** button actually opens the CLIENT
  review page in a new tab, so it's now **"Open client review"**. Also aligned the breadcrumb + hero
  title on the `/preview` page and the `preview_review_submitted` notification copy ("finished the
  internal review"). **Labels only** — the `/preview` route, `src/components/preview/` dir (shared with
  the client + feedback surfaces), all testids, and the `preview_review_submitted` enum are unchanged
  (no broken bookmarks, no migration). 9 lines across 5 files. 1858 unit tests, tsc + eslint clean. No
  schema change → no Trigger.dev deploy.

- [x] **2026-06-24 — Reply notifications: client email + bidirectional "reply waiting" indicators** (PR #251)
  Follow-up to item 33. A reply in a review conversation was silent. Now: (1) when the AM replies to a
  client's thread, the client gets an email (coalesced via an atomic 30-min cooldown claim on
  `MagicLink.replyEmailSentAt`, so a burst of AM replies sends one "you have new replies" email with a
  deep link back to their live review; `replyTo` = AM). New `AmReplyEmail` template + `notifyClientOfAmReply`
  service hooked into `replyToPostFeedbackAction` (always) and `addCommentAction` (only when the actor is
  an AM — clients never email themselves). (2) The AM's existing header bell lights when a client replies
  or pins: the two reviewer actions call a new `notifyAmOfClientReply` that emits a new
  `post_comment_added` activity mentioning the assigned AM (reuses the Mention/bell infra; closes the
  deferred item-33 follow-up). (3) The client magic link badges each post with an unseen AM reply, via a
  new per-reviewer `MagicLinkReviewer.repliesSeenAt` (compute from the pre-load value, then mark-seen on
  open). One additive migration (`repliesSeenAt`, `replyEmailSentAt`, `post_comment_added`). Both notify
  helpers live in `src/server/lib/` and never throw. Brainstorm → spec → plan → subagent-driven TDD;
  final opus whole-branch review READY TO MERGE (zero Critical/Important; verified atomic cooldown,
  email-direction symmetry, badge read-before-write ordering, internal-visibility bell path). 1858 unit
  tests, tsc + eslint clean. NOTE: this PR changes `schema.prisma`, so the Trigger.dev pipeline deploy
  runs on merge (expected, additive migration). Follow-ups (logged, NOT done): filter revoked/expired
  links before emailing (avoid a dead-link email); add a wiring test for the reviewer-action bell calls;
  guard the email subject against an empty client name.

- [x] **2026-06-24 — Living review conversation: magic link stays interactive after submit + post-level threads (item 33)** (PR #250)
  The client review magic link no longer freezes at submit. Submitting used to swap the whole feed
  for a static "thanks, email us" screen, so the AM (who reads feedback AFTER submit) and the client
  could never actually have a back-and-forth. Now: after submit the feed stays live in a LOCKED
  conversation mode — verdicts/Notes/Edit-copy are read-only, but pins, thread replies, and NEW pins
  stay interactive, so the client can read AM replies and reply back; a banner explains they can keep
  discussing. Also makes NON-PIN feedback repliable: a post whose feedback is just a verdict + Notes
  had no thread to reply into. On the AM "View client feedback" rail, such a post now shows a
  "General feedback" reply box; the AM's reply promotes the client's Notes into a reviewer-attributed
  POST-LEVEL thread (idempotent, seeded from the Notes) and appends the AM reply — visible to the
  client on their (now-live) link. New: `findOpenPostLevelReviewerThread` + `promotePostFeedbackToThread`
  + `replyToPostFeedbackAction`, an inline `CommentThread` component + a client post-level Comments
  section, and the rail split (post-level threads excluded from the numbered pins to stay aligned with
  the canvas). No schema change (reuses PostThread/PostComment; `pin:{kind:'post'}` = post-level). The
  client post-level path reuses `leaveCommentAsReviewer` (no session-status gate, verified). Built
  brainstorm → spec → plan → subagent-driven TDD; final opus whole-branch review READY TO MERGE (zero
  Critical/Important; verified reviewer attribution makes seeded threads visible in BOTH surfaces,
  idempotent find-or-create, pins-stay-live-when-locked, no in-progress regression, AM-only gating).
  1833 unit tests, tsc + eslint clean. `detect-pipeline-changes` skips (service lives in `src/server/lib/`,
  not `services/`). Follow-ups (logged, NOT done): notify the AM in-app when a client replies post-submit;
  remove the now-dead `submittedSummary` prop; caption-vs-image pin numbering parity (pre-existing,
  reduced here); let the client reopen a resolved post-level thread if desired.

- [x] **2026-06-24 — Hide the cost breakdown from AMs and designers** (PR #249)
  The run cost breakdown on the batch detail page rendered for everyone, with no permission
  check — so account managers and designers saw per-run spend (token counts, API + infra dollar
  cost). Gated the render on `can(ctx, 'cost.viewAll')` and flipped the `account_manager` system
  default for `cost.viewAll` from true to false (designer + client were already false). Net:
  cost breakdown shows for **admins and the platform owner only**; AMs, designers, and clients no
  longer see it. `cost.viewAll` has no other consumer in the app, so the default flip only affects
  this section. No schema change (Trigger.dev deploy skipped). 1810 unit tests.

- [x] **2026-06-24 — Per-post "Fix with AI" in the AM client feedback view (item 32)** (PR #248, `4828a38`)
  Wired a working per-post "Fix copy with AI" into the AM "View client feedback" rail. The feature
  was already fully built (real Claude call, diff modal, accept→applies caption) but only mounted in
  the inline pin popover, which the AM markup view suppresses — so the button never appeared there.
  New `proposeFixForPost` / `acceptFixForPost` aggregate a post's FULL feedback (overall verdict +
  the client's own suggested caption + every pin/comment) into one rewrite, instead of one thread.
  The two API routes + the button + the diff modal now take an optional `threadId` (present → per-pin,
  unchanged; absent → per-post). The rail shows the button AM-only, only when there's copy feedback
  (changes_requested / caption_edited / any open thread), refreshing on accept. Accept snapshots via
  the shared `snapshotPostVersion` helper inside a now-truly-atomic transaction (throws if the version
  snapshot fails, so the caption can't commit without a version row — a real bug the review caught),
  records `post_caption_ai_fixed`, and does NOT auto-resolve pins. Model unchanged (claude-opus-4-7).
  No schema change. 1804 unit tests. Follow-up: multi-round verdict phrasing can lag the newest round
  (documented in a code comment).

- [x] **2026-06-24 — Relay timeline: space out step labels so titles don't crowd** (PR #247, `92918da`)
  The relay detail page step timeline (`relay-track.tsx`) packed its columns with `gap-0` and let
  each column hug its label, so after the pipeline rework lengthened the step names ("Design
  Revision", "Initial Design", "Pre-Client QA", etc.) adjacent titles butted together on desktop
  and read as overlapping. Switched to a uniform column width (`w-[96px]`) with a small
  inter-column gap (`gap-x-1.5`), widened the connector line to `calc(100% + 0.375rem)` so it
  bridges the gap and stays continuous, and inset the labels (`px-1`). Labels stay one line and
  truncate (existing hover tooltip shows the full name) only when genuinely too long. CSS only.

- [x] **2026-06-24 — AM feedback: Copy-edited block anchors canvas + greyed accepted state + emoji-safe diff** (PR #246, `211292e`)
  Three changes to the AM client-feedback caption-suggestion block. (1) Clicking the "Copy edited"
  block (label + diff) now anchors/scrolls the center canvas to that post, like the row header
  already did — mouse + keyboard (Enter/Space) with a focus-visible ring; Accept/Reject sit outside
  the clickable region so they never trigger an anchor. (2) Once the AM accepts the client's caption
  suggestion, the block becomes a greyed "✓ Caption accepted" success state showing the applied
  caption, with no Accept/Reject buttons (accept-only; rejected posts unchanged). Driven by a new
  `captionAccepted` flag on the feedback post VM, derived from `ReviewItem.acceptedAsPostVersionId`.
  (3) The caption diff (`src/lib/text-diff.ts`) is now emoji/grapheme-safe: it tokenizes with
  `Intl.Segmenter` (granularity 'word') + `diffArrays` instead of jsdiff `diffWordsWithSpace`, so
  surrogate-pair emoji, skin-tone modifiers, ZWJ families, and regional flags are single indivisible
  tokens and never split mid-grapheme (previously a skin-tone change showed a bare modifier and a
  ZWJ family emitted stray fragments). Same `DiffSegment[]` output + word-level granularity +
  reconstruction contract; also fixes the shared server-side Fix-with-AI diff. No schema/server-action/
  API change (Trigger.dev deploy skipped). 1790 unit tests; final opus whole-branch review READY TO MERGE.

- [x] **2026-06-24 — Chat popup is a right-side drawer on desktop; FAB nudged ~10px up-left** (PR #245)
  Follow-up to #244: on desktop (lg+) the client thread now opens as a right-side slide-in drawer
  (full height, pinned to the right, `w-[420px]`) instead of the bottom sheet; mobile keeps the
  bottom sheet. The floating chat button moved from `bottom/right-4` to `bottom/right-[26px]`
  (~10px up-left). CSS only on `MobileThreadFab`. 1776 unit tests.

- [x] **2026-06-23 — AM review: internal chat is a toggle popup, not a fixed right rail** (PR #244)
  Dropped the desktop right column on the AM review session detail page so the feedback rail +
  posts canvas get the full width. The internal AM/designer chat is now the floating chat button
  (`MobileThreadFab`) on every screen size, opening the slide-up panel — via a new `showOnDesktop`
  prop (default false, so the batch + client detail pages keep their desktop rail + mobile-only
  FAB). Grid is now 2 columns. 1776 unit tests.

- [x] **2026-06-23 — Fix: anchor scroll never actually scrolled the center** (PR #243)
  Live verification caught that clicking a rail row/header set the selected-post ring but did NOT
  scroll the center canvas to the post. Root cause: the shell's anchor handlers used
  `scrollIntoView({ behavior: 'smooth' })`, which is a no-op on this app's `<main>` scroll
  container (`flex-1 overflow-y-auto`); instant `scrollIntoView({ block:'center' })` scrolls it
  fine (verified in-browser). Dropped `behavior:'smooth'` on all three anchor scrolls (canvas-pin
  → rail, rail-header → canvas, pin-row → canvas). Affected the pin-row anchor (#240/#241) and the
  header anchor (#242) — both now actually scroll. Unit tests mock scrollIntoView so they didn't
  catch it; confirmed live. 1774 unit tests.

- [x] **2026-06-23 — AM feedback: post header anchors the center canvas** (PR #242)
  Clicking a post header in the left rail now scrolls/anchors the center canvas to that post
  (sets selectedPostId + `scrollIntoView`), so copy-change posts (caption_edited with no pins)
  anchor to the post the same way pin rows already do. The header is a button again (with this
  purpose). New `onSelectPost` prop on the rail; shell `selectPost` handler. 1774 unit tests.

- [x] **2026-06-23 — AM feedback rail is fixed/sticky with its own scroll** (PR #241)
  The left pin/feedback rail is now a sticky panel (like the right internal-chat rail) with its
  own internal scroll (`lg:sticky lg:top-4 lg:max-h-[calc(100dvh-5rem)] lg:overflow-y-auto`), so
  the per-pin accordion expands within the panel and the page no longer jumps. The rail root no
  longer owns the scroll (the column does). CSS only. 1772 unit tests.

- [x] **2026-06-23 — AM feedback: faithful post in canvas + edit-copy clarity** (PR #240)
  Four changes. (1) The AM center canvas renders the real `InstagramFeedPost`/`FacebookPost`
  (image + caption + pins) read-only instead of a bare image, with an IG/FB platform toggle —
  so the AM sees the full post incl. the caption under the image. (2) Clicking a rail pin row
  scrolls the center to that post (bidirectional with canvas-pin → rail-expand). (3) "Copy
  edited" badge on the canvas post + a before→after diff in the rail (reuse `CaptionDiffView` +
  `diffText`) next to Accept/Reject. (4) The client magic-link "Edit copy" affordance restyled
  from a subtle link into a prominent labeled button. Added an additive `suppressInlinePopover`
  prop to the feed posts (default false → client surface unchanged; only the AM canvas sets it,
  so pin clicks drive the rail instead of the post's internal popover). 1772 unit tests.

- [x] **2026-06-23 — AM feedback rail: collapsible per-pin rows** (PR #239)
  Refines the item 31 rail: each client pin/comment is now its own collapsible row,
  grouped under its post. Collapsed (default) shows the initial comment text fully
  wrapped + a "N replies" count, no image; clicking expands to replies + images +
  reply box + Resolve. Expansion is controlled by the shell's `selectedThreadId`, so
  clicking a pin on the canvas expands + scrolls to its row (accordion, one open at a
  time). Per-post header keeps verdict + Accept/Reject caption + Mark addressed.
  New `PinCommentRow`; retired `ThreadConversation`. Canvas / internal-chat rail /
  entry button / VM + actions unchanged. 1756 unit tests.

- [x] **2026-06-23 — AM "View client feedback" markup layout (item 31)** (PR #238)
  Restructured the AM review session detail page into a markup-style layout: left
  client-feedback rail (one row per post, plainly-approved collapsed), center posts
  canvas with read-only clickable pins, right sticky internal AM/designer chat (+
  mobile FAB; mobile stacks feedback first). Bidirectional sync (click a pin →
  rail expands that thread; click a row → canvas highlights the post). New shared
  `ThreadConversation` carries the running client↔AM dialogue with text + attached
  images stacked (not side-by-side) + reply composer with image attach. AM actions
  (accept/reject caption suggestion, resolve pin, use-as-post-image, mark addressed)
  wired to existing server actions hoisted to a parameterized `FeedbackActions` — no
  schema change, no new actions. "View client feedback" entry button on the batch
  page (row CTA + header button when a review is submitted). Standalone flex fix so
  comment text + image stack. Intentional scope cuts: AM inline caption editing +
  AM pin-dropping are not on this page. 1737 unit tests. Follow-ups: startTransition
  double-submit window; pre-existing comment-action auth looseness (composer now
  surfaced more broadly).

- [x] **2026-06-23 — Client review draft 404: exempt /api/review/** from Clerk** (PR #237)
  Critical: client review was broken for every real (non-Clerk) client. Magic-link
  reviewers have no Clerk session, but `/api/review/**` was not in the middleware
  public-route list, so `auth.protect()` returned **404** on every draft save.
  `saveItemDraft` (the only thing that creates the `ReviewSession`) never ran, so
  Submit's `findActiveSession` returned null and threw "No active session to
  submit", which the shell silently swallowed → stuck confirm modal. Latent since
  the draft route landed (#112); only "worked" for testers signed into Clerk in the
  same browser. Fix: extracted route patterns to `src/lib/route-matchers.ts`
  (imported by middleware + the test, so the regression test guards the real
  source) and added `/api/review/(.*)` to the public list (also unbreaks the
  reviewer comment-image upload route). Plus: stop swallowing — submit errors show
  in the still-open modal, draft-save failures raise a dismissible alert. NOT deploy
  skew. 1699 unit tests (+13). Follow-ups: prod is on Clerk **dev** keys (should be
  prod keys); review never worked for real clients before this.

- [x] **2026-06-23 — Client review: sticky condensed progress + Approve all bar** (PR #236)
  The top card (Reviewing as / progress / Approve all) scrolled away; now a
  condensed bar (compact `reviewed/total` + slim progress + the reused Approve all
  button) pins to the top once the full card scrolls out of view, and hides on
  scroll back up. New presentational `ReviewStickyBar`; the shell uses an
  IntersectionObserver on a sentinel to toggle a `pinned` flag (conditional mount,
  no layout shift). Reuses the existing summary + approve wiring, no logic dup.
  UI only. 1686 unit tests.

- [x] **2026-06-23 — Generation pipeline: per-step timing instrumentation** (PR #235)
  Adds per-step wall-clock timing to `generateContentTask` so a slow run reports
  WHERE the time goes (date calc / brief / crawl / facts / captions / finalize),
  not just a lumped total. New `makeStepTimer` helper; durations logged to the
  Trigger.dev run output + persisted on `ContentRun.tokenUsage.stepDurationsMs`
  (complete + failed paths). Observability only, no behavior change. Diagnostic
  for the "why is generation slow" investigation (suspect: caption step, Opus 4.7
  @ 32K + multi-pass QA; crawl secondary). 1683 unit tests.

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
