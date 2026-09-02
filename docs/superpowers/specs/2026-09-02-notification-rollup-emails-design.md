# Email notifications alongside every in-app notification

Date: 2026-09-02
Author: Julio Aleman (with Claude)
Status: approved, ready for an implementation plan

## Problem

Relay notifies account managers and designers in app only. Every notification is
a `Mention` row surfaced through the bell and the inbox. Someone who is not
looking at Relay learns nothing until they next sign in, which is the ordinary
case for a designer who works in Canva all day or an account manager who has
closed the tab.

Requested by Julio on 2026-09-01: any notification the app sends to an account
manager or designer should be accompanied by an email.

Two internal emails already exist and already cover their own moments well
(`RelayHandoffEmail` on a baton pass or send back, `ReviewSubmittedDigestEmail`
when a client submits a review). This work fills the rest of the surface.

## Key findings from the code

1. **`recordActivity()` in `src/server/services/activity.ts` is the single
   choke point.** Every emit site across the app routes through it (roughly 45
   call sites in `src/server`, `src/app` and the jobs), and it is the only
   place `Mention` rows are created. Anything that lights up the bell passes
   here.
2. **`renderSummary()` and `resolveHref()` in `src/lib/notification-copy.ts`
   are pure functions** that already produce the exact bell copy and deep link
   from a `MentionInboxRow`. The email can reuse them verbatim, so the two
   surfaces cannot drift.
3. **`Mention` already stores read state** (`readAt`, plus an
   `@@index([mentionedUserId, readAt])`). Combined with the decision to skip
   already read items, the `Mention` table itself is the queue. No new table is
   required, and no write path hook is required to populate one.
4. **`recordActivity` is sometimes called with a Prisma transaction** (the `tx`
   parameter). Any design that sends email from inside that call risks a sent
   email for a write that later rolls back.
5. **The notification bell polls `/api/notifications/summary` every 20 seconds**
   for every signed in user (`POLL_MS = 20_000` in
   `src/components/notifications/notification-provider.tsx`). That is an
   existing, free metronome.
6. **Trigger.dev supports durable delayed runs** (`delay: "5m"`), held on their
   servers, surviving our redeploys and restarts.
7. **`@vercel/functions` / `waitUntil` is not a dependency of this repo.**
   Background work must be awaited, matching the note already recorded in
   `notifyHolderOfBatonHandoff`.
8. **Advisory lock precedent exists** at
   `src/server/actions/designerFlags.ts:95`
   (`pg_advisory_xact_lock(hashtext(...))`).

## Decisions (approved by Julio, 2026-09-01 and 2026-09-02)

### Rollup, not one email per notification

A five minute window collects a person's notifications into one email. Bell
events are chatty (every thread reply, pin, resolve, step advance), and a
designer in a live review round can accumulate twenty in an afternoon. One
email per bell would train people to filter Relay into a folder, which defeats
the feature.

### Already read items are skipped, and an all read pile sends nothing

The email exists to reach someone who is away from the app. If they read it in
the bell, emailing it is noise. This makes the system quiet by construction:
somebody working inside Relay receives close to zero email, somebody away
receives everything. `Mention.readAt` already carries this for free.

### The two existing bespoke emails win their events

`batch_passed`, `batch_sent_back` and `review_session_submitted` are excluded
from the rollup. Those templates carry detail the rollup cannot (the per item
approved / changes / edits breakdown, and a reply-to pointing at the actual
person who acted). The bell still fires for them exactly as it does today.

### Recipients are every internal role, never clients

`admin`, `account_manager` and `designer` all receive rollups. `client` role
users never do; they are reached through the magic link review invite. This
matches the rule `notifyHolderOfBatonHandoff` already applies.

### No opt out toggle in this scope

Read suppression already delivers most of what a toggle would be for. If
someone asks for one later, it is a nullable `User` column plus a Settings
switch, and nothing in this design has to change to accept it.

### No cron

Julio's call: a repeating alarm is a single mechanism that can stop. Replaced
by two independent tappers (below). The durable part of this design is the
queue in the database, so the tappers are only nudges, and a missed nudge costs
lateness rather than a lost email.

## Design

### Schema

One additive nullable column, one migration, no backfill:

```prisma
model Mention {
  ...
  emailedAt DateTime?
}
```

`readAt` and `emailedAt` both being null is the definition of "owed an email".

An index supporting the due probe is added in the same migration. The probe
filters on `emailedAt` and `readAt` with a `createdAt` range, so the practical
shape is `@@index([emailedAt, readAt, createdAt])`.

### One due rule, defined once

Both tappers call the same function so they can never disagree. A mention is
due when all of these hold:

