# Relay — Work Log

Running **task list + shipped log** for the Relay app, maintained across Claude
Code sessions on Julio's machine. Updated when a task ships and pushed to
`main`, so a `git pull` always shows the latest. Newest first.

Every shipped item below was built with tests (TDD), passed CI (Typecheck &
Test), and was deployed to prod (`accountsfons-projects/relay-app`).

---

## Open / in progress

From the 2026-06-26 triage (Batch A + B + C shipped; D in design):
- [ ] **Internal review parity with client review (Batch D)** — make `/preview` (the AM<->designer review) look AND flow like the client link: per-post Approve/Request-changes verdict, the ReviewPostCard look, and a round-based review->submit->respond loop with the designer working on `/preview`, tied to the Design Review step + the next-action banner. In design (`2026-06-29-...`).
- [ ] **(follow-up) Bell "Post N" copy** — the notification builder doesn't populate a per-post number (posts have no stored position); the copy ships fallback-safe. Add a cheap per-batch index map in `listMentionsForUser` to render true "Post N". (Batch B follow-up)
- [ ] **(follow-up) Set `NEXT_PUBLIC_APP_URL` in prod** to the friendly domain so review links don't depend on the Vercel alias fallback (see PR #268).
- [ ] **(cleanup) `FixWithAIButton` + `/api/posts/[id]/fix-with-ai` routes are now unused** — Fix-with-AI is fully unmounted from the UI (Regenerate-with-AI on the main relay page is the only AI caption tool). Remove the dead component + routes + their tests when convenient.
- [ ] **(follow-up) Refresh the admin force-step list** (`admin-force-step-section.tsx` `STEP_ORDER`) to the live step set — it predates the 2026-06-22 rework (omits `client_review`/`scheduling`, lists their retirees). `design_revisions` already removed.

## Notes / standing rules

- **Mobile:** every UI change is tested and adapted for phone width before it ships.
- **Hyperlinks:** any URL in user-entered free text is auto-linked, opens in a new tab, and wraps if long (centralized in `src/lib/linkify.ts` + `<Linkify>`).

---

## Shipped

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
