# Tooltip Clarity Coverage — Phase 2 (Staff Review Actions) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add hover-hint tooltips to the AM/designer jargon action buttons on the staff review surface, driven by a centralized, copy-rule-tested copy map (mirrors Phase 1).

**Architecture:** A new `src/lib/review-tooltip-copy.ts` map holds one-sentence hints keyed by control id, the same pattern as Phase 1's `preview-tooltip-copy.ts`. Each qualifying control wraps its trigger `<Button>` in the existing `SimpleTooltip`. No tooltip-appearance tests (jsdom portal norm); a copy-contract test guards the map, and each control's existing component test guards the wrap.

**Tech Stack:** Next.js 16, React, base-ui tooltip primitive, Vitest.

## Global Constraints

- **Copy rules (Wave 4K):** no em or en dashes; no compound hyphens in body copy; each string under 80 characters.
- **Primitive:** `SimpleTooltip` from `@/components/relay/relay-tooltips`.
- **Coverage rule:** icon-only OR non-obvious (destructive/bulk/state-changing/jargon) only. The designer-flag toggle and the changes-navigator prev/next chevrons are intentionally EXCLUDED: their buttons carry visible labels / obvious stepper semantics, so a tooltip would be noise.
- **Scope:** staff-side AM/designer action buttons only. Client-facing controls (approve-all, submit-review-bar) are Phase 3; shared ReviewPostCard internals are a later slice.

---

### Task 1: Review tooltip copy map + copy-contract test

**Files:**
- Create: `src/lib/review-tooltip-copy.ts`
- Test: `tests/lib/review-tooltip-copy.test.ts`

**Interfaces:**
- Produces: `REVIEW_TOOLTIP_COPY` const object with keys `requestChanges`, `markAddressed`, `markRevisionsDone`, `startNextRound`. `ReviewTooltipKey = keyof typeof REVIEW_TOOLTIP_COPY`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/review-tooltip-copy.test.ts
import { describe, it, expect } from 'vitest'
import { REVIEW_TOOLTIP_COPY } from '@/lib/review-tooltip-copy'

const REQUIRED_KEYS = [
  'requestChanges',
  'markAddressed',
  'markRevisionsDone',
  'startNextRound',
] as const

