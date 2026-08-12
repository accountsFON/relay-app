# Design: allow multiple batches for the same client + month

Date: 2026-08-12
Author: Julio Aleman (with Claude)
Status: Draft, pending review
Scope: shallow (no DB migration), agreed with Julio 2026-08-12

## Problem

An AM sometimes needs to run a second batch for the same client and month (a
rerun) that is a genuinely separate relay, not a merge into the first. Today the
"Generate content" dialog, when a relay already exists for that client+month,
offers only **Cancel** or **Replace** (overwrite the existing batch's posts).
There is no way to start a *separate* new batch, so the rerun collapses into the
first batch.

The backend already supports a separate batch (`finalizePostGeneration`'s
`auto-new` choice), and the fire action already carries a `targetBatchId`. The
"new batch" path was simply dropped from the dialog UI. Re-exposing it, plus two
small tweaks, is the whole job.

## Goal

When a relay already exists for the client+month, the pop-up offers a clear
three-way choice: **Cancel · Replace existing · Start a new batch**. A new batch
is a fully separate relay with a distinct label, and its Drive graphics land in
their own folder (no clobber of the first batch's archive).

## Invariant: only the second-and-later batch of a month is affected

The first batch for any client+month is completely unchanged: no pop-up (the
probe finds no match, so generation fires straight through), the clean
`buildBatchLabel` label with no suffix, and the base "Month Year" Drive folder.
Every new behavior in this spec activates ONLY when an original populated batch
already exists for that client+month:

- The "Start a new batch" button appears only in the `confirm` view, which is
  reached only on a `needs_confirm` probe result (a populated match exists).
- The " (N)" label suffix is applied only when the auto-new scan finds an
  existing same-month batch (sequence >= 2); sequence 1 stays clean.
- The Drive folder suffix is applied only when the batch label carries a
  suffix, which only a second-or-later batch has.

## Decision: shallow, no first-class identity

We are NOT adding a `Batch.targetMonth` column or rewriting the label-parse
matching. The batch/month "identity" stays derived from the label. The one real
danger of same-month batches (the Drive folder clobber) is fixed directly.

Accepted limitation: a *third* generation for the same month still matches via
label-parse and picks the most-populated existing batch for its "a relay already
exists" pre-check. The pop-up handles it (the AM can choose "new batch" again).
Reruns are rare, so this fuzziness is acceptable; the deep first-class-identity
version can come later if reruns become common.

## Key facts confirmed in the codebase

- No DB uniqueness on `Batch(clientId, month)` or `ContentRun(clientId,
  targetMonth)`. Multiples are structurally allowed already.
- `finalizePostGeneration` (`src/server/services/finalize-post-generation.ts`)
  has three choices: `replace` (reuse a batch, delete its posts), `new` (custom
  label), `auto-new` (canonical `buildBatchLabel` month label). The dialog only
  drives `replace` and the no-match auto path.
- The dialog fire path (`generate-content-dialog.tsx` -> `probeThenFire` ->
  `generateContentAction({kind:'fire', targetBatchId})`) threads the chosen
  batch. `targetBatchId: null` means "auto path," not "force new."
- **Drift guard** (`src/server/actions/generate-content.ts` fire branch): when
  `targetBatchId === null` and a populated matching batch exists, it returns
  `drift` and re-prompts. So naively passing `null` from a "new batch" button
  would loop. A force-new intent must bypass this.
- Drive folder name today = `formatMonthYear(resolveBatchTargetMonth(batch))`
  (`drive-upload.ts`), i.e. bare "August 2026" for every August batch, so two
  August batches share one folder and the second overwrites the first's files.

## The changes (four focused edits, no migration)

### 1. Fire action: an explicit force-new intent (`generate-content.ts`)

Add `forceNewBatch?: boolean` to the `fire` input. When true:
- Skip the drift-on-existing check (the AM has explicitly chosen a new batch
  even though one exists, so a pre-existing populated batch is expected, not a
  race).
- Force `effectiveTargetBatchId = null` unconditionally (never reuse an empty
  match), so the ContentRun gets `targetBatchId = null` and finalize takes the
  `auto-new` branch.

Existing `replace` (non-null targetBatchId) and no-match (null, no force) paths
are unchanged, including their drift protection.

### 2. Dialog: three-way confirm (`generate-content-dialog.tsx`)

In the `confirm` view footer, render three buttons:
- **Cancel** -> back to picker (unchanged).
- **Replace** -> `probeThenFire(view.batchId)` (unchanged).
- **Start a new batch** -> `probeThenFire(null, { forceNew: true })`.

`probeThenFire` gains an options arg that passes `forceNewBatch` through to the
fire action. Copy update: the description already explains Replace overwrites;
add one line that "Start a new batch" keeps the existing relay and creates a
separate one.

### 3. Finalize: distinct auto-new label (`finalize-post-generation.ts`)

In the `auto-new` branch, before creating, scan the client's existing batches
whose label parses to the same `targetMonth`. Compute the next sequence:
- Treat a label with no numeric suffix as sequence 1.
- Treat "... (N)" as sequence N.
- New batch sequence = max(existing sequences) + 1.

If the new sequence is 1 (no same-month batch exists), keep the clean
`buildBatchLabel(name, month)` ("Puppy Avenue August 2026"). Otherwise append
" (N)" -> "Puppy Avenue August 2026 (2)". Using max+1 (not count+1) avoids
collisions when an earlier same-month batch was deleted.

### 4. Drive folder: include the label suffix (`drive-upload.ts`)

Derive the month-folder name as `formatMonthYear(month)` plus the trailing
" (N)" suffix parsed from `batch.label` when present:
- No suffix -> "August 2026" (unchanged, the common case).
- "... (2)" -> "August 2026 (2)".

So each same-month batch uploads into its own folder and never overwrites
another batch's graphics. `drive-upload` already loads `batch.label`, so no new
query.

## What is deliberately unchanged

- `findMatchingBatchForClientMonth` / `findMatchingBatchForRun` (the label-parse
  matching used by the pre-generation probe and in-flight enrichment). Leaving
  these as-is keeps the risky core matching untouched; the pop-up covers the
  ambiguity.
- No schema migration, no `Batch.targetMonth` column.
- `replace` and the no-match auto path behave exactly as before.

## Testing (TDD)

- **generate-content fire:** `forceNewBatch: true` returns a fired result (not
  `drift`) even when a populated matching batch exists, and the ContentRun is
  written with `targetBatchId = null`.
- **dialog:** the confirm view renders three buttons; "Start a new batch" calls
  the fire action with `forceNewBatch: true`; Replace and Cancel unchanged.
- **finalize auto-new label:** first same-month batch keeps the clean label; the
  second gets " (2)"; sequence uses max+1 (a deleted middle batch does not cause
  a collision).
- **drive-upload folder:** a label with " (2)" yields "Month Year (2)"; a plain
  label yields "Month Year"; multi-image naming unaffected.

## Dependencies / risk

- **No DB migration.** Four files, all inside the generation -> finalize ->
  drive path.
- The force-new intent is additive; it does not alter the existing replace or
  no-match branches or their drift guards.
- The matching functions are untouched, so the core "which relay exists"
  behavior for the common single-batch month is unchanged.
- Main thing to get right in implementation: the force-new intent must bypass
  the `null`-path drift guard, or the new button loops. Covered by a test above.

## Open items

None. Scope and behavior are settled. The only accepted limitation (fuzzy
matching on a third same-month run) is documented above and handled by the
pop-up.
