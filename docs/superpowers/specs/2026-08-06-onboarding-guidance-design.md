# Onboarding Guidance: Coverage + Always-On Tooltips — Design

- **Date:** 2026-08-06
- **Author:** Julio Aleman (with Claude)
- **Origin:** Rebecca's Sept 2026 QA test — surfaces felt under-explained; the client review link showed no tutorial. Julio's direction: first-visit tutorials on every meaningful view, plus always-on tooltips.
- **Status:** Approved design shape; spec for review before planning.

## Goal

Make Relay self-explanatory in two coordinated ways:

1. **Coverage** — every meaningful staff view greets a first-time visitor with a short, role-tailored walkthrough. Extend the tour system that already exists to the views that currently have none.
2. **Always-on tooltips** — a persistent hover-hint layer on controls that aren't self-evident, consultable any time (not just during the one-time tour).

## Non-goals

- The **client review-link surface** (magic-link `ReviewSessionShell` / `ReviewTutorialModal`) is out of scope here. It uses a separate one-off tutorial; unifying it is a later, separate effort.
- No new tour *engine*. We reuse the existing registry/provider/persistence.
- Not every control gets a tooltip (see Piece B reach).

## Background — what already exists

Relay already has a mature first-visit tour system for staff (`admin` / `account_manager` / `designer`; never `client`):

- **`src/components/onboarding/tour-registry.ts`** — `TourDef`s with `id` (versioned), `roles`, `matchPath`, `trigger: 'auto' | 'manual'`, optional `requiresAnchor`, and role-tailored `stopsForRole`. Auto tours fire on first matching-route visit.
- **`src/components/onboarding/tour-provider.tsx`** — mounted app-wide (`app-shell` / `app-chrome`), reads `role` + `User.seenTours`, auto-fires the first eligible unseen tour for the route, and exposes `start(tourId)` for manual replay.
- **`src/components/onboarding/tour-popover.tsx`** — anchored tooltip renderer for tour stops (a stop targets `data-tour-anchor="..."`; anchor-less "concept" stops render centered).
- **Persistence:** `User.seenTours` (string array of versioned tour ids), written by `src/server/services/onboardingTour.ts` (`markSeenTour`), deduped. Bumping a tour's version re-fires it for everyone.
- **Replay UI:** `tips-menu.tsx` + `tours-panel.tsx` (Settings) list tours with a `homePath` and call `start()`.
- **A tooltip UI primitive already exists:** `src/components/ui/tooltip.tsx` (base-ui `@base-ui/react/tooltip`; Provider/Root/Trigger/Content).

**Current tour coverage:** `/dashboard` (overview, AM+designer variants), `/inbox`, `/clients`, client detail (`/clients/:id`), relay/batch detail (`/clients/:id/batches/:id`, AM + designer variants), scheduling step (anchor-gated on the same route).

**Coverage gaps (no tour today):** the internal **preview/review surface** (`/clients/:id/batches/:id/preview` → `InternalReviewShell`), the **client profile view** (`client-profile-view.tsx`, shown on the client page and in the onboarding-gate modal), plus settings, search, admin, platform, library, archive, trash.

