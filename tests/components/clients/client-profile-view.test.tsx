import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Client } from '@prisma/client'
import { ClientProfileView } from '@/components/clients/client-profile-view'
import { toast } from 'sonner'

const updateClientAction = vi.hoisted(() => vi.fn())

vi.mock('@/app/(app)/clients/actions', () => ({
  updateClientAction,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

vi.mock('sonner', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn() })
  return { toast }
})

function makeClient(overrides: Partial<Client> = {}): Client {
  return {
    id: 'client_test',
    organizationId: 'org_test',
    assignedAmId: null,
    assignedDesignerId: null,
    name: 'Test Client',
    businessSummary: null,
    brandVoice: null,
    industry: null,
    location: null,
    phone: null,
    mainCta: null,
    focus1: null,
    focus2: null,
    focus3: null,
    dos: null,
    donts: null,
    postingDays: 'Mon,Wed,Fri',
    postLength: null,
    urls: [],
    targetAudience: null,
    holidayHandling: 'Major-US',
    excludedDates: [],
    assetsFolderUrl: null,
    canvaUrl: null,
    autoCrawl: 'always',
    crawledData: null,
    crawledDataAt: null,
    status: 'active',
    createdAt: new Date(),
    deletedAt: null,
    deletedBy: null,
    onboardingCompletedAt: null,
    clientReviewEnabled: false,
    clientReviewEmail: null,
    ...overrides,
  } as Client
}

describe('ClientProfileView, Workflow section', () => {
  beforeEach(() => {
    updateClientAction.mockReset()
  })

  it('renders the Workflow section with the Client Review label', () => {
    render(<ClientProfileView client={makeClient()} canEdit={true} />)
    expect(screen.getByText('Workflow')).toBeInTheDocument()
    expect(screen.getByText('Client Review')).toBeInTheDocument()
  })

  it('shows the Off pill when clientReviewEnabled is false', () => {
    render(
      <ClientProfileView
        client={makeClient({ clientReviewEnabled: false })}
        canEdit={true}
      />,
    )
    expect(screen.getByText('Off')).toBeInTheDocument()
  })

  it('shows the On pill when clientReviewEnabled is true', () => {
    render(
      <ClientProfileView
        client={makeClient({ clientReviewEnabled: true })}
        canEdit={true}
      />,
    )
    expect(screen.getByText('On')).toBeInTheDocument()
  })

  it('clicking the edit pencil reveals a checkbox seeded from the current value', async () => {
    render(
      <ClientProfileView
        client={makeClient({ clientReviewEnabled: false })}
        canEdit={true}
      />,
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Edit Client Review' }),
    )
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement
    expect(checkbox.checked).toBe(false)
  })

  it('toggling and saving calls updateClientAction with the new boolean', async () => {
    updateClientAction.mockResolvedValue(undefined)
    render(
      <ClientProfileView
        client={makeClient({ clientReviewEnabled: false })}
        canEdit={true}
      />,
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Edit Client Review' }),
    )
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement
    await userEvent.click(checkbox)
    expect(checkbox.checked).toBe(true)

    await userEvent.click(screen.getByRole('button', { name: /^Save$/i }))

    expect(updateClientAction).toHaveBeenCalledTimes(1)
    expect(updateClientAction).toHaveBeenCalledWith('client_test', {
      clientReviewEnabled: true,
    })
  })

  it('canEdit=false hides the edit pencil', () => {
    render(
      <ClientProfileView
        client={makeClient({ clientReviewEnabled: true })}
        canEdit={false}
      />,
    )
    expect(
      screen.queryByRole('button', { name: 'Edit Client Review' }),
    ).not.toBeInTheDocument()
  })
})

describe('ClientProfileView, inline editors focus the caret at the end', () => {
  beforeEach(() => {
    updateClientAction.mockReset()
  })

  it('opens a Focus editor focused with the caret at the end of the text', async () => {
    const text = 'Drive winter promo sign ups'
    render(
      <ClientProfileView client={makeClient({ focus1: text })} canEdit={true} />,
    )
    await userEvent.click(screen.getByRole('button', { name: /Edit Focus 1/i }))
    const textarea = screen.getByDisplayValue(text) as HTMLTextAreaElement
    expect(textarea).toHaveFocus()
    expect(textarea.selectionStart).toBe(text.length)
    expect(textarea.selectionEnd).toBe(text.length)
  })

  it('opens a narrative editor (textarea) focused with the caret at the end', async () => {
    const text = 'A friendly, expert HVAC contractor serving North Florida.'
    render(
      <ClientProfileView
        client={makeClient({ businessSummary: text })}
        canEdit={true}
      />,
    )
    await userEvent.click(
      screen.getByRole('button', { name: /Edit Business summary/i }),
    )
    const textarea = screen.getByDisplayValue(text) as HTMLTextAreaElement
    expect(textarea).toHaveFocus()
    expect(textarea.selectionStart).toBe(text.length)
    expect(textarea.selectionEnd).toBe(text.length)
  })

  it('opens a text input editor focused with the caret at the end', async () => {
    const text = 'Plumbing'
    render(
      <ClientProfileView client={makeClient({ industry: text })} canEdit={true} />,
    )
    await userEvent.click(screen.getByRole('button', { name: /Edit Industry/i }))
    const input = screen.getByDisplayValue(text) as HTMLInputElement
    expect(input).toHaveFocus()
    expect(input.selectionStart).toBe(text.length)
    expect(input.selectionEnd).toBe(text.length)
  })
})

