# Preview/Review Surface First-Visit Tour — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the internal preview/review surface (`/clients/:id/batches/:id/preview`, `InternalReviewShell`) a first-visit walkthrough, role-tailored for AM/admin vs designer, using the existing tour engine.

**Architecture:** Register a new auto-fire `TourDef` (`preview-review-v1`) in the existing `tour-registry.ts`, matching the `/preview` route. Add three `data-tour-anchor` attributes to `internal-review-shell.tsx` so the anchored stops point at the real rail, post canvas, and action controls. The existing `TourProvider` auto-fires the tour on first visit and persists "seen" in `User.seenTours` — no new engine, no schema change.

**Tech Stack:** Next.js 16, React, TypeScript, Vitest + @testing-library/react. Tour system: `src/components/onboarding/tour-registry.ts`, `tour-provider.tsx`, `tour-popover.tsx`.

## Global Constraints

- **No schema change.** Reuse `User.seenTours` (versioned string ids). Persistence is already wired via `src/server/services/onboardingTour.ts`.
- **Versioned id:** `preview-review-v1`. Bumping the version re-fires for everyone.
- **Never the `client` role.** Tours are staff-only (`admin`, `account_manager`, `designer`).
- **Auto-fire only (no `homePath`):** dynamic route, so it is NOT listed in the Tips/Settings replay menu (matches `batch-detail-v1`).
- **Green gate before each PR:** `npx tsc --noEmit` + `npm run test:unit` + `npm run build` + `npx eslint <changed files>` all clean.
- **Copy rules (repo-wide):** no em dashes; avoid compound hyphens in tooltip body prose.
- TDD, frequent commits.

## File Structure

- `src/components/onboarding/tour-registry.ts` — add `PREVIEW_ROUTE` regex, `PREVIEW_REVIEW_AM` + `PREVIEW_REVIEW_DESIGNER` stop arrays, and the `preview-review-v1` `TourDef`. (Task 1)
- `tests/components/onboarding/tour-registry.test.ts` — update the one existing assertion that says `/preview` fires nothing; add a `preview-review` describe block. (Task 1)
- `src/components/review/internal-review-shell.tsx` — add three `data-tour-anchor` attributes. (Task 2)
- `tests/components/review/internal-review-shell.test.tsx` — add a render test asserting the anchors exist. (Task 2)

Out of scope (separate fast-follow plan): the **client profile view** tour (`client-profile-v1`), and **Piece B** (always-on tooltips).

---

### Task 1: Register the `preview-review-v1` tour

**Files:**
- Modify: `src/components/onboarding/tour-registry.ts` (add regex + stops + `TourDef`, near the other coachmark defs and inside the `TOURS` array ~line 239-320)
- Test: `tests/components/onboarding/tour-registry.test.ts` (update line 68 assertion; add a describe block)

**Interfaces:**
- Consumes: existing `TourStop` type, `CONCEPT_ANCHOR` sentinel, and the `TourDef` shape already in the file. Existing pure selectors `selectAutoTour(pathname, role, seenTours)`, `eligibleAutoTours(...)`, `getTourById(id)`, `listToursForRole(role)`, `isValidTourId(id)`.
- Produces: a registered tour `preview-review-v1` whose anchored stops reference `[data-tour-anchor="review-rail"]`, `[data-tour-anchor="review-posts"]`, `[data-tour-anchor="review-actions"]` (Task 2 adds those attributes).

- [ ] **Step 1: Update the now-wrong existing test to expect the new behavior (write it failing).**

In `tests/components/onboarding/tour-registry.test.ts`, replace the existing test at ~line 68:

```ts
    it('does not fire on the detail page child routes (preview, review-sessions)', () => {
      expect(selectAutoTour(`${ROUTE}/preview`, 'account_manager', [])).toBeNull()
      expect(
        selectAutoTour(`${ROUTE}/review-sessions/s1`, 'account_manager', []),
      ).toBeNull()
    })
```

with:

```ts
    it('does not leak the relay-detail tour onto child routes (preview has its own, review-sessions none)', () => {
      // /preview now has its own tour, but it must NOT be batch-detail-v1.
      const previewTour = selectAutoTour(`${ROUTE}/preview`, 'account_manager', [])
      expect(previewTour?.id).toBe('preview-review-v1')
      expect(previewTour?.id).not.toBe('batch-detail-v1')
      expect(
        selectAutoTour(`${ROUTE}/review-sessions/s1`, 'account_manager', []),
      ).toBeNull()
    })
```

- [ ] **Step 2: Add the new `preview-review` describe block (failing tests).**

Append inside the top-level `describe('tour-registry', ...)` block (before its closing `})` at the end of the file):