describe('REVIEW_TOOLTIP_COPY', () => {
  it('has non-empty copy for every required control', () => {
    for (const key of REQUIRED_KEYS) {
      expect(REVIEW_TOOLTIP_COPY[key], `missing copy for ${key}`).toBeTruthy()
    }
  })

  it('obeys the Wave 4K copy rules', () => {
    for (const [key, value] of Object.entries(REVIEW_TOOLTIP_COPY)) {
      expect(value.length, `${key} must be under 80 chars`).toBeLessThan(80)
      expect(value, `${key} must not contain a dash`).not.toMatch(/[—–]| - /)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run review-tooltip-copy` (cannot resolve module).

- [ ] **Step 3: Write implementation**

```ts
// src/lib/review-tooltip-copy.ts
/**
 * Hover-hint copy for the staff review action controls. One short sentence
 * per control, keyed by a stable control id.
 *
 * Voice-owned. Obey the Wave 4K copy rules when editing:
 *  - No em or en dashes.
 *  - No compound hyphens in body copy.
 *  - Keep each value under 80 characters.
 */
export const REVIEW_TOOLTIP_COPY = {
  requestChanges: 'Send your feedback to the designer and start revisions',
  markAddressed: "Clear this post's feedback and mark it handled",
  markRevisionsDone: 'Tell the account manager your revisions are ready to review again',
  startNextRound: 'Close this review round and open the next one for the client',
} as const

export type ReviewTooltipKey = keyof typeof REVIEW_TOOLTIP_COPY
```

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run review-tooltip-copy` (2 pass).

- [ ] **Step 5: Commit**

```bash
git add src/lib/review-tooltip-copy.ts tests/lib/review-tooltip-copy.test.ts
git commit -m "feat(review): centralized tooltip copy map + copy-contract test"
```

---

### Task 2: Tooltip on Request changes

**Files:**
- Modify: `src/components/review/request-changes-button.tsx` (trigger `<Button data-testid="request-changes-button">`, lines 59-67; leave the confirm dialog's two buttons bare)
- Test: `tests/components/review/request-changes-button.test.tsx` (existing, stays green)

- [ ] **Step 1: Add imports** to `request-changes-button.tsx`:

```tsx
import { SimpleTooltip } from '@/components/relay/relay-tooltips'
import { REVIEW_TOOLTIP_COPY } from '@/lib/review-tooltip-copy'
```

- [ ] **Step 2: Wrap the trigger** (lines 59-67):

```tsx
      <SimpleTooltip content={REVIEW_TOOLTIP_COPY.requestChanges}>
        <Button
          variant="outline"
          size="default"
          onClick={() => setOpen(true)}
          disabled={disabled || isPending || sent}
          data-testid="request-changes-button"
        >
          {isPending ? 'Requesting...' : 'Request changes'}
        </Button>
      </SimpleTooltip>
```

- [ ] **Step 3: Run existing test** — `npx vitest run request-changes-button` (PASS).

- [ ] **Step 4: Commit**

```bash
git add src/components/review/request-changes-button.tsx
git commit -m "feat(review): hover hint on the request-changes button"
```

---

### Task 3: Tooltip on Mark addressed

**Files:**
- Modify: `src/components/review/mark-addressed-button.tsx` (the `<Button>`, lines 28-45)
- Test: `tests/components/review/mark-addressed-button.test.tsx` (existing, stays green)

- [ ] **Step 1: Add imports:**

```tsx
import { SimpleTooltip } from '@/components/relay/relay-tooltips'
import { REVIEW_TOOLTIP_COPY } from '@/lib/review-tooltip-copy'
```

- [ ] **Step 2: Wrap the `<Button>`** (lines 28-45) in `SimpleTooltip content={REVIEW_TOOLTIP_COPY.markAddressed}`, keeping every existing prop and the inner onClick logic intact. The `SimpleTooltip` becomes the button's parent inside the existing `<div className="flex flex-col items-end gap-1">`.

- [ ] **Step 3: Run existing test** — `npx vitest run mark-addressed-button` (PASS).

- [ ] **Step 4: Commit**

```bash
git add src/components/review/mark-addressed-button.tsx
git commit -m "feat(review): hover hint on the mark-addressed button"
```

---

### Task 4: Tooltip on Mark revisions done

**Files:**
- Modify: `src/components/review/mark-revisions-done-button.tsx` (the `<Button>`, lines 55-63)
- Test: `tests/components/review/mark-revisions-done-button.test.tsx` (existing, stays green)

- [ ] **Step 1: Add imports:**

```tsx
import { SimpleTooltip } from '@/components/relay/relay-tooltips'
import { REVIEW_TOOLTIP_COPY } from '@/lib/review-tooltip-copy'
```

- [ ] **Step 2: Wrap the `<Button>`** (lines 55-63) in `SimpleTooltip content={REVIEW_TOOLTIP_COPY.markRevisionsDone}`, keeping props and the `handleClick` wiring intact.

- [ ] **Step 3: Run existing test** — `npx vitest run mark-revisions-done-button` (PASS).

- [ ] **Step 4: Commit**

```bash
git add src/components/review/mark-revisions-done-button.tsx
git commit -m "feat(review): hover hint on the mark-revisions-done button"
```

---

### Task 5: Tooltip on Start next round

**Files:**
- Modify: `src/components/review/start-next-round-button.tsx` (the `<Button>`, lines 67-77)
- Test: `tests/components/review/start-next-round-button.test.tsx` (existing, stays green)

- [ ] **Step 1: Add imports:**

```tsx
import { SimpleTooltip } from '@/components/relay/relay-tooltips'
import { REVIEW_TOOLTIP_COPY } from '@/lib/review-tooltip-copy'
```

- [ ] **Step 2: Wrap the `<Button>`** (lines 67-77) in `SimpleTooltip content={REVIEW_TOOLTIP_COPY.startNextRound}`, keeping the `data-*` attrs and `handleClick` intact.

- [ ] **Step 3: Run existing test** — `npx vitest run start-next-round-button` (PASS).

- [ ] **Step 4: Commit**

```bash
git add src/components/review/start-next-round-button.tsx
git commit -m "feat(review): hover hint on the start-next-round button"
```

---

### Task 6: Green gate + WORKLOG + PR

- [ ] **Step 1:** `npx tsc --noEmit` (no errors)
- [ ] **Step 2:** `npm run test:unit` (all pass, +1 new copy test)
- [ ] **Step 3:** `npm run build` (succeeds)
- [ ] **Step 4:** `npx eslint` the 5 changed source files + 1 new test (clean)
- [ ] **Step 5:** Add a WORKLOG `## Shipped` entry (top), commit
- [ ] **Step 6:** `git push -u origin feat/tooltip-clarity-phase-2-review` + `gh pr create --base main`

---

## Self-Review

**Spec coverage:** Phase 2 (staff review actions) covered. Coverage rule honored: only jargon action buttons wrapped; designer-flag toggle and nav chevrons excluded as labeled/self-evident. Copy centralized + copy-contract tested. Regression via 4 existing component tests.

**Placeholder scan:** none.

**Type consistency:** `REVIEW_TOOLTIP_COPY` keys (`requestChanges`, `markAddressed`, `markRevisionsDone`, `startNextRound`) defined in Task 1, consumed verbatim in Tasks 2-5.
