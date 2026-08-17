# Feedback rail spacing pass

**Date:** 2026-08-17
**Surface:** `/clients/[id]/batches/[batchId]/review-sessions/[sessionId]` left rail
**Reported by:** Julio ("this needs some tlc, its too squished together", screenshot of post row #2)
**Approved:** full pass, via an annotated before/after mockup

## Problem

Four separate defects made the post row read as one dense block.

### 1. Two action buttons sharing a single line (the real bug)

The expanded row body is a `space-y-2` vertical stack. Its last two children were
**inline-level** buttons:

- `DesignerFlagToggle` unflagged renders `<button className="inline-flex ...">`
- the Mark addressed control was a bare `<button>`

Adjacent inline-level boxes flow onto the same line, and `space-y-*` applies
`margin-top`, which does nothing to separate them. They rendered jammed together with
no gap. The identical pill higher up in the row escapes this only because it is
wrapped in a `<div className="mt-1">`.

This is a layout bug, not a padding oversight.

### 2. Author and comment printed flush

`PinCommentRow` renders the author name as a `block` with the comment body
immediately beneath, no gap and no added leading. At 12px semibold over 13px regular
the two lines are close enough in size that they read as one smudge rather than as a
person and what they said. `ResolveCheckbox` has the same problem via a
`flex flex-col` with no `gap`.

### 3. One uniform gap for every relationship

A flat 8px separated every sibling: caption card, feedback card, action row. The cards
carry `p-2.5` (10px) internally, so the space *between* groups was tighter than the
space *inside* them. Grouping inverted, so nothing read as a unit.

### 4. Two affordance languages, touching

`Flag for designer` is a bordered pill; Mark addressed was bare underline-on-hover
text. Adjacent with no gap, the text stopped reading as clickable at all.

## Design

### Action footer (fixes 1 and 4)

Group the AM's two controls as flex items in a footer with a closing rule:

```jsx
<div
  data-testid={`rail-actions-${post.postId}`}
  className="mt-1 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2.5"
>
```

Flex items cannot collapse onto each other, so this removes the cause rather than
padding around the symptom. The `border-t` doubles as the row's closing edge, which is
what makes each post read as one unit.

Mark addressed takes the same bordered-pill classes as the flag toggle, kept muted so
it stays secondary. `ml-auto` pins it right so it holds that position whether or not
the flag pill is present.

**Flagged-state branch.** `DesignerFlagToggle` is only a compact pill while unflagged.
Once flagged it becomes an amber card with a note textarea, too tall to sit beside a
pill. So the post-level flag is resolved once at the top of `FeedbackRow`
(`postLevelFlag`, `showPostLevelFlag`) and rendered in one of two places: the card
above the footer on its own line, or the pill inside the footer row.

### Vertical rhythm (fixes 3)

Body stack `space-y-2` to `space-y-3`, and the per-thread flag wrapper `mt-1` to
`mt-1.5`. The point is the ordering, not the numbers: between-group space must exceed
the 10px of within-group card padding.

### Comment typography (fixes 2)

- `pin-comment-row.tsx`: `mb-1` on the author name, `leading-relaxed` on the body.
- `resolve-checkbox.tsx`: `gap-1` on the label column, both the button and span branches.

## Testing

Spacing values are not worth asserting, and the repo does not snapshot visuals. The
*collision* is worth asserting, because it was a structural defect with a structural
fix. New `ReviewFeedbackRail - action footer` tests:

1. both controls are descendants of one `rail-actions-*` container, not loose siblings
2. that container is laid out `flex` with a `gap-2` (the mechanism, not the cosmetics)
3. the footer still renders when `verdict === 'none'` suppresses the flag pill
4. the flagged amber card renders **outside** the footer
5. no footer at all in the designer branch

All five fail against the previous markup, since `rail-actions-*` did not exist.

## Out of scope

The collapsed row header (`#2 Changes 1 pin`) and the center canvas are untouched.
No behavior, permission, or data change: this is presentation only.