```ts
  describe('preview-review coachmark (internal review surface)', () => {
    const PREVIEW = '/clients/abc/batches/xyz/preview'

    it('auto-fires on /preview for admin, account_manager, and designer', () => {
      expect(selectAutoTour(PREVIEW, 'admin', [])?.id).toBe('preview-review-v1')
      expect(selectAutoTour(PREVIEW, 'account_manager', [])?.id).toBe('preview-review-v1')
      expect(selectAutoTour(PREVIEW, 'designer', [])?.id).toBe('preview-review-v1')
    })

    it('never fires for the client role', () => {
      expect(selectAutoTour(PREVIEW, 'client', [])).toBeNull()
    })

    it('does not fire once seen', () => {
      expect(selectAutoTour(PREVIEW, 'account_manager', ['preview-review-v1'])).toBeNull()
    })

    it('gives the designer a shorter stop set than the AM', () => {
      const t = getTourById('preview-review-v1')!
      expect(t.stopsForRole('designer').length).toBeLessThan(
        t.stopsForRole('account_manager').length,
      )
    })

    it('anchors its stops to the review surface elements', () => {
      const anchors = getTourById('preview-review-v1')!
        .stopsForRole('account_manager')
        .map((s) => s.anchorSelector)
      expect(anchors).toContain('[data-tour-anchor="review-rail"]')
      expect(anchors).toContain('[data-tour-anchor="review-posts"]')
      expect(anchors).toContain('[data-tour-anchor="review-actions"]')
    })

    it('is auto-fire only — not in the replay menu (no homePath)', () => {
      expect(listToursForRole('account_manager').map((t) => t.id)).not.toContain(
        'preview-review-v1',
      )
    })

    it('validates the new id', () => {
      expect(isValidTourId('preview-review-v1')).toBe(true)
    })
  })
```

- [ ] **Step 3: Run the tests to verify they fail.**

Run: `npx vitest run tests/components/onboarding/tour-registry.test.ts`
Expected: FAIL — `preview-review-v1` is not registered yet (`selectAutoTour(...preview...)` returns `null`/`batch-detail`, `getTourById('preview-review-v1')` is `undefined`).

- [ ] **Step 4: Add the route regex + stop arrays in `tour-registry.ts`.**

After the `CLIENTS_STOPS` definition (~line 237, just before `const TOURS: TourDef[] = [`), add:

```ts
// Exact internal preview/review route: /clients/:id/batches/:id/preview.
const PREVIEW_ROUTE = /^\/clients\/[^/]+\/batches\/[^/]+\/preview$/

// Page coachmark: the internal preview/review surface (InternalReviewShell).
// AM/admin variant — they review, comment on the work, and hand it off.
const PREVIEW_REVIEW_AM: TourStop[] = [
  {
    id: 'preview-rail',
    anchorSelector: '[data-tour-anchor="review-rail"]',
    title: 'Everything to review, in one list',
    body: 'Every post and open comment thread is listed here. Click any row to jump straight to it.',
  },
  {
    id: 'preview-posts',
    anchorSelector: '[data-tour-anchor="review-posts"]',
    title: 'The posts',
    body: 'Each generated post shows here with its caption and design. Read it, then leave feedback.',
  },
  {
    id: 'preview-comment',
    anchorSelector: CONCEPT_ANCHOR,
    title: 'Comment right on the work',
    body: 'Click anywhere on an image to drop a pin, or select caption text, to leave a comment on that exact spot.',
  },
  {
    id: 'preview-actions',
    anchorSelector: '[data-tour-anchor="review-actions"]',
    title: 'Send it on when you are done',
    body: 'Use the controls up here to hand the relay back or move it to the next stage.',
  },
]

// Designer variant — they read the approved copy and upload their designs.
const PREVIEW_REVIEW_DESIGNER: TourStop[] = [
  {
    id: 'preview-rail',
    anchorSelector: '[data-tour-anchor="review-rail"]',
    title: 'Your feedback list',
    body: 'Comments and change requests land here. Work through them top to bottom.',
  },
  {
    id: 'preview-posts',
    anchorSelector: '[data-tour-anchor="review-posts"]',
    title: 'What you are designing',
    body: 'Each post shows the approved caption your design should match.',
  },
  {
    id: 'preview-actions',
    anchorSelector: '[data-tour-anchor="review-actions"]',
    title: 'Upload and hand back',
    body: 'Add or replace a design from the controls up here, then hand the relay back.',
  },
]
```

- [ ] **Step 5: Register the `TourDef` in the `TOURS` array.**

Inside `const TOURS: TourDef[] = [ ... ]`, add this entry (place it after the `designer-batch-detail-v1` entry, ~line 274):

```ts
  {
    id: 'preview-review-v1',
    labelForRole: () => 'Review page walkthrough',
    roles: ['admin', 'account_manager', 'designer'],
    // No homePath: dynamic route, auto-fire-on-first-visit only.
    matchPath: (p) => PREVIEW_ROUTE.test(p),
    trigger: 'auto',
    stopsForRole: (role) =>
      role === 'designer' ? PREVIEW_REVIEW_DESIGNER : PREVIEW_REVIEW_AM,
  },
```

- [ ] **Step 6: Run the tests to verify they pass.**

Run: `npx vitest run tests/components/onboarding/tour-registry.test.ts`
Expected: PASS (all existing + new cases).

