# Tooltip Clarity Coverage — Phase 1 (Shared Preview Controls) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add hover-hint tooltips to the non-obvious action controls on the shared `/preview` surface, driven by a centralized, copy-rule-tested copy map.

**Architecture:** One new copy module (`src/lib/preview-tooltip-copy.ts`) holds the one-sentence hints keyed by control id, the same pattern as `src/lib/relay-step-labels.ts`. Each qualifying control wraps its trigger in the existing `SimpleTooltip` (`src/components/relay/relay-tooltips.tsx`) and reads its hint from the map. Tooltip appearance is not unit-tested (base-ui portals are unreliable in jsdom, the repo norm); instead a copy-contract test guards the map and each control's existing component test guards the wrap.

**Tech Stack:** Next.js 16, React, Tailwind v4, base-ui tooltip primitive, Vitest.

## Global Constraints

- **Copy rules (Wave 4K), applied to every tooltip string:** no em or en dashes; no compound hyphens in body copy; each string under 80 characters.
- **Tooltip primitive:** always `SimpleTooltip` from `@/components/relay/relay-tooltips`. Never wrap a control in a raw base-ui `Tooltip`.
- **Coverage rule:** wrap a control only if it is icon-only OR its label hides a non-obvious consequence (destructive, bulk, state-changing, jargon). Do not wrap self-evident controls (Save, Cancel, Close, the Instagram/Facebook platform toggle).
- **Accessibility:** any icon-only button wrapped here must also carry an `aria-label`; the tooltip is supplementary, never the control's only name.
- **No prod deploy from side branches:** work on `feat/tooltip-clarity-coverage`; only a merge to `main` deploys.

---

### Task 1: Preview tooltip copy map + copy-contract test

**Files:**
- Create: `src/lib/preview-tooltip-copy.ts`
- Test: `tests/lib/preview-tooltip-copy.test.ts`

**Interfaces:**
- Produces: `PREVIEW_TOOLTIP_COPY` (a `Record`-like `const` object) with keys `imageReplace`, `bulkResolve`, `markBatchReviewed`, `commentImageRemove`, each a string. `PreviewTooltipKey = keyof typeof PREVIEW_TOOLTIP_COPY`. Later tasks import `PREVIEW_TOOLTIP_COPY` and read one key.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/preview-tooltip-copy.test.ts
import { describe, it, expect } from 'vitest'
import { PREVIEW_TOOLTIP_COPY } from '@/lib/preview-tooltip-copy'

const REQUIRED_KEYS = [
  'imageReplace',
  'bulkResolve',
  'markBatchReviewed',
  'commentImageRemove',
] as const

