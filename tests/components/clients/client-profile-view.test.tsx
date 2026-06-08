import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Client } from '@prisma/client'
import { ClientProfileView } from '@/components/clients/client-profile-view'

const updateClientAction = vi.hoisted(() => vi.fn())

vi.mock('@/app/(app)/clients/actions', () => ({
  updateClientAction,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

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
      screen.getByRole('button', { name: /Edit Client Review/i }),
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
      screen.getByRole('button', { name: /Edit Client Review/i }),
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
      screen.queryByRole('button', { name: /Edit Client Review/i }),
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
