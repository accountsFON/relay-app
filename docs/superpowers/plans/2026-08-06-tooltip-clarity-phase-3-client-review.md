# Tooltip Clarity Coverage — Phase 3 (Client Review) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add hover-hint tooltips to the client-facing magic-link review controls: bulk approve, submit review, and the two per-post verdict pills.

**Architecture:** New `src/lib/client-review-tooltip-copy.ts` map (same pattern as Phases 1-2), guarded by a copy-contract test. Wrap each qualifying control in `SimpleTooltip`. The verdict pills live in the shared `DecisionButtonRow` (rendered by `ReviewPostCard` in review mode), so covering them helps both client and staff surfaces.

**Tech Stack:** Next.js 16, React, base-ui tooltip, Vitest.

## Global Constraints

- Copy rules (Wave 4K): no em/en dashes, no compound hyphens in body copy, each string under 80 chars.
- Primitive: `SimpleTooltip` from `@/components/relay/relay-tooltips`.
- Coverage rule: icon-only OR non-obvious only. `submit-review` and the `Changes` pill qualify (finalize / ambiguous label); `Approve` is included for verdict-row symmetry and to state the consequence.

---

### Task 1: Client-review copy map + contract test

**Files:**
- Create: `src/lib/client-review-tooltip-copy.ts`
- Test: `tests/lib/client-review-tooltip-copy.test.ts`

**Interfaces:**
- Produces: `CLIENT_REVIEW_TOOLTIP_COPY` with keys `approveAll`, `submitReview`, `decisionApprove`, `decisionChanges`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/client-review-tooltip-copy.test.ts
import { describe, it, expect } from 'vitest'
import { CLIENT_REVIEW_TOOLTIP_COPY } from '@/lib/client-review-tooltip-copy'

const REQUIRED_KEYS = ['approveAll', 'submitReview', 'decisionApprove', 'decisionChanges'] as const

describe('CLIENT_REVIEW_TOOLTIP_COPY', () => {
  it('has non-empty copy for every required control', () => {
    for (const key of REQUIRED_KEYS) {
      expect(CLIENT_REVIEW_TOOLTIP_COPY[key], `missing copy for ${key}`).toBeTruthy()
    }
  })
  it('obeys the Wave 4K copy rules', () => {
    for (const [key, value] of Object.entries(CLIENT_REVIEW_TOOLTIP_COPY)) {
      expect(value.length, `${key} must be under 80 chars`).toBeLessThan(80)
      expect(value, `${key} must not contain a dash`).not.toMatch(/[—–]| - /)
    }
  })
})
```

- [ ] **Step 2:** `npx vitest run client-review-tooltip-copy` — FAIL (module missing).

- [ ] **Step 3: Implementation**

```ts
// src/lib/client-review-tooltip-copy.ts
/**
 * Hover-hint copy for the client magic-link review controls. One short
 * sentence per control, keyed by a stable control id.
 *
 * Voice-owned. Obey the Wave 4K copy rules when editing:
 *  - No em or en dashes.
 *  - No compound hyphens in body copy.
 *  - Keep each value under 80 characters.
 */
export const CLIENT_REVIEW_TOOLTIP_COPY = {
  approveAll: 'Approve every post in this batch at once',
  submitReview: 'Send all your decisions back to the agency to finish',
  decisionApprove: 'Mark this post approved and ready to publish',
  decisionChanges: 'Ask for changes on this post before it goes live',
} as const

