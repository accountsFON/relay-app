# 2.5D.1 Step indicator visual verification

**Preview URL:** https://relay-app-git-feat-brand-25d1-step-colors-accountsfons-projects.vercel.app/

## Status

Headless verification blocked at sign-in. The Vercel preview uses Clerk dev mode
which requires Google OAuth. Per safety rules, the agent cannot complete OAuth
flows without explicit user permission, and even with permission, account
chooser screens require a human to select an identity.

## What to verify manually

1. Sign into the preview URL with a Five One Nine account.
2. Open any batch detail page: `/clients/[id]/batches/[batchId]`.
3. Confirm the step indicator (the 13 connected circles at the top of the
   batch detail card) renders as follows against Mockup 3:

   - **Done step:** filled neutral-900 (ink) circle with a white check.
   - **Active step:** filled circle in the category color for that step
     (blue for onboarding, yellow for AM-held, coral for designer-held,
     blue for client-held) with a white clock icon.
   - **Pending step:** outlined circle with neutral-50 border, neutral-700
     numeral inside.
   - **Connecting line:** filled neutral-900 to the left of the active
     circle, neutral-50 to the right.
   - **Labels:** small-caps role above (`text-[10px] uppercase tracking-[0.08em]`),
     step name below (`text-[12px] font-medium`).

4. Also open the dashboard at `/relays` and confirm:
   - Stations now use their category color (not orange) for the "recently
     passed" highlight ring + count badge wash.
   - Runner cards use a blue-300 ring + blue-100/500 baton pill when
     recently passed (was orange).

## Coverage falls back to tests + tsc

- `tests/lib/relay-step-colors.test.ts` covers the map invariants
  (every RelayStep has a category color, 5 explicit mappings, completed = ink,
  fallback behavior).
- `tsc --noEmit` passes.
- `grep -rn "var(--orange)" src/` returns zero hits.
