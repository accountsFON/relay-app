# Design: Upload post graphics to the client's Google Drive at scheduling

Date: 2026-08-11
Author: Julio Aleman (with Claude)
Status: Draft, pending review
Origin: 2026-08-11 AM-team Relay launch meeting (Mollie + AMs), meeting item B

## Problem

At the scheduling step, the AM needs the final post graphics archived in the
client's Google Drive folder, organized by month. Today this is manual: the AM
opens Canva, downloads each graphic, and uploads them into the right Drive
folder by hand. That is slow and easy to get wrong (missing images, wrong
folder, no month grouping).

The client asset folders already live in the agency's shared Google Drive, and
Relay already holds the final post images. So Relay can do this in one action.

## Goal

One AM action on the scheduling step that:

1. Finds or creates a subfolder named for the batch month (e.g. "September 2026")
   inside the client's existing Drive assets folder.
2. Uploads each post's final graphic into that folder.
3. Reports what was uploaded, skipped, and failed.

Non-goal for v1: uploading the schedule CSV to Drive, video assets, Canva
integration, or any two-way sync. (This supersedes the earlier "download CSV for
Drive" idea from the meeting; archiving the graphics is the real need.)

## Key facts confirmed in the codebase

- `Client.assetsFolderUrl` holds the client's Google Drive folder URL
  (`src/db/schema.prisma`). This is the parent folder.
- Post graphics are stored by Relay (Vercel Blob) and exposed as image URLs on
  the post; the scheduling data shape (`SocialPlannerPost` in
  `src/lib/social-planner-csv.ts`) already carries each post's image URL and is
  built from the same batch posts the export uses.
- The batch month is derived by `resolveBatchTargetMonth()` (YYYY-MM) and
  formatted by `formatMonthYear()` (e.g. "September 2026") in
  `src/lib/batch-target-month.ts`.
- The scheduling action UI lives at
  `src/components/relay/export-and-schedule-button.tsx`, rendered from the batch
  page (`src/app/(app)/clients/[id]/batches/[batchId]/page.tsx`, near line 414).
- The new scheduling checklist item "Graphics have been uploaded to Google
  Drive" ships in PR #423 and pairs with this button.
- `googleapis` is NOT yet a dependency and must be added.

## Auth model (decided: service account on the shared drive)

The agency's client asset folders are in a shared Google Drive, so a single
Google **service account** added to that drive can create folders and upload
files server side, with no per-user OAuth. This is the whole reason the feature
is practical.

Setup (Julio's part, one time):
1. Create (or reuse) a Google Cloud project and enable the Drive API.
2. Create a service account and download its JSON key.
3. Add the service account email as a **Content manager** on the agency shared
   drive (or the specific parent folder tree).
4. Hand the JSON key to Claude to set as a secret in Vercel.

Code side:
- New env var `GOOGLE_DRIVE_SA_KEY` (the service account JSON, stored as a
  single-line JSON string or base64). Set in Vercel Production (and Development
  for local testing). Accessed via `process.env`, matching the existing secret
  pattern (`BLOB_READ_WRITE_TOKEN`, `DATABASE_URL`).
- Scope: `https://www.googleapis.com/auth/drive` (create folders + upload).
- Drive API calls pass `supportsAllDrives: true` and, for lookups,
  `includeItemsFromAllDrives: true`, so a true Shared Drive is handled correctly.

OPEN CONFIRMATION (does not change the design, only a Drive-call flag): is the
agency drive a true **Shared Drive** (Team Drive) or a folder in someone's My
Drive shared with the team? Shared Drive is the clean case (org-owned files,
pooled storage). A shared My-Drive folder also works, but files are owned by the
service account. Confirm by inspecting a real client's `assetsFolderUrl`.

## Architecture

Three new units, each small and independently testable.

### 1. `src/lib/google-drive.ts` (pure-ish Drive service)

Wraps the `googleapis` Drive v3 client behind a narrow interface so the rest of
the app never imports googleapis directly and tests can mock one module.

- `getDriveClient()`: builds an authenticated Drive client from
  `GOOGLE_DRIVE_SA_KEY`. Throws a typed `DriveConfigError` if the env is missing
  or malformed.
- `parseDriveFolderId(url: string): string | null`: extracts the folder id from
  an `assetsFolderUrl` (handles `/folders/{id}`, `?id={id}`, and a bare id).
  Pure, unit-tested against URL variants.
- `findOrCreateFolder(drive, { parentId, name }): Promise<{ id, url, created }>`:
  queries for a non-trashed folder with that exact name under `parentId`
  (Shared-Drive aware); returns it if found, else creates it. Idempotent.
- `uploadImage(drive, { folderId, name, contentType, bytes }): Promise<{ id }>`:
  creates a file in the folder from a byte stream.
- `listFolderFileNames(drive, folderId): Promise<Set<string>>`: for skip-existing.

### 2. `src/server/actions/uploadGraphics.ts` (server action)

`uploadPostGraphicsToDriveAction({ batchId })`:

1. AuthZ: resolve the AM context and scope to a client the caller may act on
   (reuse the existing client-scoping gate used by other batch actions; AM can
   only act on their assigned client). Reject otherwise.
2. Load the batch and its client. If `client.assetsFolderUrl` is empty or
   unparseable, return an actionable error ("Set the client's assets folder URL
   first"), no Drive call.
3. Load the batch posts with their image URL, post date, and 1-based number
   (same ordering as the export / review numbering).
4. `month = formatMonthYear(resolveBatchTargetMonth(...))`.
5. `folder = findOrCreateFolder({ parentId, name: month })`.
6. `existing = listFolderFileNames(folder.id)`.
7. For each post with an image: derive the file name (see below); if already in
   `existing`, skip; else fetch the image bytes from the Blob URL and
   `uploadImage(...)`. Collect per-post outcome.
8. Return `{ folderUrl, uploaded: number, skipped: number, failed: Array<{ post, reason }> }`.

Partial failures do not abort the whole run; each post is independent and the
summary reports failures. Folder-create failure aborts with a clear message
(nothing to upload into).

File name (v1): zero-padded post number plus the source extension, e.g.
`01.jpg`, `02.png`, ordered by post date. Simple, stable, sorts correctly in
Drive. (Alternative discussed: `PA-01` client-initials style the designers use
in Canva. Deferred; the number-in-a-month-folder is unambiguous.)

### 3. `src/components/relay/upload-graphics-to-drive-button.tsx` (UI)

- Renders in the scheduling step next to `ExportAndScheduleButton` on the batch
  page. AM-only (same visibility as the export button).
- Click calls the action, shows a pending state, then a result toast:
  "Uploaded 12 graphics to September 2026" with a link to the folder, or a
  partial/error message listing failures.
- Idempotent by design: clicking again skips files already there, so a retry
  after a partial failure is safe.
- Pairs with the checklist item; does not auto-check it (honor system, matching
  the rest of the checklist).

## Decision: button, not auto-on-entry

The upload is triggered by an explicit AM button, not automatically when the
relay enters scheduling. Rationale: Drive uploads can fail (permissions,
network, a client with no assets folder set), and a visible button gives the AM
a clear success/error and a safe retry. A silent auto-upload can fail invisibly
right when the AM assumes it is done. (Reversible later: the same action can be
called from a step-entry hook if we want auto behavior.)

## Where it runs

A Next.js server action (serverless). For a typical batch (about 12 images, each
a fetch from Blob plus an upload to Drive) this fits comfortably in the function
time budget. If batches ever grow much larger, move the loop into a Trigger.dev
job and have the action enqueue it. Noted, not built for v1.

## Error handling

- Missing/invalid `GOOGLE_DRIVE_SA_KEY`: `DriveConfigError`, surfaced to the AM
  as "Drive upload is not configured yet," logged for ops. (Should only happen
  before setup is complete.)
- Missing/unparseable `assetsFolderUrl`: actionable message, no Drive call.
- Per-image fetch/upload failure: collected, reported in the summary, does not
  block the other images.
- Auth/permission failure from Drive (service account not on the drive): logged,
  surfaced as "Could not access the client's Drive folder."

## Testing (TDD)

Unit (mock the `google-drive` module or the injected drive client, no live
Drive calls):
- `parseDriveFolderId`: `/folders/{id}`, `?id={id}`, trailing slash/query, bare
  id, and a non-Drive URL returns null.
- File name derivation: zero-padding, extension from content type, ordering by
  post date.
- `findOrCreateFolder`: returns existing on hit, creates on miss, passes
  Shared-Drive flags.
- Skip-existing: a name already in the folder is skipped.
- Action: AM scoping (only own client), missing-folder-url error path, happy
  path calls Drive with the right parent + names, partial-failure summary shape.

No test performs a real network call; the Drive client is injected/mocked. This
mirrors how the repo tests other external integrations.

## Dependencies

- Add `googleapis` (Drive v3 + service-account auth). It is a large package but
  server-only and tree-shakeable to the Drive client; acceptable. If bundle size
  is a concern we can swap to `google-auth-library` plus direct Drive REST
  calls, but `googleapis` is the faster path for v1.

## Rollout

1. Julio completes the Google Cloud + shared-drive setup and hands over the key.
2. Claude sets `GOOGLE_DRIVE_SA_KEY` in Vercel (Dev first for testing, then
   Production).
3. Build behind the existing scheduling UI; test on a pilot client whose
   `assetsFolderUrl` points at a real month folder.
4. Ship; verify a real upload lands in the correct "Month Year" folder.

## Open items for review

1. Confirm Shared Drive vs shared My-Drive folder (implementation flag only).
2. Button vs auto: this spec chooses button. Confirm.
3. File naming: `01.jpg` style. Confirm or request `PA-01` client-initials.
4. Re-run behavior: skip files already present (default). Confirm vs overwrite.