export type ClientReviewTooltipKey = keyof typeof CLIENT_REVIEW_TOOLTIP_COPY
```

- [ ] **Step 4:** `npx vitest run client-review-tooltip-copy` — PASS.
- [ ] **Step 5:** Commit `feat(review): client-review tooltip copy map + copy-contract test`.

---

### Task 2: Tooltip on Approve all

**Files:** Modify `src/components/review/approve-all-button.tsx` (the `<Button>`, lines 24-34). Test: existing `approve-all-button.test.tsx` stays green.

- [ ] **Step 1: Add imports**

```tsx
import { SimpleTooltip } from '@/components/relay/relay-tooltips'
import { CLIENT_REVIEW_TOOLTIP_COPY } from '@/lib/client-review-tooltip-copy'
```

- [ ] **Step 2: Wrap the returned `<Button>`** in `SimpleTooltip content={CLIENT_REVIEW_TOOLTIP_COPY.approveAll}` (the early `if (totalPosts <= 1) return null` stays above, unchanged).
- [ ] **Step 3:** `npx vitest run approve-all-button` — PASS.
- [ ] **Step 4:** Commit `feat(review): hover hint on the approve-all button`.

---

### Task 3: Tooltip on Submit Review

**Files:** Modify `src/components/review/submit-review-bar.tsx` (the `<button data-testid="submit-review-bar-button">`, lines 52-63). Test: existing `submit-review-bar.test.tsx` stays green.

- [ ] **Step 1: Add imports**

```tsx
import { SimpleTooltip } from '@/components/relay/relay-tooltips'
import { CLIENT_REVIEW_TOOLTIP_COPY } from '@/lib/client-review-tooltip-copy'
```

- [ ] **Step 2: Wrap the submit `<button>`** in `SimpleTooltip content={CLIENT_REVIEW_TOOLTIP_COPY.submitReview}`, keeping all props.
- [ ] **Step 3:** `npx vitest run submit-review-bar` — PASS.
- [ ] **Step 4:** Commit `feat(review): hover hint on the submit-review button`.

---

### Task 4: Tooltips on the verdict pills (Approve / Changes)

**Files:** Modify `src/components/review/decision-button-row.tsx` (the mapped `<button>`, lines 84-106). Test: existing `decision-button-row.test.tsx` stays green.

- [ ] **Step 1: Add imports**

```tsx
import { SimpleTooltip } from '@/components/relay/relay-tooltips'
import { CLIENT_REVIEW_TOOLTIP_COPY } from '@/lib/client-review-tooltip-copy'
```

- [ ] **Step 2: Wrap each pill.** Replace the mapped `return (<button key={cfg.decision} ...>...</button>)` so the `key` moves to the `SimpleTooltip` and the button is its single child:

```tsx
        return (
          <SimpleTooltip
            key={cfg.decision}
            content={
              cfg.decision === 'approved'
                ? CLIENT_REVIEW_TOOLTIP_COPY.decisionApprove
                : CLIENT_REVIEW_TOOLTIP_COPY.decisionChanges
            }
          >
            <button
              type="button"
              aria-label={cfg.ariaLabel}
              aria-pressed={isActive}
              data-decision={cfg.decision}
              data-active={isActive ? 'true' : 'false'}
              data-testid={`decision-button-${cfg.decision}`}
              onClick={() => onChange(cfg.decision)}
              disabled={disabled}
              className={cn(
                'inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                'min-h-[44px] min-w-[44px]',
                isActive ? cfg.filledClass : cfg.outlineClass,
              )}
            >
              <Icon aria-hidden className="h-4 w-4" />
              <span>{cfg.label}</span>
            </button>
          </SimpleTooltip>
        )
```

- [ ] **Step 3:** `npx vitest run decision-button-row` — PASS (testids/aria unchanged; the key moved to the wrapper).
- [ ] **Step 4:** Commit `feat(review): hover hints on the Approve and Changes verdict pills`.

---

### Task 5: Green gate + WORKLOG + PR

- [ ] `npx tsc --noEmit` (clean)
- [ ] `npm run test:unit` (all pass)
- [ ] `npm run build` (succeeds)
- [ ] `npx eslint` the 4 changed source files + 1 new test (clean)
- [ ] WORKLOG `## Shipped` entry (top), commit
- [ ] `git push -u origin feat/tooltip-clarity-phase-3-client-review` + `gh pr create --base main`

---

## Self-Review

**Spec coverage:** Phase 3 (client review) covered. Coverage rule honored (submit + Changes clearly qualify; Approve added for verdict symmetry). The inline "Edit copy" caption link inside the 549-line `ReviewPostCard` is DEFERRED to a dedicated shared-card slice (needs a focused read; not wrapped blindly here). Copy centralized + contract-tested; regression via 3 existing component tests.

**Type consistency:** `CLIENT_REVIEW_TOOLTIP_COPY` keys defined in Task 1, consumed verbatim in Tasks 2-4.
