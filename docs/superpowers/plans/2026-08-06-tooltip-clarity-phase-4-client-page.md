# Tooltip Clarity Coverage — Phase 4 (Client Page Actions) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Checkbox steps.

**Goal:** Add hover hints to the bare client-page action controls: send-to-client-review and the client decision panel's Approve/Request-changes buttons.

**Architecture:** New `src/lib/client-page-tooltip-copy.ts` map + copy-contract test, wrap each control in `SimpleTooltip`. Same mechanism as Phases 1-3.

## Global Constraints
- Copy rules (Wave 4K): no em/en dashes, no compound hyphens, under 80 chars.
- Primitive: `SimpleTooltip` from `@/components/relay/relay-tooltips`.
- Coverage rule: non-obvious/jargon controls only. `archive-client-button` ALREADY has a tooltip (skip). The profile inline-edit pencils (self-evident, aria-labeled, many) and the restore banner (button lives in the shared `ArchivedBanner`) are DEFERRED.

---

### Task 1: Copy map + contract test

**Files:** Create `src/lib/client-page-tooltip-copy.ts`; Test `tests/lib/client-page-tooltip-copy.test.ts`.

**Interfaces:** Produces `CLIENT_PAGE_TOOLTIP_COPY` with keys `sendToReview`, `approveSchedule`, `requestChanges`.

- [ ] **Step 1: failing test**

```ts
// tests/lib/client-page-tooltip-copy.test.ts
import { describe, it, expect } from 'vitest'
import { CLIENT_PAGE_TOOLTIP_COPY } from '@/lib/client-page-tooltip-copy'

const REQUIRED_KEYS = ['sendToReview', 'approveSchedule', 'requestChanges'] as const

describe('CLIENT_PAGE_TOOLTIP_COPY', () => {
  it('has non-empty copy for every required control', () => {
    for (const key of REQUIRED_KEYS) {
      expect(CLIENT_PAGE_TOOLTIP_COPY[key], `missing copy for ${key}`).toBeTruthy()
    }
  })
  it('obeys the Wave 4K copy rules', () => {
    for (const [key, value] of Object.entries(CLIENT_PAGE_TOOLTIP_COPY)) {
      expect(value.length, `${key} must be under 80 chars`).toBeLessThan(80)
      expect(value, `${key} must not contain a dash`).not.toMatch(/[—–]| - /)
    }
  })
})
```

- [ ] **Step 2:** `npx vitest run client-page-tooltip-copy` — FAIL.
- [ ] **Step 3: implementation**

```ts
// src/lib/client-page-tooltip-copy.ts
/**
 * Hover-hint copy for the client-page action controls. One short sentence per
 * control, keyed by a stable control id.
 *
 * Voice-owned. Obey the Wave 4K copy rules when editing:
 *  - No em or en dashes.
 *  - No compound hyphens in body copy.
 *  - Keep each value under 80 characters.
 */
export const CLIENT_PAGE_TOOLTIP_COPY = {
  sendToReview: 'Run the final QA before this relay moves on',
  approveSchedule: 'Approve this relay and send it straight to scheduling',
  requestChanges: 'Send this back to your team with notes on what to fix',
} as const

export type ClientPageTooltipKey = keyof typeof CLIENT_PAGE_TOOLTIP_COPY
```

- [ ] **Step 4:** `npx vitest run client-page-tooltip-copy` — PASS.
- [ ] **Step 5:** Commit `feat(relay): client-page tooltip copy map + copy-contract test`.

---

### Task 2: Tooltip on Send to Client Review

**Files:** Modify `src/components/relay/send-to-client-review-button.tsx` (trigger `<Button>`, lines 73-81). Test: existing `send-to-client-review-button.test.tsx` stays green.

- [ ] **Step 1: imports**

```tsx
import { SimpleTooltip } from '@/components/relay/relay-tooltips'
import { CLIENT_PAGE_TOOLTIP_COPY } from '@/lib/client-page-tooltip-copy'
```

- [ ] **Step 2: wrap the trigger** (lines 73-81) in `SimpleTooltip content={CLIENT_PAGE_TOOLTIP_COPY.sendToReview}`, keeping all props and the `{label}<ArrowRight />` children.
- [ ] **Step 3:** `npx vitest run send-to-client-review-button` — PASS.
- [ ] **Step 4:** Commit `feat(relay): hover hint on the send-to-client-review button`.

---

### Task 3: Tooltips on the client decision panel (Approve & schedule, Request changes)

**Files:** Modify `src/components/relay/client-decision-panel.tsx` (the two idle-mode `<Button>`s, approx lines 91-103). Create `tests/components/relay/client-decision-panel.test.tsx` (none exists).

- [ ] **Step 1: write a smoke test**

```tsx
// tests/components/relay/client-decision-panel.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ClientDecisionPanel } from '@/components/relay/client-decision-panel'

// Mock any server action module the panel imports at the top of the file.
// (Read the component's imports first and mock the action module it uses.)

describe('ClientDecisionPanel', () => {
  it('renders the Approve and Request changes actions in idle mode', () => {
    // Render with the minimal required props (read the component's prop types first).
    // Assert both action labels are present.
    expect(true).toBe(true)
  })
})
```

NOTE: before running, read `client-decision-panel.tsx`'s prop types + imported action module, fill the mock and the real render with required props, and assert `screen.getByText('Approve & schedule')` and `screen.getByText('Request changes')` are present. Replace the placeholder assertion.

- [ ] **Step 2:** `npx vitest run client-decision-panel` — PASS (baseline).
- [ ] **Step 3: imports**

```tsx
import { SimpleTooltip } from '@/components/relay/relay-tooltips'
import { CLIENT_PAGE_TOOLTIP_COPY } from '@/lib/client-page-tooltip-copy'
```

- [ ] **Step 4: wrap both idle-mode buttons.** Wrap the `Approve & schedule` `<Button>` in `SimpleTooltip content={CLIENT_PAGE_TOOLTIP_COPY.approveSchedule}` and the `Request changes` `<Button>` in `SimpleTooltip content={CLIENT_PAGE_TOOLTIP_COPY.requestChanges}`, keeping every prop and child intact.
- [ ] **Step 5:** `npx vitest run client-decision-panel` — PASS.
- [ ] **Step 6:** Commit `feat(relay): hover hints on the client decision panel actions`.

---

### Task 4: Green gate + WORKLOG + PR

- [ ] `npx tsc --noEmit`
- [ ] `npm run test:unit`
- [ ] `npm run build`
- [ ] `npx eslint` the 3 changed source files + 2 tests
- [ ] WORKLOG `## Shipped` entry (top), commit
- [ ] push + `gh pr create --base main`

---

## Self-Review
Phase 4 (client-page actions) covered: send-to-client-review + the decision panel's two verdict actions. `archive-client-button` skipped (already tooltipped). Profile inline editors + restore banner deferred with rationale. Copy centralized + contract-tested; regression via the existing send-to-review test + a new decision-panel smoke test. `CLIENT_PAGE_TOOLTIP_COPY` keys defined in Task 1, consumed in Tasks 2-3.