- [ ] **Step 7: Commit.**

```bash
git add src/components/onboarding/tour-registry.ts tests/components/onboarding/tour-registry.test.ts
git commit -m "feat(onboarding): register preview-review-v1 tour for the internal review surface"
```

---

### Task 2: Add the tour anchors to `InternalReviewShell`

**Files:**
- Modify: `src/components/review/internal-review-shell.tsx` (3 attributes in the `return (...)` JSX, ~lines 327, 337, 350)
- Test: `tests/components/review/internal-review-shell.test.tsx` (add one render test; reuse the file's existing mocks, `BASE_PROPS`, and `POSTS`)

**Interfaces:**
- Consumes: `preview-review-v1` from Task 1 (its stops reference these three anchor selectors).
- Produces: DOM anchors `[data-tour-anchor="review-rail"]`, `[data-tour-anchor="review-posts"]`, `[data-tour-anchor="review-actions"]` present whenever the shell renders.

- [ ] **Step 1: Write the failing render test.**

Add to `tests/components/review/internal-review-shell.test.tsx` (a new `it` inside the existing top-level describe; `render`, `screen`, `BASE_PROPS`, and `POSTS` already exist in this file):

```ts
  it('exposes the tour anchors for the preview-review coachmark', () => {
    render(<InternalReviewShell {...BASE_PROPS} posts={POSTS} />)
    expect(document.querySelector('[data-tour-anchor="review-rail"]')).not.toBeNull()
    expect(document.querySelector('[data-tour-anchor="review-posts"]')).not.toBeNull()
    expect(document.querySelector('[data-tour-anchor="review-actions"]')).not.toBeNull()
  })
```

- [ ] **Step 2: Run the test to verify it fails.**

Run: `npx vitest run tests/components/review/internal-review-shell.test.tsx -t "tour anchors"`
Expected: FAIL — the anchors do not exist yet (all three `querySelector` calls return `null`).

- [ ] **Step 3: Add the three anchor attributes in `internal-review-shell.tsx`.**

In the `return (...)` block:

1. The controls container (~line 327) — add `data-tour-anchor="review-actions"`:

```tsx
            <div className="flex items-center gap-2" data-tour-anchor="review-actions">
              {designerControlsSlot}
              {amControlsSlot}
            </div>
```

2. The left-rail wrapper (~line 337) — add `data-tour-anchor="review-rail"`:

```tsx
        <div
          className="lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100dvh-5rem)] lg:overflow-y-auto"
          data-tour-anchor="review-rail"
        >
          <InternalReviewRail
```

3. The right canvas wrapper (~line 350) — add `data-tour-anchor="review-posts"`:

```tsx
        <div className="min-w-0" data-tour-anchor="review-posts">
          <FeedShell>
```

- [ ] **Step 4: Run the test to verify it passes.**

Run: `npx vitest run tests/components/review/internal-review-shell.test.tsx -t "tour anchors"`
Expected: PASS.

- [ ] **Step 5: Run the full green gate.**

```bash
npx tsc --noEmit
npm run test:unit
npm run build
npx eslint src/components/onboarding/tour-registry.ts src/components/review/internal-review-shell.tsx tests/components/onboarding/tour-registry.test.ts tests/components/review/internal-review-shell.test.tsx
```
Expected: tsc exit 0; unit suite all pass; build succeeds; eslint clean.

- [ ] **Step 6: Commit.**

```bash
git add src/components/review/internal-review-shell.tsx tests/components/review/internal-review-shell.test.tsx
git commit -m "feat(review): add tour anchors to InternalReviewShell for preview-review-v1"
```

---

## Ship steps (after both tasks)

- [ ] Add a WORKLOG.md **Shipped** entry (fold into the branch): "First-visit tour on the internal preview/review surface (preview-review-v1), AM + designer variants (PR #NNN)."
- [ ] Push branch `feat/guidance-preview-tutorial`, open PR into `main`, watch CI green, squash-merge, verify the accountsFON prod deploy succeeds.
- [ ] Optional live check: reset your own `seenTours` (or use `/api/onboarding/reset`) and open a relay's `/preview` to watch the tour fire.

## Self-Review

- **Spec coverage:** Implements Piece A item 1 (`/preview` tutorial, AM + designer variants) from the design spec. Client-profile (item 2) and Piece B (tooltips) are explicitly separate plans. ✅
- **Placeholder scan:** No TBDs; all stop copy, selectors, test code, and commands are concrete. ✅
- **Type consistency:** Anchor selectors match exactly between Task 1 stops (`review-rail`/`review-posts`/`review-actions`) and Task 2 attributes. Tour id `preview-review-v1` consistent throughout. Reuses existing `TourStop`/`TourDef`/`CONCEPT_ANCHOR` and pure selectors verbatim. ✅
- **Known interaction:** Task 1 intentionally rewrites the existing `tour-registry.test.ts` assertion that `/preview` fires nothing (it now fires `preview-review-v1`). Called out in Task 1 Step 1. ✅
