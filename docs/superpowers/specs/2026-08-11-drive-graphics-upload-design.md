# Design: Upload post graphics to the client's Google Drive on relay completion

Date: 2026-08-11
Author: Julio Aleman (with Claude)
Status: Draft, pending review
Origin: 2026-08-11 AM-team Relay launch meeting (Mollie + AMs), meeting item B

## Problem

When a relay is finished at the scheduling step, the AM needs the final post
graphics archived in the client's Google Drive folder, grouped by month. Today
this is manual: open Canva, download each graphic, upload them into the right
Drive folder by hand. Slow and easy to get wrong (missing images, wrong folder,
no month grouping).

The client asset folders already live in the agency's shared Google Drive, and
Relay already holds the final post images. So Relay can do this automatically.

## Goal

When a relay is completed from the scheduling step, Relay automatically:

1. Finds or creates a subfolder named for the batch month (e.g. "September
   2026") inside the client's existing Drive assets folder.
2. Uploads each post's final graphic into that folder, overwriting any file of
   the same name from a prior run.
3. Records the outcome and surfaces it to the AM; a failed upload never blocks
   completing the relay.

Non-goal for v1: uploading the schedule CSV to Drive, video assets, Canva
integration, two-way sync.

## Decisions (locked with Julio, 2026-08-11)

- **Auth:** a single Google **service account** added to the agency **Shared
  Drive** (confirmed a true Shared Drive / Team Drive). No per-user OAuth.
- **Trigger: automatic on relay completion.** The upload runs as a side effect
  when the relay transitions from scheduling to `completed` (the "finish"
  button). Not a manual button.
- **File naming:** zero-padded post number plus the source extension, ordered by
  post date: `01.jpg`, `02.png`, ... Sorts correctly in Drive and is stable.
- **Re-run behavior: overwrite.** A file of the same name in the month folder is
  replaced, so the folder always reflects the latest graphics.
- **Best effort:** a Drive failure is reported but never rolls back or blocks
  the relay completion.

## Key facts confirmed in the codebase

- `Client.assetsFolderUrl` holds the client's Google Drive folder URL
  (`src/db/schema.prisma`). This is the parent folder.
- Post graphics are stored by Relay (Vercel Blob) and exposed as image URLs on
  the post; the scheduling data shape (`SocialPlannerPost`,
  `src/lib/social-planner-csv.ts`) already carries each post's image URL, built
  from the same batch posts the export uses.
- Batch month: `resolveBatchTargetMonth()` (YYYY-MM) + `formatMonthYear()`
  (e.g. "September 2026") in `src/lib/batch-target-month.ts`.
- Relay completion is the transition to `RelayStep.completed`, handled in
  `src/server/services/relay.ts` (the completion path around lines 486-518 sets
  `completedAt`, validates the transition, reseeds the checklist). This is the
  hook point for the auto-upload.
- The scheduling checklist item "Graphics have been uploaded to Google Drive"
  ships in PR #423 and pairs with this behavior.
- `googleapis` is NOT yet a dependency and must be added.

## Setup (Julio's part, one time)

1. Create/reuse a Google Cloud project; enable the Drive API.
2. Create a service account; download its JSON key.
3. Add the service account email as **Content manager** on the agency Shared
   Drive.
4. Hand the JSON key to Claude to set as a Vercel secret.

## Auth details

- New env var `GOOGLE_DRIVE_SA_KEY` (service account JSON, single-line or
  base64). Set in Vercel Production and Development. Accessed via `process.env`,
  matching the existing secret pattern.
- Scope: `https://www.googleapis.com/auth/drive`.
- All Drive calls pass `supportsAllDrives: true` (and lookups
  `includeItemsFromAllDrives: true`) so the Shared Drive is handled correctly.

## Architecture

Three small, independently testable units.

### 1. `src/lib/google-drive.ts` (Drive service)

Wraps the `googleapis` Drive v3 client so nothing else imports googleapis and
tests mock one module.

- `getDriveClient()`: builds an authenticated Drive client from
  `GOOGLE_DRIVE_SA_KEY`. Throws a typed `DriveConfigError` if env is missing or
  malformed.
- `parseDriveFolderId(url): string | null`: extracts the folder id from an
  `assetsFolderUrl` (`/folders/{id}`, `?id={id}`, bare id). Pure, unit-tested.
- `findOrCreateFolder(drive, { parentId, name }): { id, url, created }`: finds a
  non-trashed folder of that exact name under `parentId` (Shared-Drive aware),
  else creates it. Idempotent.
- `upsertImage(drive, { folderId, name, contentType, bytes })`: if a file of
  that name already exists in the folder, updates its content (overwrite); else
  creates it. Implements the overwrite decision.

### 2. `uploadPostGraphicsToDrive(batchId)` service (`src/server/services/drive-upload.ts`)

Pure orchestration, callable from the completion path and from a retry action:

1. Load batch + client. If `client.assetsFolderUrl` is empty/unparseable,
   return `{ status: 'skipped', reason: 'no-folder' }`, no Drive call.
2. Load batch posts with image URL, post date, 1-based number (same ordering as
   the export/review numbering).
3. `month = formatMonthYear(resolveBatchTargetMonth(...))`.
4. `folder = findOrCreateFolder({ parentId, name: month })`.
5. For each post with an image: `name = pad(number) + ext(contentType)`; fetch
   the bytes from the Blob URL; `upsertImage(...)`. Collect per-post outcome.
6. Return `{ status, folderUrl, uploaded, overwritten, failed: [...] }`.

Per-post failures are independent and reported; folder-create failure returns a
failed status with a clear reason.

### 3. Wiring into relay completion

In the completion transition (scheduling -> `completed`) in
`src/server/services/relay.ts`:

- After the completion is committed (step + `completedAt` persisted), call
  `uploadPostGraphicsToDrive(batchId)` **best effort**: wrap it so any throw is
  caught and logged; the relay stays completed regardless.
- Persist the result summary on the batch (or an ActivityEvent, e.g.
  `graphics_uploaded`) so the UI can show "12 graphics uploaded to September
  2026" or a failure with a retry.

Runtime: the completion runs in a Next.js server action. For ~12 images (fetch
from Blob + upload to Drive) this fits the function time budget; the finish
click shows a brief pending state. If batches grow much larger, move the loop
into a Trigger.dev job the completion enqueues (the SA key would then also live
in the Trigger.dev env). Noted as the scale path, not built for v1.

### Failure recovery (the one manual affordance)

Because the trigger is automatic, the only manual control is a small **"Retry
Drive upload"** action shown on a completed relay when the last attempt failed.
It calls the same `uploadPostGraphicsToDrive` service. Safe to run on a locked
relay because it only touches Drive, never relay state. Overwrite semantics make
retries idempotent.

## Error handling

- Missing/invalid `GOOGLE_DRIVE_SA_KEY`: `DriveConfigError`, logged; surfaced as
  "Drive upload is not configured yet." Should only occur before setup.
- Missing/unparseable `assetsFolderUrl`: skipped with an actionable message, no
  Drive call.
- Per-image fetch/upload failure: collected, reported; does not block the others.
- Drive auth/permission failure: logged; surfaced as "Could not access the
  client's Drive folder."
- In all cases the relay still completes.

## Testing (TDD)

Unit (mock the drive client, no live network):
- `parseDriveFolderId`: URL variants + non-Drive returns null.
- File name derivation: zero-padding, extension from content type, order by post
  date.
- `findOrCreateFolder`: existing hit, create on miss, Shared-Drive flags.
- `upsertImage`: overwrites when name exists, creates when absent.
- `uploadPostGraphicsToDrive`: no-folder skip, happy path (right parent + names),
  partial-failure summary shape.
- Completion wiring: a Drive throw does not prevent completion (best-effort),
  and the result is recorded.

No test performs a real network call.

## Dependencies

- Add `googleapis` (Drive v3 + service-account auth), server-only. If bundle
  size is a concern later, swap to `google-auth-library` + direct Drive REST;
  `googleapis` is the faster path for v1.

## Rollout

1. Julio completes the Google Cloud + Shared Drive setup and hands over the key.
2. Claude sets `GOOGLE_DRIVE_SA_KEY` in Vercel (Dev first, then Production).
3. Build; test on a pilot client whose `assetsFolderUrl` points at a real
   folder by completing a relay and confirming the "Month Year" folder fills.
4. Ship; verify a real completion lands the graphics in the correct folder.

## Open items

None blocking. All four prior decisions are locked above. The only remaining
implementation confirmation is cosmetic file naming if the team later prefers
the designers' `PA-01` Canva labels over `01.jpg`; deferred.