describe('ClientProfileView — client review email', () => {
  beforeEach(() => {
    updateClientAction.mockReset()
  })

  it('shows the stored client review email', () => {
    render(
      <ClientProfileView
        client={makeClient({ clientReviewEmail: 'jane@client.com' })}
        canEdit={true}
      />,
    )
    expect(screen.getByText('Client review email')).toBeInTheDocument()
    expect(screen.getByText('jane@client.com')).toBeInTheDocument()
  })

  it('shows the edit button for clientReviewEmail when canEdit is true', () => {
    render(
      <ClientProfileView
        client={makeClient({ clientReviewEmail: null })}
        canEdit={true}
      />,
    )
    expect(
      screen.getByRole('button', { name: /Edit Client review email/i }),
    ).toBeInTheDocument()
  })

  it('saves an edited email via updateClientAction', async () => {
    updateClientAction.mockResolvedValue(undefined)
    render(
      <ClientProfileView
        client={makeClient({ clientReviewEmail: null })}
        canEdit={true}
      />,
    )
    await userEvent.click(
      screen.getByRole('button', { name: /Edit Client review email/i }),
    )
    const input = screen.getByRole('textbox') as HTMLInputElement
    await userEvent.clear(input)
    await userEvent.type(input, 'new@client.com')
    await userEvent.keyboard('{Enter}')
    expect(updateClientAction).toHaveBeenCalledTimes(1)
    expect(updateClientAction).toHaveBeenCalledWith('client_test', {
      clientReviewEmail: 'new@client.com',
    })
  })
})

describe('ClientProfileView — draft stays in sync with upstream value', () => {
  beforeEach(() => {
    updateClientAction.mockReset()
  })

  it('reflects a new upstream value when not editing (draft baseline resyncs)', () => {
    const { rerender } = render(
      <ClientProfileView client={makeClient({ industry: 'Plumbing' })} canEdit={true} />,
    )
    expect(screen.getByText('Plumbing')).toBeInTheDocument()

    // Upstream value changes (e.g. after a save / another editor) while this
    // field is not being edited.
    rerender(
      <ClientProfileView client={makeClient({ industry: 'HVAC' })} canEdit={true} />,
    )
    expect(screen.getByText('HVAC')).toBeInTheDocument()
    expect(screen.queryByText('Plumbing')).not.toBeInTheDocument()
  })

  it('does NOT clobber an in-progress draft when the upstream value changes mid-edit', async () => {
    const { rerender } = render(
      <ClientProfileView client={makeClient({ industry: 'Plumbing' })} canEdit={true} />,
    )
    await userEvent.click(screen.getByRole('button', { name: /Edit Industry/i }))
    const input = screen.getByDisplayValue('Plumbing') as HTMLInputElement
    await userEvent.clear(input)
    await userEvent.type(input, 'Roofing')

    // Upstream value lands while the user is still editing.
    rerender(
      <ClientProfileView client={makeClient({ industry: 'HVAC' })} canEdit={true} />,
    )

    // The in-progress draft survives; it is not reset to the new upstream value.
    expect(screen.getByDisplayValue('Roofing')).toBeInTheDocument()
  })
})

/**
 * Assets folder feedback on save. Added 2026-08-31 after Elevated Tree
 * Solutions, where a read-only folder in the client's personal Drive was
 * accepted with no feedback at all and only surfaced weeks later as a failed
 * relay upload. The AM has the correct link in hand at exactly this moment.
 */
describe('ClientProfileView — assets folder feedback', () => {
  beforeEach(() => {
    updateClientAction.mockReset()
    vi.mocked(toast.error).mockReset()
    vi.mocked(toast.warning).mockReset()
  })

  async function editAssetsFolder(value: string) {
    render(<ClientProfileView client={makeClient({ assetsFolderUrl: null })} canEdit={true} />)
    await userEvent.click(screen.getByRole('button', { name: /Edit Assets folder/i }))
    const input = screen.getByRole('textbox') as HTMLInputElement
    await userEvent.clear(input)
    await userEvent.type(input, value)
    await userEvent.keyboard('{Enter}')
  }

  it('warns the AM when the saved folder is read only for Relay', async () => {
    updateClientAction.mockResolvedValue({
      assetsFolder: {
        status: 'read-only',
        name: 'Ad Photos',
        ownerEmail: 'elevatedtreesolutions23@gmail.com',
      },
    })

    await editAssetsFolder('https://drive.google.com/drive/folders/bad')

    expect(toast.error).toHaveBeenCalled()
    const text = String(vi.mocked(toast.error).mock.calls.at(-1)?.[0])
    expect(text).toContain('Ad Photos')
    expect(text).toMatch(/read only/i)
  })

  it('stays quiet when the saved folder is a writable Shared Drive folder', async () => {
    updateClientAction.mockResolvedValue({
      assetsFolder: { status: 'ok', name: 'Royal Oak Tree Service', inSharedDrive: true },
    })

    await editAssetsFolder('https://drive.google.com/drive/folders/good')

    expect(toast.error).not.toHaveBeenCalled()
    expect(toast.warning).not.toHaveBeenCalled()
  })

  it('does not report anything for an edit that returns no folder verdict', async () => {
    updateClientAction.mockResolvedValue({})

    await editAssetsFolder('https://drive.google.com/drive/folders/x')

    expect(toast.error).not.toHaveBeenCalled()
    expect(toast.warning).not.toHaveBeenCalled()
  })
})
