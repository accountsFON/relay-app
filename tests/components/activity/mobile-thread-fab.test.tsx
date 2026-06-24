/**
 * Regression: the mobile client-thread bottom sheet must give itself a
 * DEFINITE height, not just a max-height.
 *
 * Bug (2026-06-15): the sheet used `max-h-[85dvh]` with no height. The inner
 * ActivityThread is `h-full`, and a bare max-height leaves that height chain
 * unresolved, so the message list grew to its natural length (measured ~1267px
 * inside a 567px sheet) and shoved the pinned composer ~645px below the screen.
 * On a phone you saw only history, no chat box. A definite `h-[85dvh]` plus
 * `overflow-hidden` bounds the list so it scrolls internally and the composer
 * stays on screen.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock('@/app/(app)/clients/[id]/activity/actions', () => ({
  postCommentAction: vi.fn(),
}))

import { MobileThreadFab } from '@/components/activity/mobile-thread-fab'

describe('MobileThreadFab bottom sheet sizing', () => {
  it('uses a definite height (not a bare max-height) so the composer is not pushed off-screen', async () => {
    const user = userEvent.setup()
    render(<MobileThreadFab clientId="c1" events={[]} hideComposer />)

    await user.click(screen.getByRole('button', { name: /open client thread/i }))

    const sheet = document.querySelector('[data-slot="mobile-thread-fab-content"]')
    expect(sheet).not.toBeNull()
    const cls = (sheet as HTMLElement).className

    // Definite height present (standalone, not the `max-h-` prefix).
    expect(cls).toMatch(/(^|\s)h-\[85dvh\](\s|$)/)
    // The buggy bare max-height bound must be gone.
    expect(cls).not.toContain('max-h-[85dvh]')
    // Overflow clipped so a tall list scrolls internally instead of spilling.
    expect(cls).toContain('overflow-hidden')
  })
})

describe('MobileThreadFab showOnDesktop', () => {
  it('hides the trigger at lg+ by default (mobile only)', () => {
    render(<MobileThreadFab clientId="c1" events={[]} />)
    const trigger = screen.getByRole('button', { name: /open client thread/i })
    expect(trigger.className).toContain('lg:hidden')
  })

  it('keeps the trigger visible at lg+ when showOnDesktop is set', () => {
    render(<MobileThreadFab clientId="c1" events={[]} showOnDesktop />)
    const trigger = screen.getByRole('button', { name: /open client thread/i })
    expect(trigger.className).not.toContain('lg:hidden')
  })
})
