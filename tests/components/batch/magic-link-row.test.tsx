import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock('@/server/actions/magicLink', () => ({
  revokeMagicLinkAction: vi.fn(),
  getFreshUrlForLinkAction: vi.fn(),
  resendMagicLinkEmailAction: vi.fn(),
}))

import {
  getFreshUrlForLinkAction,
  resendMagicLinkEmailAction,
} from '@/server/actions/magicLink'
import { MagicLinkRow } from '@/components/batch/magic-link-row'

const rowProps = {
  id: 'cuid_link_1',
  recipientName: 'Jane Doe',
  recipientEmail: 'jane@client.com',
  expiresAt: new Date('2026-06-15T00:00:00Z'),
  lastVisitedAt: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  // jsdom does not implement navigator.clipboard by default.
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  })
  // Default confirm to true so Resend / Revoke proceed.
  vi.spyOn(window, 'confirm').mockImplementation(() => true)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('MagicLinkRow', () => {
  it('Copy URL calls getFreshUrlForLinkAction and writes the URL to the clipboard', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    vi.mocked(getFreshUrlForLinkAction).mockResolvedValue({
      url: 'https://relay-app.test/review/fresh-abc',
      magicLinkId: 'cuid_link_new',
      expiresAt: new Date('2026-06-15T00:00:00Z'),
    })

    render(<MagicLinkRow {...rowProps} />)

    await user.click(screen.getByTestId('copy-link-button-cuid_link_1'))

    await waitFor(() => {
      expect(getFreshUrlForLinkAction).toHaveBeenCalledWith({ id: 'cuid_link_1' })
    })
    expect(writeText).toHaveBeenCalledWith('https://relay-app.test/review/fresh-abc')
    expect(
      await screen.findByTestId('magic-link-row-copied-cuid_link_1'),
    ).toHaveTextContent(/copied/i)
  })

  it('Resend Email triggers resendMagicLinkEmailAction and surfaces the success state', async () => {
    const user = userEvent.setup()
    vi.mocked(resendMagicLinkEmailAction).mockResolvedValue({
      ok: true,
      newUrl: 'https://relay-app.test/review/resent-xyz',
      magicLinkId: 'cuid_link_new',
      emailSent: true,
      emailError: null,
    })

    render(<MagicLinkRow {...rowProps} />)

    await user.click(screen.getByTestId('resend-link-button-cuid_link_1'))

    await waitFor(() => {
      expect(resendMagicLinkEmailAction).toHaveBeenCalledWith({ id: 'cuid_link_1' })
    })
    expect(
      await screen.findByTestId('magic-link-row-sent-cuid_link_1'),
    ).toHaveTextContent(/email sent/i)
  })

  it('Open Preview opens a fresh URL in a new tab', async () => {
    const user = userEvent.setup()
    vi.mocked(getFreshUrlForLinkAction).mockResolvedValue({
      url: 'https://relay-app.test/review/preview-xyz',
      magicLinkId: 'cuid_link_new',
      expiresAt: new Date('2026-06-15T00:00:00Z'),
    })
    const openSpy = vi
      .spyOn(window, 'open')
      .mockReturnValue({} as Window) // truthy means "popup not blocked"

    render(<MagicLinkRow {...rowProps} />)

    await user.click(screen.getByTestId('open-link-button-cuid_link_1'))

    await waitFor(() => {
      expect(getFreshUrlForLinkAction).toHaveBeenCalledWith({ id: 'cuid_link_1' })
    })
    expect(openSpy).toHaveBeenCalledWith(
      'https://relay-app.test/review/preview-xyz',
      '_blank',
      'noopener,noreferrer',
    )
  })

  it('renders comment count and last-activity when provided', () => {
    render(
      <MagicLinkRow
        {...rowProps}
        commentCount={3}
        lastActivityAt={new Date(Date.now() - 2 * 60 * 60 * 1000)}
      />,
    )

    expect(
      screen.getByTestId('magic-link-comment-count-cuid_link_1'),
    ).toHaveTextContent(/3 comments/i)
    expect(
      screen.getByTestId('magic-link-last-activity-cuid_link_1'),
    ).toHaveTextContent(/last activity:/i)
  })
})
