# Design: auto-schedule posts into a client's NECTR Social Planner (Phase 1)

Date: 2026-08-12
Author: Julio Aleman (with Claude)
Status: Draft, pending review
Scope: Phase 1 of a multi-phase feature. This phase wires up and verifies the
per-client GHL/NECTR connection. It does NOT post anything (that is Phase 2).

## Background: the multi-phase feature

Relay's scheduling step is the last human step before a batch is `completed`.
Today an AM finishes a batch, then manually schedules the posts into the
client's GoHighLevel sub-account (NECTR, Five One Nine's white-labeled GHL): the
app builds a Social Planner bulk-import CSV (`src/lib/social-planner-csv.ts`) and
`export-and-schedule-button.tsx` downloads it and opens `app.nectrcrm.com`, where
the AM uploads it by hand.

The overall feature replaces that manual CSV upload with a real API push: on the
scheduling step, Relay schedules the batch's posts directly into the client's
NECTR sub-account Social Planner, as a best-effort side effect alongside the
existing Drive graphics upload (PR #425).

A reads-first API spike (Phase 0, 2026-08-12) validated the mechanism end to end
against the live NECTR API (auth, scope, account enumeration, create / schedule /
delete). The phases:

- **Phase 0 (done):** prove the API path. A per-location token authenticates
  against the standard GHL host `services.leadconnectorhq.com`, carries
  `socialplanner/post.write`, and the full create / schedule / delete cycle works.
- **Phase 1 (this spec):** store the per-client connection and let an AM verify it
  is healthy, before any posting exists.
- **Phase 2:** the mapping + push service and the `finishBatchAction` hook (the
  actual scheduling).
- **Phase 3:** draft-first rollout with per-post status + retry.
- **Phase 4:** true scheduled posts + reconciliation + edits / reschedules.

Phase 1 is deliberately small and shippable on its own: a client can be
configured and its connection proven green with zero posting risk.

## Credential model (decided: shared agency token)

Relay has NO per-client secret storage and no encryption-at-rest helper today;
the only crypto is magic-link HMAC. The closest precedent is the Drive
integration: a SHARED service-account credential in env (`GOOGLE_DRIVE_SA_KEY`)
plus a plaintext, non-secret per-client pointer (`Client.assetsFolderUrl`).

We mirror that exactly:

- Auth uses ONE agency-level NECTR token, `NECTR_AGENCY_TOKEN`, stored in env
  (Vercel) and read in exactly one place.
- The only per-client value is the GHL **Location ID**, which is NOT a secret (it
  is an identifier). It is stored plaintext on the `Client` record, exactly like
  `assetsFolderUrl`.

This avoids building an encryption layer and a per-client token-minting workflow,
and covers every client the moment a Location ID is filled in.

**Isolation property:** the token source is confined to one function
(`getAgencyToken()` in `src/lib/nectr-social.ts`). If an agency token turns out to
be impossible on the NECTR whitelabel, only that function changes (to Option B: a
per-client encrypted PIT); the config field, the health action, the UI, and the
rest of the wrapper API are unaffected.

### Precondition (owner: Caleb, external to the code)

Caleb must mint or confirm an agency-level NECTR token with
`socialplanner/post.write`, `socialplanner/account.readonly`, and
`users.readonly` scope reaching all sub-accounts, set as `NECTR_AGENCY_TOKEN` in
the Vercel production environment. Phase 0 only proved per-LOCATION tokens (the
generic agency MCP key returned 403 on listing locations), so the agency token's
existence is unconfirmed. Phase 1 code is built and unit-tested without it (the
wrapper is injectable), but the "Test connection" button cannot return `ok`
against a real sub-account until the token is set.

## Key facts confirmed in the codebase (Phase 0 + repo map)

- `model Client` (`src/db/schema.prisma:262-315`) has no GHL/NECTR field. Existing
  per-client config fields like `assetsFolderUrl` and `canvaUrl` are plain
  nullable strings.
- The Drive pattern to mirror: `src/lib/google-drive.ts` reads its shared
  credential in one place, lazy-imports the SDK, throws a typed `DriveConfigError`;
  `src/server/services/drive-upload.ts` is best-effort and returns a result union;
  `finishBatchAction` (`src/server/actions/relay.ts:128-169`) invokes it in a
  try/catch and returns the result; `checklist-panel.tsx` toasts the result with a
  Retry action.
- Config UI: `client-profile-view.tsx` renders editable rows via `useFieldEditor`
  + field components (`KeyValueField`, `LinkField`, ...), persisting through
  `updateClientAction` -> `clientUpdateSchema`.
- Existing (manual) GHL surface: `src/lib/social-planner-csv.ts` (CSV builder,
  proves the field mapping), `src/lib/nectr.ts` (`NECTR_CRM_URL =
  https://app.nectrcrm.com`), `export-and-schedule-button.tsx`,
  `go-to-nectrcrm-button.tsx`.
- Phase 0 API facts: `GET /social-media-posting/{locationId}/accounts` lists
  connected accounts, each with a `platform` and an `isExpired` flag; `GET
  /users/?locationId=` lists users; a `userId` is required on every post (even
  drafts). Phase 1 uses only accounts + users (the health read); create-post is
  Phase 2.

## The changes (Phase 1)

### 1. API wrapper: `src/lib/nectr-social.ts`

A thin wrapper over the NECTR Social Planner API, structured like
`google-drive.ts`:

- `getAgencyToken(): string` reads `process.env.NECTR_AGENCY_TOKEN`; throws a typed
  `NectrConfigError` if unset. This is the ONLY read site of the token.
- `NECTR_API_BASE = 'https://services.leadconnectorhq.com'` with the `Version:
  2021-07-28` header (confirmed in Phase 0).
- `getAccounts(locationId, deps?)` -> `Promise<NectrAccount[]>`, where
  `NectrAccount = { id, platform, name, type, isExpired }`. GET
  `/social-media-posting/{locationId}/accounts`.
- `getUsers(locationId, deps?)` -> `Promise<NectrUser[]>` (`{ id, name, email, role
  }`). GET `/users/?locationId={locationId}`.
- HTTP/auth is injectable (a `fetchImpl` dep, default `fetch`) so unit tests run
  without network and without a real token.
- Typed errors: `NectrConfigError` (token unset), `NectrApiError` (non-2xx, carries
  status + message).

No posting functions in Phase 1 (Phase 2 adds `createPost`).

### 2. Client config field: `nectrLocationId`

- Additive migration: `Client.nectrLocationId String?` (nullable, plaintext). One
  column, no data backfill.
- `src/lib/schemas/client.ts`: add `nectrLocationId:
  z.string().trim().optional().or(z.literal(''))` to `clientInputSchema` and
  `clientUpdateSchema`.
- `client-profile-view.tsx`: a "NECTR Location ID" `KeyValueField` row (Assets
  section, or a new "Scheduling" subsection), persisted via the existing
  `updateClientAction` path. No new update action needed.

### 3. Connection-health action: `checkNectrConnectionAction`

- Location: `src/app/(app)/clients/actions.ts` (next to `updateClientAction`).
  Org-scoped and permission-gated with the existing pattern (`findClientForUser`
  plus a client-editor / `admin.portal` gate).
- Input `{ clientId }`. Resolves the client's `nectrLocationId`.
- Returns a `NectrConnectionStatus` union (mirrors `DriveUploadResult`):
  - `{ status: 'no-location' }` if the client has no `nectrLocationId`.
  - `{ status: 'not-configured' }` if `NECTR_AGENCY_TOKEN` is unset
    (`NectrConfigError`).
  - `{ status: 'error', message }` on an API failure (`NectrApiError`).
  - `{ status: 'ok', accounts: NectrAccount[], serviceUserId: string | null }` on
    success. `serviceUserId` is resolved from `getUsers` (pick a stable admin /
    owner; if none, null, and the UI notes it, since Phase 2 posting will need
    one).
- Best-effort: it returns the union rather than throwing to the caller, matching
  the Drive service contract.

### 4. "Test connection" UI on the client profile

- A button near the NECTR Location ID field runs `checkNectrConnectionAction` and
  renders the status:
  - `ok`: a green summary listing connected accounts by platform (Facebook,
    Instagram, LinkedIn, ...), each marked live or "expired, reconnect in NECTR"
    from `isExpired`, plus whether a service user was resolved.
  - `no-location` / `not-configured` / `error`: a clear, non-alarming message
    (mirrors the Drive skipped / failed toasts).
- Read-only: it calls only GET endpoints. No posting, no writes to NECTR, no
  writes to Relay state.

## What is out of scope for Phase 1

- Any post creation or scheduling (`createPost`, the `finishBatchAction` hook,
  per-post status, retry-to-schedule). That is Phase 2.
- Media handling and the Vercel Blob fetch-at-publish question. Phase 2.
- Backfilling `nectrLocationId` for existing clients (a data task; the 11 known
  Location IDs can be entered by hand, more as clients onboard).
- Any change to the existing CSV export / NECTR tab-open flow. It stays as the
  fallback until Phase 2 replaces it.

## Testing (TDD)

- **wrapper (`nectr-social.ts`):** `getAgencyToken` throws `NectrConfigError` when
  the env var is unset; `getAccounts` parses the Phase-0 account shape including
  `platform` + `isExpired`; `getUsers` parses users; a non-2xx response yields
  `NectrApiError` with the status; all via an injected `fetchImpl`, no network.
- **schema:** `clientUpdateSchema` accepts a `nectrLocationId` string and an empty
  string, rejects a non-string.
- **action (`checkNectrConnectionAction`):** enforces the org scope (a cross-org
  client returns not-found) and the permission gate; maps no-location,
  not-configured, error, and ok correctly; resolves `serviceUserId` from users or
  null.
- **field row:** the NECTR Location ID field renders and saves through
  `updateClientAction` (follows the existing field-row test pattern).
- Green gate: tsc + full unit suite + `next build` + eslint. One PR.

## Dependencies / risk

- **External precondition:** `NECTR_AGENCY_TOKEN` (agency-scoped, social + users
  read) set in Vercel by Caleb. Unconfirmed on the whitelabel; if impossible, swap
  the `getAgencyToken` function for a per-client encrypted PIT (Option B) with no
  other change to this design.
- **Additive migration only** (`Client.nectrLocationId`), nullable, no backfill, no
  pipeline redeploy (no `src/server/jobs` change).
- The health action is read-only against NECTR, so Phase 1 cannot affect any
  client's live social accounts.
- Small surface: one new lib file, one column, one action, one field row, one
  button.

## Open items

- Confirm the agency token (Caleb). Everything else is settled.
- Phase 2 will decide the media strategy (direct Blob URL vs pre-upload to NECTR
  media) and the account-targeting default (all connected accounts vs AM
  selection); noted here only to scope them OUT of Phase 1.
