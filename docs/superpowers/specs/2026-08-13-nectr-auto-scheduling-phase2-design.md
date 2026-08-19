# Design: auto-schedule posts into a client's NECTR Social Planner (Phase 2)

Date: 2026-08-13
Author: Julio Aleman (with Claude)
Status: Draft, pending review
Scope: Phase 2 of the NECTR auto-scheduling feature. This phase adds the actual
scheduling push: on the scheduling step, Relay creates real scheduled posts in
the client's NECTR sub-account via API. Phase 1 (connection wiring + health
check) shipped and is live on prod (#430).

## Background

Today an AM finishes a batch, then schedules its posts into the client's NECTR
(white-labeled GoHighLevel) sub-account by exporting a Social Planner CSV
(`social-planner-csv.ts`) and uploading it by hand in NECTR
(`export-and-schedule-button.tsx`). That CSV sets `postAtSpecificTime = "<date>
08:00"` (location-local) and NECTR publishes the scheduled posts. So NECTR's
scheduler is proven daily; the manual step is just the CSV upload.

Phase 2 automates that step: on the scheduling -> completed transition, Relay
creates the same scheduled posts directly via the NECTR API, as a best-effort
side effect alongside the existing Drive graphics upload (#425), mirroring
`drive-upload.ts`.

### Hard constraint: the CSV path stays a working failsafe

The existing CSV export + manual upload (`social-planner-csv.ts`,
`export-and-schedule-button.tsx`, `go-to-nectrcrm-button.tsx`) is NOT removed or
changed. It remains a fully functional manual fallback for when the automatic
push has a bug or a client needs a one-off. The automatic push is additive and
runs beside it.

## Decisions (from the 2026-08-13 brainstorm)

- **True-scheduled, like-for-like.** Create posts with `status: "scheduled"` at
  8am in the client's location timezone on each post's date, matching the CSV.
  Not drafts, not an approval queue. Content reaches this step only after full QA
  and (when enabled) client review, so scheduling approved content matches the
  team's current risk posture.
- **All connected accounts.** Post to every connected, non-expired account the
  location has (Facebook, Instagram, LinkedIn, ...). Expired accounts are skipped
  and reported.
- **Single idempotency field.** One additive `Post.nectrScheduledId String?`
  records the NECTR post id per Relay post, so a retry or a re-finish never
  double-schedules.
- **Media by direct URL.** Send `mediaUrls[0]` as the post media. The current CSV
  already puts Relay's Vercel Blob URLs in `imageUrls` and NECTR fetches them, so
  the direct-URL path is proven. Multi-image carousels are out of scope for v1
  (matches the CSV, which also sends only the first image).
- **Keep the CSV fallback** (above).

## Key facts confirmed in the codebase (+ Phase 0 API facts)

- The best-effort side-effect seam: `finishBatchAction`
  (`src/server/actions/relay.ts`) already calls `uploadPostGraphicsToDrive` in a
  try/catch on the scheduling -> completed transition and returns the result;
  `checklist-panel.tsx` toasts it with a Retry action (`retryDriveUploadAction`).
  The NECTR push slots in exactly here.
- `drive-upload.ts` is the service template: loads the batch + client config,
  loads posts (`db.post.findMany` where `batchId`, `deletedAt: null`, ordered by
  `postDate`), best-effort per-item loop, returns a status union, `now`
  injectable for tests.
- Post fields (`schema.prisma`): `postDate DateTime`, `caption String`,
  `hashtags String[]`, `mediaUrls String[]`.
- CSV content formatting (`social-planner-csv.ts` `buildContent`): `caption` +
  one blank line + space-joined hashtags, each part trimmed, empty parts omitted.
  We reuse this exact formatting for parity.
- Phase 1 delivered `src/lib/nectr-social.ts` (`getAccounts`, `getUsers`,
  `pickServiceUserId`, typed errors, shared `NECTR_AGENCY_TOKEN`) and
  `Client.nectrLocationId`.
- Phase 0 API facts: `POST /social-media-posting/{locationId}/posts` with
  `accountIds`, `summary`, `media: [{ url, type }]`, `status: "scheduled"`,
  `scheduleDate`, `type: "post"`, and a REQUIRED `userId`. `GET /locations/{id}`
  returns the location `timezone` (e.g. `US/Eastern`).

## The changes (Phase 2)

### 1. Extend the wrapper (`src/lib/nectr-social.ts`)

Add the write + one read, keeping the Phase 1 shape (injectable deps, typed
errors, GET/POST via the shared token):

- `getLocation(locationId, deps?)` -> `Promise<{ timezone: string | null }>`. GET
  `/locations/{locationId}`; used to resolve the scheduling timezone.
- `createPost(locationId, input, deps?)` -> `Promise<{ id: string }>`. POST
  `/social-media-posting/{locationId}/posts`, returns the created post `_id`.
  `input` = `{ accountIds, summary, mediaUrl?, mediaType?, scheduleDate, userId }`
  and the function assembles the payload (`status: "scheduled"`, `type: "post"`,
  `media: mediaUrl ? [{ url, type }] : undefined`, plus the per-platform detail
  objects the API requires for the targeted platforms, e.g.
  `instagramPostDetails: { type: "post" }`).

### 2. Idempotency field: `Post.nectrScheduledId`

- Additive migration: `Post.nectrScheduledId String?` (nullable). One column, no
  backfill.
- Not user-editable; set by the push service, read to skip already-scheduled
  posts.

### 3. The push service (`src/server/services/nectr-schedule.ts`)

Single export `scheduleBatchToNectr(batchId, now = new Date()):
Promise<NectrScheduleResult>`, best-effort by contract (never throws for expected
conditions), mirroring `drive-upload.ts`.

Flow:
1. Load batch + `client.nectrLocationId`. No location id -> `{ status: 'skipped',
   reason: 'no-location' }`.
2. Resolve auth/config: `getAccounts(locationId)` and `getUsers(locationId)`. A
   `NectrConfigError` (token unset) -> `{ status: 'skipped', reason:
   'not-configured' }`.
3. Filter to connected, non-expired accounts. None -> `{ status: 'skipped',
   reason: 'no-accounts' }`. Resolve `userId = pickServiceUserId(users)`; none ->
   `{ status: 'skipped', reason: 'no-user' }`.
4. Resolve the location timezone via `getLocation(locationId)` (fallback
   `US/Eastern` if null).
5. Load the batch's posts (`deletedAt: null`, order `postDate` asc) with
   `caption`, `hashtags`, `mediaUrls`, `postDate`, `nectrScheduledId`.
6. For each post WITHOUT a `nectrScheduledId`: build `summary` via the reused
   `buildContent(caption, hashtags.join(' '))`; `mediaUrl = mediaUrls[0]`;
   `scheduleDate` = 8am in the location timezone on `postDate`; call
   `createPost(locationId, { accountIds, summary, mediaUrl, scheduleDate, userId
   })`; on success persist `Post.nectrScheduledId = id`. Per-post failures are
   caught and collected, never abort the loop.
7. Aggregate `NectrScheduleResult`:
   - `{ status: 'skipped', reason: 'no-location' | 'not-configured' |
     'no-accounts' | 'no-user' | 'no-posts' }`
   - `{ status: 'ok' | 'partial' | 'failed', scheduled: number, alreadyScheduled:
     number, accounts: number, failed: { post: string; reason: string }[] }`

Reuse of `buildContent`: export it from `social-planner-csv.ts` (an additive
export; the CSV's runtime behavior is unchanged) and import it here, so the
scheduled `summary` matches the CSV content byte-for-byte. (If touching that file
at all is unwanted, replicate the 3-line helper instead; the spec's default is
the shared export.)

### 4. Hook into `finishBatchAction` + UI

- In `finishBatchAction`, after the existing Drive upload block, add a second
  best-effort try/catch calling `scheduleBatchToNectr(batchId)`; a thrown error
  is only logged (must not roll back completion). Return the result on the action
  payload next to `driveUpload` (e.g. `nectrSchedule`).
- `checklist-panel.tsx`: a `notifyNectrResult` toast per variant (ok -> "Scheduled
  N posts to NECTR"; partial/failed -> `toast.error` with a **Retry** action;
  skipped no-location / not-configured / no-accounts -> a plain informational
  toast). New `retryNectrScheduleAction({ batchId })` mirrors
  `retryDriveUploadAction`: same gate, re-runs `scheduleBatchToNectr` (idempotent
  via `nectrScheduledId`), safe on a completed relay.

### 5. Timezone handling (the Phase 0 gap)

Phase 0's scheduled post did not fire in-window because the `scheduleDate` was
sent as UTC `...Z`, which NECTR appears to read as location-local (pushing the
real fire time hours out). Phase 2 resolves the location timezone and builds an
8am-local `scheduleDate`. The exact wire format is pinned by a **timezone
validation spike** (the first implementation step): on the internal FON
sub-account, schedule a post a few minutes out expressed as 8am-local-equivalent
and confirm it fires at the intended wall-clock. Candidate formats to test:
location-local ISO without `Z`, ISO with the location's numeric offset, and UTC
derived from the location tz. The service uses whichever the spike confirms.

### 6. Connect / manage accounts deep-link

A lightweight affordance so an AM can reach the place to connect a client's
social accounts without hunting through NECTR. In the client profile's Scheduling
section, next to the Phase 1 "Test connection" button, add a "Connect / manage
accounts" link that opens the client's NECTR Social Planner connections screen in
a new tab, built from the stored `nectrLocationId`
(`https://app.nectrcrm.com/v2/location/{nectrLocationId}/...`; the exact sub-path
is confirmed against a live NECTR sub-account during implementation). Connecting a
Facebook / Instagram / LinkedIn account is an interactive OAuth flow (the account
owner logs in and consents), which GHL's UI already handles, so Relay only
deep-links to it and does not reimplement OAuth. The link shows only when
`nectrLocationId` is set and the user `canEdit`. After a connection is made, the
existing "Test connection" button reflects the new account. No API call, no new
server action, no stored credentials.

## What is out of scope for Phase 2

- The CSV export + manual upload path (untouched failsafe).
- Multi-image carousels (v1 sends `mediaUrls[0]`, matching the CSV).
- Editing / rescheduling / deleting a NECTR post after it was scheduled (if a
  post's caption or image changes post-scheduling). v1 schedules once; edit-sync
  is a later phase. The `nectrScheduledId` makes it addressable later.
- A FULL in-Relay OAuth connect flow (start-OAuth -> platform login -> callback
  -> attach, all inside Relay). Deferred; only the lightweight deep-link (change
  6) is in scope for Phase 2. The Phase 1 wrapper makes the full flow addable
  later if the deep-link proves clunky.
- Backfilling `nectrLocationId` (a data task; done per client as they onboard).

## Testing (TDD)

- **wrapper:** `createPost` posts to the right path with `status: "scheduled"`,
  `type: "post"`, the media array when a url is given, and the required `userId`
  (asserted via injected `fetchImpl`); returns the parsed `_id`; a non-2xx yields
  `NectrApiError`. `getLocation` parses `timezone`.
- **schedule service:** each skip reason (no-location, not-configured,
  no-accounts, no-user, no-posts); ok path schedules every unscheduled post and
  persists `nectrScheduledId`; idempotency (a post with an existing
  `nectrScheduledId` is not re-created; `alreadyScheduled` counts it); partial
  (one post fails, the rest still schedule); expired accounts filtered out;
  `scheduleDate` is 8am in the resolved timezone on `postDate`. All via mocked
  wrapper fns + a mocked `db` (mirroring the existing service tests).
- **finishBatchAction:** the NECTR push runs after the Drive upload, its throw is
  swallowed (completion still succeeds), and the result rides the payload.
- **checklist-panel:** result variants map to the right toast; the failed/partial
  toast carries a working Retry.
- Green gate: tsc + full unit suite + `next build` + eslint. One PR.

## Dependencies / risk

- **Timezone format** is the main implementation risk; the validation spike (step
  1) de-risks it before the service ships. If unresolved, no posts should be sent
  (fail closed) rather than scheduled at the wrong time.
- **Per-platform payload quirks:** Instagram requires media and may require
  `instagramPostDetails.type`; a post with no image would fail for IG. The
  service sends `mediaUrls[0]` (present for graphics posts) and includes the
  per-platform detail objects; posts with no media are still sent to text-capable
  platforms (FB/LI) and will surface a per-post failure for IG, collected in the
  result rather than aborting.
- **Live client accounts:** this writes real scheduled posts. Mitigations: it
  only fires on the QA-passed scheduling step; it is idempotent; the CSV fallback
  stays; and the internal-FON spike validates the mechanics before any client
  runs it. `NECTR_AGENCY_TOKEN` (Caleb) must be set for the push to do anything;
  until then it cleanly skips as not-configured.
- **Additive migration only** (`Post.nectrScheduledId`); no pipeline redeploy (no
  `src/server/jobs` change).

## Open items

- Confirm the agency token has `socialplanner/post.write` at the agency level
  (Phase 1 precondition; still Caleb's action).
- The timezone wire format (resolved by the step-1 spike).
- The exact NECTR connections-page URL sub-path (pinned against a live sub-account
  during implementation of change 6).
