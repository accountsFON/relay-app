# Tooltip Clarity Coverage Across the Relay Process — Design

- **Date:** 2026-08-06
- **Author:** Julio Aleman (with Claude)
- **Origin:** Julio liked the review "resolve" tooltip shipped in #389 and asked to add hover hints throughout the whole process so each surface explains itself. This extends Piece B of the onboarding-guidance work ([2026-08-06-onboarding-guidance-design.md](2026-08-06-onboarding-guidance-design.md)) from a single control to full-journey coverage.
- **Status:** Approved design shape; spec for review before planning.

## Goal

Make every action control in the Relay process self-explanatory on hover, without adding noise. A user (staff or client) should be able to hover any control whose purpose or consequence is not obvious and get one short sentence telling them what it does. Reuse the tooltip layer that already exists; the only new work is copy and wrapping.

## Non-goals

- No new tooltip primitive or help engine. We ride on the existing `SimpleTooltip` / `StepTooltip` / `RoleTooltip`.
- No always-on "?" help mode, no in-app help center, no route-tour changes (that is the tour half of the onboarding-guidance spec, tracked separately).
- Not every control gets a tooltip. Self-evident controls stay bare (see Coverage rule).
- No re-copy of the existing step-pill and role-chip tooltips; they are already good and consistent.

## Background — what already exists

- **`src/components/relay/relay-tooltips.tsx`** exposes the wrappers:
  - `SimpleTooltip({ children, content, side?, disabled? })` wraps any single focusable element via base-ui's `render` prop (no extra wrapper node). Renders nothing extra when `content` is empty or `disabled`.
  - `StepTooltip({ step })` and `RoleTooltip({ role })` are semantic wrappers keyed on centralized copy (`RELAY_STEP_DESCRIPTIONS`, `RELAY_ROLE_DESCRIPTIONS`).
- **`src/components/ui/tooltip.tsx`** is the base-ui primitive underneath (Provider / Root / Trigger / Content).
- **Copy rules (the file's "Wave 4K" convention):** no em or en dashes anywhere; no compound hyphens in body copy; keep each line under 80 characters.
- **Current tooltip coverage:** step pills, kanban tile step labels, relay track nodes, role chips, post cards, checklists, archive and delete controls, and (as of #389) the review "resolve" checkbox. Every other action control across the review, preview, client, onboarding, scheduling, and admin surfaces is bare.

An audit of `src/components/review/*` and `src/components/preview/*` on `main` confirms `resolve-checkbox.tsx` is the only control in either directory that uses a tooltip today.

## Coverage rule (the signal-vs-noise heuristic)

A control gets a tooltip when EITHER:

1. It is **icon-only** (no visible text label), OR
2. Its visible label hides a **non-obvious consequence**: destructive, bulk, irreversible, state-changing, or Relay jargon (resolve, hand off, send back, force step, pass, take over).

A control stays bare when its label already says everything (Save, Cancel, Close, Next, Back). When in doubt, add the tooltip; a hover hint is cheap and a confused user is not.

Worked examples:

| Control | Tooltip? | Why |
|---------|----------|-----|
| Icon-only pin / attach / image-replace button | Yes | Icon-only |
| "Approve all" | Yes | Bulk, hard to reverse |
| "Send back" / "Hand off" | Yes | Jargon + state change |
| "Force step" | Yes | Destructive to normal flow |
| "Mark addressed" / "Resolve" | Yes | Jargon, changed a QA user's mind wrongly |
| "Save" / "Cancel" / "Close" | No | Self-evident |

## Approach (chosen)

**Centralize copy per surface, wrap controls in `SimpleTooltip`, roll out one surface per phase.**

Each surface gets a small copy map object (the same shape as `RELAY_STEP_DESCRIPTIONS`): a record keyed by control id whose values are the one-sentence hints. Components import the map and wrap the qualifying controls. This keeps copy out of JSX, consistent, reviewable in one place, and unit-testable against the Wave 4K rules.

Rejected alternatives:

- *Inline strings at each call site.* Fastest to type, but copy drifts, cannot be reviewed as a set, and cannot be lint-tested. The codebase already centralizes step and role copy; match that.
- *One giant global copy map for the whole app.* Author-once appeal, but a single 100-entry object becomes a merge-conflict magnet across parallel surface work and loses the per-surface locality that makes review easy. Per-surface maps compose better.

## Accessibility guard

Hover tooltips are invisible to screen readers and to touch users, so a tooltip is never a control's only name. Rule: any icon-only button we wrap must also carry an `aria-label` with the same intent as the tooltip copy. Where a wrapped icon button lacks a label, the same change adds the `aria-label`. `SimpleTooltip` uses the base-ui render prop over an already-focusable child, so keyboard focus continues to open the hint with no extra tab stop.

## Phased rollout

Surfaces are independent; each phase is its own PR, TDD, green-gated (tsc + unit + `next build` + eslint), deploy-verified, WORKLOG updated. Ordered so shared controls land first and benefit every consumer downstream.

1. **Shared preview controls** (`src/components/preview/*`): platform toggle, pin and comment buttons, image replace, mark-batch-reviewed, approval badge, comment image attach. These render inside both the staff and client review surfaces, so covering them once benefits both.
2. **Staff review / preview** (`internal-review-shell`, `internal-review-rail`, `decision-button-row`, `approve-all-button`, `mark-addressed-button`, `mark-revisions-done-button`, `designer-flag-toggle`, `designer-revision-upload`, `changes-navigator`). Extends #389 across its siblings.
3. **Client review, magic-link** (`review-session-*`, `request-changes-button`, `submit-review-bar`, `start-next-round-button`, `review-item-row`, `review-sticky-bar`). Least app-savvy users, highest payoff.
4. **Client page / client view / client detail** (`client-profile-view.tsx` and the client-detail action controls).
5. **Onboarding gates** (copy step, designer step, client-profile modal, checklists): fill the gaps not already covered by post-card and checklist tooltips.
6. **Scheduling / export + admin / permissions editors** (scheduling-export consolidation surface; `role-defaults-editor`, `permission-editor`, user management actions).

Each phase enumerates its exact qualifying controls during planning, not here. The plan for phase N is where the control list becomes concrete.

## Testing approach

Repo norm: base-ui tooltips portal out and are unreliable to assert in jsdom, so we do NOT write tooltip-appearance tests. Instead, per phase:

1. **Regression:** the wrapped control's existing component test stays green. This proves the render-prop wrap did not break the control (the seam that mattered in #389).
2. **Copy contract:** a unit test over that phase's copy map asserts every enumerated control key has non-empty copy that passes the Wave 4K rules (no em or en dash, no ` - ` dash surrogate, each line under 80 characters). This gives the copy an enforced seam and catches an empty or malformed hint before it ships.

## Success criteria

- On every surface in the rollout, hovering any icon-only or non-obvious control shows a one-sentence hint.
- No hint on a self-evident control (no tooltip fatigue).
- Every wrapped icon-only button has an `aria-label`.
- Copy lives in per-surface maps, all passing the copy-contract test.
- Each phase merged green and deploy-verified, WORKLOG kept current.