| Condition | Reason |
|---|---|
| `readAt IS NULL` | they have not seen it in the bell |
| `emailedAt IS NULL` | we have not mailed it |
| `createdAt <= now - 5 min` | the rollup window; this is the debounce |
| `createdAt >= now - 24 h` | see "the 24 hour floor" below |
| recipient `role != 'client'` | clients are reached by magic link |
| recipient `deactivatedAt IS NULL` and has an email | no dead addresses |
| `event.kind` not in the excluded set | the bespoke emails own those |

Excluded set: `batch_passed`, `batch_sent_back`, `review_session_submitted`.

#### The 24 hour floor

Without an upper age bound the first deploy would sweep every unread mention in
the app's history and send everyone a wall of email about events from June. The
floor makes the first run behave like any ordinary run.

It also serves a second purpose: a permanently undeliverable address stays
unstamped and would otherwise be retried on every tap forever. After a day the
mention ages out of the window on its own. **The floor is the give up rule, and
that must be commented in the code so it is not "fixed" later.**

### Tapper one: the heartbeat

`src/app/api/notifications/summary/route.ts` runs the sweep after its existing
summary work.

- **A cheap indexed probe runs first.** Almost every call finds nothing due and
  returns in about a millisecond, which is what a route hit every 20 seconds by
  every signed in user requires.
- **If something is due, claim before sending** (see "concurrency" below).
  This is what stops fifty simultaneous polls from sending fifty copies.
- **Bounded per call.** A single poll handles at most five recipients, so a
  backlog can never slow the bell down. The timer tapper drains the rest with
  a much higher cap.
- **The sweep is global, not scoped to the caller.** This is the point of the
  mechanism: the person who caused a notification is almost always still signed
  in, because they just did the thing, so their browser is what gets their
  teammate the email. Scoping it to the caller would break that entirely.
- Wrapped in try/catch. It can never change the response the bell receives, and
  it can never turn a working bell into a 500.
- Awaited rather than fired and forgotten, because an unawaited promise can be
  killed when a serverless function returns.

### Tapper two: the timer

`recordActivity()` schedules a Trigger.dev run with `delay: "5m"` for
non-transactional callers when it has created at least one mention. This
section describes what shipped, which reverses an earlier version of this
design; read the note below before touching any of the eight transactional
call sites it references.

- **Idempotency key bucketed to the current five minute window**, so a burst of
  twenty mentions creates one delayed run rather than twenty.
- **The run carries no payload.** It is a bare "go look at the pile" nudge, and
  it calls the same sweep the heartbeat calls.
- **`recordActivity` schedules directly only when no `tx` was passed.** An
  earlier version of this design called scheduling "harmless" even inside a
  caller's transaction, on the reasoning that a bare-payload run scheduled
  inside a transaction that later rolls back just wakes up, finds nothing due,
  and stops. That reasoning is true for the ROLLED BACK case but misses the
  COMMITTED case: `tasks.trigger()` is a network call to Trigger.dev, and
  awaiting it from inside an interactive Prisma transaction holds that
  transaction open across the round trip. If Trigger.dev is slow, the
  transaction can blow past Prisma's timeout and roll back the CALLER'S state
  change, not this scheduling call, from outside `recordActivity`'s own
  try/catch. That is the bug the earlier design would have shipped.
- **The eight transactional call sites schedule themselves, post commit.**
  Six in `src/server/services/relay.ts` and two in
  `src/server/actions/relay-admin.ts` call the exported
  `scheduleNotificationEmailTimer` (from `@/server/services/activity`) after
  their own `db.$transaction(...)` resolves, the same pattern
  `notifyHolderOfBatonHandoff` already used for the baton handoff email. Do
  not "simplify" this back to scheduling inside `recordActivity` regardless of
  `tx`; that reintroduces the held-open-transaction bug above.
- **The timer re-arms itself when its own window has a tail.** The
  idempotency key above books a run for the FIRST mention that opens a five
  minute bucket, firing five minutes after that mention. A mention created
  later in the same bucket is still younger than five minutes when that run
  fires, so it is not due yet and gets no run of its own, unless something
  re-arms one. `src/server/jobs/notificationEmailTimer.ts` checks
  `anyMentionPendingSoon` after every sweep and, if a too-young mention is
  still waiting, books another run five minutes out for the next bucket,
  using the same `notif-email-${bucket}` key format so an ordinary schedule
  landing in that same next window collapses into the one re-armed run
  instead of firing twice. This is what makes "the timer sends everything"
  in the table below actually true; without it, a straggler mention could
  wait for the next unrelated activity or someone's bell poll, which is a
  real gap overnight.

### Why two tappers

They fail for different reasons. The heartbeat needs a human signed in. The
timer needs Trigger.dev to be healthy. Either one alone sends the whole pile
correctly, because both read the same list and stamp what they send.

| Situation | Outcome |
|---|---|
| Both fire together | Only one can claim a row, so the other no-ops |
| Heartbeat fails | The timer sends everything, including stragglers, via its self re-arm |
| Timer fails | The next signed in user's poll sends everything |
| Both fail | Nothing is lost; it goes out on the next tap |
| Read in the bell first | Drops out of the query, never mailed |