Why it *feels* missing to Julio: his own account has the existing tours marked seen (so they don't re-fire), and the highest-traffic review surface (`/preview`) genuinely has none.

## Approach (chosen)

**Extend the existing systems; keep tours and tooltips as two coordinated layers.** Tutorials reuse the tour registry/provider/`seenTours`. Tooltips use a thin convention over the existing `ui/tooltip` primitive. Where a tooltip and a tour stop describe the same control, they share the same one-sentence copy so the two never drift.

Rejected alternatives:
- *Unified guidance registry* (one data source drives both tours and tooltips): tempting for author-once, but tours need ordered, anchor-less "concept" steps and tooltips are per-control and unordered — one model makes both worse. Over-abstraction.
- *Minimal one-offs* (hand-patch worst gaps, no reusable layer): fastest now, drifts out of consistency, we'd be back.

## Piece A — First-visit tutorials on uncovered views

Author a `TourDef` per uncovered view and add `data-tour-anchor` attributes to its real controls, then register it. The existing provider handles auto-fire, role tailoring, and `seenTours` persistence for free.

Priority order (ship highest-value first):

1. **`/preview` — internal review surface** (`preview-review-v1`). The primary gap; where the AM/designer actually review. Role-tailored:
   - **AM/admin** stops: the review rail (thread/feedback list), a post preview, "drop a pin on the image or select caption text to comment," resolve / use-as-post-image on a pin, hand-off/advance.
   - **Designer** stops: the review rail, a post preview, upload/replace a design (revision upload), hand back.
   - Dynamic route → no `homePath` (auto-fire-on-first-visit only, like `batch-detail-v1`); `matchPath` = the `/preview` route regex. Roles: `admin`, `account_manager`, `designer` (variant copy per role).
2. **Client profile view** (`client-profile-v1`). Stops orient the reader on the profile sections (brand/context, what generation uses it for). Because the profile renders both inline on the client page and inside the onboarding-gate modal, anchor to elements inside `client-profile-view.tsx` itself so the coachmark works in both mounts; gate its auto-fire on the profile anchor being present (`requiresAnchor`) so it only fires where the profile is actually shown.
3. **Relay/batch detail** — already covered by `batch-detail-v1` / `designer-batch-detail-v1`. Audit the copy/anchors; bump the version only if we materially change stops. (Likely no change; Julio just hadn't seen it.)
4. **Later (not this plan):** settings, search, admin, platform, library.

Each new tour gets a unit test in the registry's existing test style (role eligibility, route match, not-seen gating).

## Piece B — Always-on tooltip layer

A persistent hover/focus hint on controls that aren't self-evident, built on `ui/tooltip`.

- **Reach (assumed default, confirm):** icon-only or non-obvious controls — icon buttons with no visible text label, status chips/badges, pins, and ambiguous actions. NOT every interactive control (noisy, heavy). Rule of thumb: if a control has no visible text label or its purpose isn't obvious from its face, it gets a hint.
- **Mechanism:** a small wrapper/convention (e.g. an `IconHint`/`Hint` wrapper, or a lint-encouraged pattern) over `Tooltip` so usage is one consistent call. Mount the base-ui `Tooltip.Provider` once high in the app tree if not already present.
- **Accessibility / mobile:** hints must open on keyboard focus and on touch tap (not hover-only), so they're reachable without a mouse. Content is short (a phrase, not a sentence-plus).
- **Shared copy:** where a tooltip describes the same control a tour stop covers, both pull from one shared string so they can't drift.
- **Rollout:** instrument the highest-traffic surfaces first (`/preview` review controls, relay page, client page), then fan out. Track which surfaces are done so coverage isn't silently partial.

## Data / persistence

- Tutorials: no schema change — reuse `User.seenTours` (add new versioned ids). Client-profile `requiresAnchor` gating is provider-side (already supported).
- Tooltips: no persistence (always available, stateless).

## Testing

- **Piece A:** registry unit tests per new tour (role/route/seen gating), mirroring existing `tour-registry` tests; a light render test that the target views expose the expected `data-tour-anchor`s.
- **Piece B:** a wrapper unit test (renders trigger, shows content on focus/hover, correct aria); spot render tests that key icon controls carry a hint.
- Full green gate per PR: `tsc` + unit suite + `next build` + eslint on changed files.

## Sequencing / rollout

Two independent implementation plans → two PRs (same cadence as the recent ships):

1. **Plan A — Piece A**, starting with `/preview` (`preview-review-v1`), then client profile. Closes Rebecca's gap on proven infra; low risk.
2. **Plan B — Piece B**, the tooltip wrapper + instrument the high-traffic surfaces.

Each PR: TDD, green gate, WORKLOG entry, deploy-verify.

## Open decision (explicit, not blocking)

- **Tooltip reach** is set to *icon-only / ambiguous controls* as the default. If Julio wants it wider (every control) or narrower (a curated per-view shortlist), Piece B's wrapper is unchanged — only the instrumentation list grows or shrinks.