describe('PREVIEW_TOOLTIP_COPY', () => {
  it('has non-empty copy for every required control', () => {
    for (const key of REQUIRED_KEYS) {
      expect(PREVIEW_TOOLTIP_COPY[key], `missing copy for ${key}`).toBeTruthy()
    }
  })

  it('obeys the Wave 4K copy rules', () => {
    for (const [key, value] of Object.entries(PREVIEW_TOOLTIP_COPY)) {
      expect(value.length, `${key} must be under 80 chars`).toBeLessThan(80)
      expect(value, `${key} must not contain a dash`).not.toMatch(/[—–]| - /)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run preview-tooltip-copy`
Expected: FAIL, cannot resolve `@/lib/preview-tooltip-copy`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/preview-tooltip-copy.ts
/**
 * Hover-hint copy for the shared /preview action controls. One short
 * sentence per control, keyed by a stable control id.
 *
 * Voice-owned. Obey the Wave 4K copy rules when editing:
 *  - No em or en dashes.
 *  - No compound hyphens in body copy.
 *  - Keep each value under 80 characters.
 */
export const PREVIEW_TOOLTIP_COPY = {
  imageReplace: 'Swap in a new image for this post',
  bulkResolve: 'Mark every open feedback thread on this post resolved',
  markBatchReviewed: 'Finish your review and move this relay to the next step',
  commentImageRemove: 'Remove the attached image',
} as const

export type PreviewTooltipKey = keyof typeof PREVIEW_TOOLTIP_COPY
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run preview-tooltip-copy`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/preview-tooltip-copy.ts tests/lib/preview-tooltip-copy.test.ts
git commit -m "feat(preview): centralized tooltip copy map + copy-contract test"
```

---

### Task 2: Tooltip + aria-label on the image Replace button

**Files:**
- Modify: `src/components/preview/post-image-replace.tsx` (the `button[data-testid="post-image-replace-button"]`, currently at lines 43-51)
- Test: `tests/components/preview/post-image-replace.test.tsx` (add one assertion using the file's existing render harness)

**Interfaces:**
- Consumes: `PREVIEW_TOOLTIP_COPY.imageReplace` from Task 1; `SimpleTooltip` from `@/components/relay/relay-tooltips`.

- [ ] **Step 1: Add the failing assertion**

Open `tests/components/preview/post-image-replace.test.tsx`, read how it renders the overlay, and add this assertion inside a test that has the overlay mounted (reuse the existing render; do not invent a new one):

```tsx
const replaceButton = screen.getByTestId('post-image-replace-button')
expect(replaceButton).toHaveAttribute('aria-label', 'Replace image')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run post-image-replace`
Expected: FAIL, the button has no `aria-label` yet.

- [ ] **Step 3: Write minimal implementation**

In `src/components/preview/post-image-replace.tsx`, add the import and wrap the button. Add at the top of the imports:

```tsx
import { SimpleTooltip } from '@/components/relay/relay-tooltips'
import { PREVIEW_TOOLTIP_COPY } from '@/lib/preview-tooltip-copy'
```

Replace the existing `<button ...>...</button>` (lines 43-51) with:

```tsx
      <SimpleTooltip content={PREVIEW_TOOLTIP_COPY.imageReplace}>
        <button
          type="button"
          data-testid="post-image-replace-button"
          aria-label="Replace image"
          onClick={pick}
          className="pointer-events-auto absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-[11px] font-medium text-white hover:bg-black/75"
        >
          {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <ImageIcon className="size-3.5" />}
          {isPending ? 'Uploading…' : 'Replace'}
        </button>
      </SimpleTooltip>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run post-image-replace`
Expected: PASS (all existing tests plus the new assertion).

- [ ] **Step 5: Commit**

```bash
git add src/components/preview/post-image-replace.tsx tests/components/preview/post-image-replace.test.tsx
git commit -m "feat(preview): hover hint + aria-label on the image replace button"
```

---

### Task 3: Tooltip on the per-post Resolve-all button

**Files:**
- Modify: `src/components/preview/bulk-resolve-button.tsx` (the trigger `<Button data-testid="bulk-resolve-button">`, currently lines 82-93)
- Create: `tests/components/preview/bulk-resolve-button.test.tsx` (no test exists today; add a render smoke test)

**Interfaces:**
- Consumes: `PREVIEW_TOOLTIP_COPY.bulkResolve` from Task 1; `SimpleTooltip`.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/preview/bulk-resolve-button.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BulkResolveButton } from '@/components/preview/bulk-resolve-button'

vi.mock('@/server/actions/threads', () => ({
  bulkResolveOnPostAction: vi.fn(),
}))

describe('BulkResolveButton', () => {
  it('renders the trigger with the open-thread count', () => {
    render(<BulkResolveButton postId="p1" openThreadCount={3} />)
    const trigger = screen.getByTestId('bulk-resolve-button')
    expect(trigger).toHaveTextContent('Resolve all (3)')
  })
})
```

- [ ] **Step 2: Run test to verify it fails or passes as written**

Run: `npx vitest run bulk-resolve-button`
Expected: PASS (this is a baseline smoke test to protect the wrap in Step 3). If it fails, fix the harness before proceeding.

- [ ] **Step 3: Wrap the trigger**

In `src/components/preview/bulk-resolve-button.tsx`, add the imports:

```tsx
import { SimpleTooltip } from '@/components/relay/relay-tooltips'
import { PREVIEW_TOOLTIP_COPY } from '@/lib/preview-tooltip-copy'
```

Wrap the trigger `<Button>` (lines 82-93) in `SimpleTooltip`:

```tsx
      <SimpleTooltip content={PREVIEW_TOOLTIP_COPY.bulkResolve}>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => setOpen(true)}
          data-testid="bulk-resolve-button"
          className={className}
        >
          <CheckCheck className="size-3.5 shrink-0" aria-hidden="true" />
          <span>Resolve all{openThreadCount > 0 ? ` (${openThreadCount})` : ''}</span>
        </Button>
      </SimpleTooltip>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run bulk-resolve-button`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/preview/bulk-resolve-button.tsx tests/components/preview/bulk-resolve-button.test.tsx
git commit -m "feat(preview): hover hint on the per-post resolve-all button"
```

---

### Task 4: Tooltip on the Mark relay reviewed button

**Files:**
- Modify: `src/components/preview/mark-batch-reviewed-button.tsx` (the trigger `<Button>` that opens the confirm modal; find it by its visible label "Mark relay reviewed")
- Test: `tests/components/preview/mark-batch-reviewed-button.test.tsx` (existing test stays green; no new assertion required)

**Interfaces:**
- Consumes: `PREVIEW_TOOLTIP_COPY.markBatchReviewed` from Task 1; `SimpleTooltip`.

- [ ] **Step 1: Locate the trigger**

Read `src/components/preview/mark-batch-reviewed-button.tsx` and find the trigger `<Button>` that opens the confirm dialog (its child renders the "Mark relay reviewed" label, near the return). This is the only control to wrap; leave the dialog's own Cancel/Confirm bare (self-evident).

- [ ] **Step 2: Add imports**

```tsx
import { SimpleTooltip } from '@/components/relay/relay-tooltips'
import { PREVIEW_TOOLTIP_COPY } from '@/lib/preview-tooltip-copy'
```

- [ ] **Step 3: Wrap the trigger**

Wrap only the trigger `<Button>...</Button>` (the one whose child is the "Mark relay reviewed" label):

```tsx
<SimpleTooltip content={PREVIEW_TOOLTIP_COPY.markBatchReviewed}>
  {/* existing trigger Button, unchanged, as the single child */}
</SimpleTooltip>
```

Keep every prop on the existing `<Button>` intact; only the surrounding `SimpleTooltip` is new.

- [ ] **Step 4: Run the existing test to verify it stays green**

Run: `npx vitest run mark-batch-reviewed-button`
Expected: PASS (unchanged behavior; the wrap adds no new DOM node around the button).

- [ ] **Step 5: Commit**

```bash
git add src/components/preview/mark-batch-reviewed-button.tsx
git commit -m "feat(preview): hover hint on the mark relay reviewed button"
```

---

### Task 5: Tooltip on the icon-only remove-attached-image button

**Files:**
- Modify: `src/components/preview/comment-image-attach-button.tsx` (the icon-only `button[data-testid="comment-image-remove"]`, lines 73-85)
- Test: `tests/components/preview/comment-image-attach.test.tsx` (existing test stays green)

**Interfaces:**
- Consumes: `PREVIEW_TOOLTIP_COPY.commentImageRemove` from Task 1; `SimpleTooltip`.

Note: the visible "Attach image" button already carries a text label and is self-evident, so it stays bare. Only the icon-only X remove button qualifies (icon-only rule). It already has `aria-label="Remove attached image"`, so no a11y change is needed.

- [ ] **Step 1: Add imports**

```tsx
import { SimpleTooltip } from '@/components/relay/relay-tooltips'
import { PREVIEW_TOOLTIP_COPY } from '@/lib/preview-tooltip-copy'
```

- [ ] **Step 2: Wrap the remove button**

Replace the `<button data-testid="comment-image-remove" ...>...</button>` (lines 73-85) with the same button wrapped:

```tsx
          <SimpleTooltip content={PREVIEW_TOOLTIP_COPY.commentImageRemove}>
            <button
              type="button"
              data-testid="comment-image-remove"
              aria-label="Remove attached image"
              onClick={() => {
                onChange(null)
                setError(null)
              }}
              disabled={isDisabled}
              className="absolute -right-2 -top-2 flex size-5 items-center justify-center rounded-full bg-[#262626] text-white hover:bg-black disabled:cursor-not-allowed"
            >
              <X className="size-3" strokeWidth={2.5} />
            </button>
          </SimpleTooltip>
```

- [ ] **Step 3: Run the existing test to verify it stays green**

Run: `npx vitest run comment-image-attach`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/preview/comment-image-attach-button.tsx
git commit -m "feat(preview): hover hint on the remove-attached-image button"
```

---

### Task 6: Green gate + WORKLOG + PR

**Files:**
- Modify: `WORKLOG.md` (add a Shipped entry, fold into this commit)

- [ ] **Step 1: Full typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Full unit suite**

Run: `npm run test:unit`
Expected: all pass (prior count plus the new `preview-tooltip-copy` and `bulk-resolve-button` tests).

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Lint the changed files**

Run: `npx eslint src/lib/preview-tooltip-copy.ts src/components/preview/post-image-replace.tsx src/components/preview/bulk-resolve-button.tsx src/components/preview/mark-batch-reviewed-button.tsx src/components/preview/comment-image-attach-button.tsx`
Expected: clean.

- [ ] **Step 5: Update WORKLOG and commit**

Add under `## Shipped` in `WORKLOG.md`:

```markdown
- [x] **2026-08-06 — Phase 1 tooltip coverage: shared /preview controls** (PR #TBD)
  Hover hints on the image replace, per-post resolve-all, mark-relay-reviewed,
  and remove-attached-image controls, driven by a centralized
  PREVIEW_TOOLTIP_COPY map with a Wave 4K copy-contract test. First phase of
  the full-journey tooltip rollout (spec: tooltip-clarity-coverage-design).
```

```bash
git add WORKLOG.md
git commit -m "docs(worklog): phase 1 preview tooltip coverage"
```

- [ ] **Step 6: Push and open the PR**

```bash
git push -u origin feat/tooltip-clarity-coverage
gh pr create --repo accountsFON/relay-app --base main \
  --title "Phase 1 tooltip coverage: shared /preview controls" \
  --body "First phase of the full-journey tooltip rollout. Adds hover hints to the non-obvious shared /preview controls via a centralized, copy-rule-tested copy map. Spec: docs/superpowers/specs/2026-08-06-tooltip-clarity-coverage-design.md"
```

Expected: CI (Typecheck & Test) green; merge after review; verify the accountsFON prod deploy.

---

## Self-Review

**Spec coverage:** Phase 1 of the spec (shared preview controls) is covered. Coverage rule honored: platform toggle skipped (self-evident), only icon-only + non-obvious controls wrapped. Copy centralized in a map with a copy-contract test (spec testing approach point 2). Regression via existing component tests (point 1). A11y aria-label guard applied where relevant (Task 2). Phases 2-6 are out of scope for this plan by design (each gets its own plan).

**Placeholder scan:** No TBD/TODO in steps. `PR #TBD` in the WORKLOG entry is filled after the PR opens (Step 6); acceptable.

**Type consistency:** `PREVIEW_TOOLTIP_COPY` keys (`imageReplace`, `bulkResolve`, `markBatchReviewed`, `commentImageRemove`) are defined in Task 1 and consumed verbatim in Tasks 2-5. `SimpleTooltip content` prop matches its signature in `relay-tooltips.tsx`.