**Known gap, accepted.** Overnight and at weekends nobody is signed in, so the
timer is working alone. A Trigger.dev outage starting Friday evening would hold
those emails until the first sign in on Monday. Bell notifications are
unaffected and all still present. If this ever matters, an hourly alarm is a
small follow up that finds an empty pile essentially every time it runs, and
this design accepts one without modification.

### The email

**Copy comes from the existing pure functions.** `renderSummary()` produces
each line and `resolveHref()` produces each link, so email copy and bell copy
are generated by the same code. Any future event kind gets email copy the
moment it gets bell copy.

Those take a `MentionInboxRow`, so this adds one sibling query beside
`listMentionsForUser` in `src/server/repositories/activityEvents.ts` returning
the same shape for the due set rather than for a single viewer.

`resolveHref()` returns a relative path. The sweep prefixes it with
`NEXT_PUBLIC_APP_URL ?? 'https://relay-app-xi.vercel.app'`, matching every
other email in the repo.

**Layout.** One email per person, items grouped by client:

```
Elevated Tree Solutions
  Mollie replied on Post 3                        [Open]
  Mollie resolved the thread on Post 3            [Open]

Dixie Lily Foods
  Caleb passed you the baton. Now at Scheduling.  [Open]
```

**Subjects**, keeping the `[Relay] ` prefix `sendRelayHandoffEmail` uses:

| Shape | Subject |
|---|---|
| one item | `[Relay] Elevated Tree Solutions: Mollie replied on Post 3` |
| several, one client | `[Relay] 3 updates on Elevated Tree Solutions` |
| several, several clients | `[Relay] 5 updates across 3 clients` |

**No reply-to.** A rollup can contain several different actors, so there is no
honest single address to reply to. Replies land on the unmonitored `noreply@`
From. `List-Unsubscribe` comes free from the shared `sendEmail` wrapper.

**Two new files**, mirroring the existing pair:
`src/server/emails/NotificationRollupEmail.tsx` (React Email component) and
`src/server/services/sendNotificationRollupEmail.ts` (throws on Resend failure,
caller swallows).

### Error handling

- **Per recipient try/catch.** One bad address cannot stop the other nine
  people receiving theirs.
- **Log every failure** with recipient, item count and reason. Per the Drive
  upload incident on 2026-08-31, a silent partial failure leaves nothing to
  diagnose from.

### Concurrency: claim, then send, and release on failure

Revised during planning on 2026-09-02, replacing an earlier "advisory lock,
stamp after sending" sketch. **Stamping `emailedAt` IS the claim:**

1. `UPDATE mentions SET emailedAt = now() WHERE id IN (...) AND emailedAt IS
   NULL`, then read back which rows now carry this stamp. Only one caller can
   win a row.
2. Send the email for the rows this caller won.
3. If the send fails, set `emailedAt` back to null so a later tap retries.

Why this replaced the lock. An advisory lock in Postgres is either transaction
scoped, which would mean holding a transaction open across every Resend call in
the sweep, or session scoped, which is unsafe behind a pooled connection
because the unlock can land on a different connection and strand the lock. A
conditional update has neither problem, needs no lock, and is atomic by
definition.

The trade, stated plainly: a hard process death between the claim and the send
drops that one email, where the earlier sketch would have retried it. Accepted,
because the bell notification is untouched and still shows the item, and
because the alternative risks stranding a lock that would stop **all** sending.
Ordinary send failures still retry, since they release the claim.

## Testing

Pure logic, tested directly:

- the due rule, one case per condition in the table above
- grouping by recipient, then by client within a recipient
- the three subject shapes

Behavioural, against a mocked db and a mocked `sendEmail`:

- a read mention is excluded, and an all read pile sends no email at all
- an already stamped mention is never re-sent
- each of the three excluded kinds is excluded
- client role users are excluded
- deactivated users and users with no email are excluded
- a mention younger than five minutes is not sent yet
- a mention older than 24 hours is not sent
- one recipient's send failing still sends the others
- the claim happens before the send, in that order
- a failed send releases its claim so a later tap retries
- a recipient whose mentions were claimed by another sweep is skipped
- the route tap never throws and never alters the summary response
- a timer waking to an empty pile is a clean no-op

Gate, per repo norms: `tsc` 0, full unit suite, `next build`, eslint clean.

## Rollout note

The delayed task must live under `src/server/jobs/`, so shipping this triggers
a Trigger.dev pipeline deploy. Per `active-notes.md`, a pipeline deploy can hold
an active content generation run for minutes to hours. **Deploy this when no
generation is running.**

## Out of scope

- Any per user or per organization opt out control
- Changing which events create notifications, or their bell copy
- Retiring or altering `RelayHandoffEmail` or `ReviewSubmittedDigestEmail`
- Emailing client role users about anything
- A backstop cron; explicitly declined, and accepted as a possible follow up
