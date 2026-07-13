# Relay App - Takeover and Handoff (for Caleb)

This is the one page you read first to take over Relay. It is a snapshot as of
2026-07-13. The living detail lives in the vault at
`projects/relay-app/active-notes.md` (newest on top) and in this repo's
`WORKLOG.md` on `main`. When something here goes stale, trust those two.

The full narrative version of this doc lives in the vault at
`projects/relay-app/relay-takeover.md`; this file mirrors it so it travels with
the code on GitHub.

---

## 1. What Relay is (in one breath)

Relay is our social media management app. It productizes the old Bekah AI /
ADMARK content pipeline (a Make.com scenario over Airtable) into a real web app.
Account managers onboard a client, generate a month of posts with AI, review
them, send them to the client for approval, handle revisions, then export to the
scheduler. Clients approve through a no login magic link. It is multi tenant: one
Clerk organization per agency.

## 2. Current state

- **Stage:** MVP live in beta.
- **Prod URL:** `relay-app-xi.vercel.app`.
- **Auth keys caveat:** production is still running on Clerk **development** keys.
  Two real limits (see section 10): every organization is capped at 5 members,
  and the whole instance is capped at 100 total users. The prod keys cutover is a
  prerequisite before real client rollout.
- **Tests:** 2567 unit tests passing on `main`.
- **Most recent ships (2026-07-13):** copy step onboarding gate for AMs and
  admins (PR #339) plus a follow up widening its client profile modal (PR #340).
  Before that, client review polish and a thread action tenant scope security fix
  (PR #338). Full history is in `WORKLOG.md`.

## 3. Where the live context lives

1. **`WORKLOG.md`** (this repo, on `main`) - the running task list plus shipped
   log. "Open / in progress" is the live to do list; "Shipped" is recent ships
   with commit SHAs. `git pull` this before you start.
2. **The vault** at `projects/relay-app/` - `active-notes.md` (running journal,
   newest on top; the top entry is the current pickup brief), plus dated design
   docs and the backlog. The `/relay-current` vault skill loads all of it plus
   live GitHub state in one shot.

## 4. The code repo

- **Repo:** `accountsFON/relay-app` (private).
- **Stack:** Next.js 16, Prisma 7, Clerk, Neon Postgres, Tailwind v4,
  Trigger.dev. UI primitives are `@base-ui/react` (not Radix, not shadcn); they
  compose with a `render` prop, not `asChild`.
- **Local clone path (convention):** `~/dev/relay-app`.
- **Do not clone the repo into the vault or any Google Drive folder.** Drive sync
  corrupts git internals.

## 5. Local setup

1. Clone `accountsFON/relay-app` to `~/dev/relay-app`.
2. Set your local `git config user.name` and `user.email` to your own GitHub
   identity.
3. Copy `.env.example` to `.env` and fill it from the shared 1Password vault
   ("Relay App"). Groups: Neon `DATABASE_URL`, Clerk, Trigger.dev, OpenAI,
   Anthropic, Firecrawl, Cloudflare R2, Vercel Blob, Stripe. See `.env.example`
   for the full annotated list.
4. `npm install`, then `npx prisma generate --schema=src/db/schema.prisma`.
5. `npm run dev`. `CONTRIBUTING.md` has the full developer workflow.

Secrets never get committed. `.env.example` shows what is needed; real values are
in 1Password.

## 6. Everyday development workflow

1. Branch off `main` (`feat/...` or `fix/...`).
2. Build with TDD: write the failing test, watch it fail, write minimal code,
   watch it pass.
3. Green gate before a PR: `npm run test:unit`, `npx tsc --noEmit`,
   `npx next build`, and `eslint` on changed files. The one known standing lint
   noise is a pre existing `Date.now` purity error on the batch page; ignore that
   one specifically.
4. Open a PR into `main`. CI runs "Typecheck & Test".
5. When CI is green, squash merge. That triggers the production deploy.

Bigger or risky changes also get an adversarial review pass before merge.
Outward facing or security surfaces always do.

## 7. Deployment

- **Two Vercel projects both post a "Vercel - relay-app" status.** The one under
  `accountsfons-projects` is **production** (reports slower). The one under
  `calebs-projects-05474266` fails as usual and is disregarded. Read deploy status
  by target URL, not by the check name.
- **Migrations apply automatically on deploy.** The build runs `prisma generate`,
  then `scripts/maybe-migrate-deploy.mjs` (applies pending migrations to the prod
  Neon branch), then `next build`.
- **The Trigger.dev pipeline** only redeploys when a `src/server/jobs/**` file
  changes (CI's `detect-pipeline-changes` gate). A warm Depot cache build finishes
  in minutes. **Do not deploy the pipeline while a content generation is running**
  - it holds that run in the queue for minutes to hours. Generation executes in
  about 70 seconds; "so slow" almost always means queue wait, not execution.

## 8. The content pipeline (workflow state machine)

The heart of the app is `src/server/lib/relay-state-machine.ts`. A relay (one
client's monthly batch) moves through these live steps:

`onboarding_gate -> copy -> in_design -> am_review_design -> client_review -> implementing_revisions -> scheduling -> completed`

Two tracks. With client review **on**, `am_review_design` hands to
`client_review`, which auto advances to `scheduling` (all approved) or
`implementing_revisions` (changes requested). With client review **off**,
`am_review_design` goes straight to `scheduling`. Steps also have send back edges.

Who holds what: the AM holds copy, design review, and scheduling; the designer
holds in design and revisions; the client holds client review via their magic
link. Each working step has a checklist (`src/lib/relay-checklists.ts`) that must
be ticked before Pass.

The `RelayStep` enum still carries several **retired** steps from earlier
reworks. Always derive the live set from `LIVE_PIPELINE_STEPS` /
`LEGAL_TRANSITIONS`, never from a hand kept list, or it drifts.

## 9. Key subsystems and concepts

- **Two auth models on the same action surface.** Clerk users (AMs, designers,
  admins) are scoped by organization. Magic link reviewers (external clients) are
  scoped by the batch their link is bound to. Any server action taking a caller
  supplied id must scope BOTH before doing work, and return a generic "Relay not
  found" on a mismatch (the #336 and #338 security fixes).
- **Permissions.** A per role matrix with per user overrides. A key existing in
  the matrix does not mean the code enforces it; grep the actual gate.
- **Onboarding gates.** Two gates mask the workspace until the holder reviews
  context once per relay: the designer gate (design steps) and the copy gate
  (copy step, AMs and admins). Each has its own per (batch, user) ack table.
- **Review and revisions.** The client review surface has three comment composers
  (new pin, pin reply, post level discussion); a change to how the client sends a
  comment must sweep all three. Resolved pins stay visible (greyed or struck).
- **Notifications.** In app bell plus email. The client facing magic link email
  is sent from three call sites (first send, resend, review re round); any per org
  email treatment must hit all three.

## 10. Known landmines

- **Clerk seat limits.** The 5 member cap is **per organization** (Clerk's
  default membership limit, raisable only on a paid plan). Separately the dev
  instance caps at **100 total users** across the app. On prod's current dev keys
  you hit both. Fix is the paid plan plus prod keys cutover - a Caleb purchase.
- **Prisma destructive commands are blocked under an AI agent** until
  `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` is set to the exact yes message.
- **Base UI, not Radix.** Dialogs and buttons use `@base-ui/react` with a
  `render` prop. The Dialog default width caps at `sm:max-w-sm` (384px), so to
  widen a modal pass a responsive `sm:max-w-*`, not a base `max-w-*`.
- **Activity event payloads omit `kind` in production.** Dispatch renderers on
  `event.kind`, not `event.payload.kind`.
- **Do not let a build or subagent run `git stash`.** The stash stack is shared
  across all worktrees of a clone.

## 11. Open follow ups

All non blocking, from `WORKLOG.md`:

- Bell "Post N" copy (add a per batch index map in `listMentionsForUser`).
- Set `NEXT_PUBLIC_APP_URL` in prod to the friendly domain.
- Harden the `LIVE_PIPELINE_STEPS` client import boundary.
- DB unique constraint on `DesignerFlag(postId, threadId, reviewItemId)`.
- Tidy stale JSDoc on `AdvanceFromClientReviewInput.reviewSessionId`.
- Two small test gaps (designer gate archived skip, designer tour guard branch).
- Consolidate `DesignerRevisionUpload` and `MediaUpload` onto `useReplacePostImage`.

**Blocked on input:** #10 (Caleb wording) and #11 (Caleb and Mollie notification
copy). The last two items on the workflow test punch list; everything else on it
is shipped.

## 12. Rollout plan

AM training for Rebecca and Christy across 2026-07-14 and 2026-07-15; full client
migration tentatively in September. Hard prerequisite: Caleb upgrades Clerk to a
paid tier and adds seats (section 10).

## 13. Access checklist for Caleb

Confirm access to: the `accountsFON/relay-app` GitHub repo, the 1Password "Relay
App" vault, the Clerk dashboard (and the paid plan plus prod keys decision), Neon
(prod and dev branches), the `accountsfons-projects` Vercel project, Trigger.dev,
Stripe, Cloudflare R2, and Vercel Blob.

## 14. First day take over checklist

1. Clone to `~/dev/relay-app`, fill `.env` from 1Password, `npm install`,
   `prisma generate`, `npm run dev`.
2. Read `WORKLOG.md` and the top few entries of the vault's `active-notes.md`.
3. Log into `relay-app-xi.vercel.app` and walk a relay through the whole pipeline
   once.
4. Make the Clerk paid plan plus prod keys decision before inviting real client
   teams.
5. Pick a small open follow up from section 11 to get your first PR through the
   green gate and the deploy.
