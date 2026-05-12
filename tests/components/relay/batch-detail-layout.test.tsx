/**
 * Wave 2F: batch detail page surfaces the AM + Designer team strip in its
 * header and pins the client thread (ActivityEvents scoped to the client) as
 * a sticky right rail. These tests render the same JSX shape the server
 * component emits so we cover the layout contract without booting Next.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { ClientTeamHeader } from '@/components/clients/client-team-header'
import { ActivityThread } from '@/components/activity/activity-thread'
import type { ActivityEventView } from '@/components/activity/types'

vi.mock('@/app/(app)/admin/clients/actions', () => ({
  setClientPrimary: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock('@/app/(app)/clients/[id]/activity/actions', () => ({
  postCommentAction: vi.fn(),
}))

const morgan = { id: 'u1', name: 'Morgan AM', avatarUrl: null }
const dakota = { id: 'u2', name: 'Dakota Designer', avatarUrl: null }

function makeCommentEvent(overrides: Partial<ActivityEventView> = {}): ActivityEventView {
  return {
    id: 'evt1',
    clientId: 'c1',
    runId: null,
    postId: null,
    kind: 'comment',
    createdAt: new Date('2026-05-01T15:00:00Z'),
    actor: { id: 'u1', name: 'Morgan AM', avatarUrl: null },
    payload: { kind: 'comment', body: 'Looks good to me', mentionedUserIds: [] },
    ...overrides,
  }
}

describe('Batch detail header: team strip', () => {
  it('renders AM and Designer pills above the batch body', () => {
    render(
      <ClientTeamHeader
        clientId="c1"
        clientName="Cedar Creek Dental"
        am={morgan}
        designer={dakota}
        amOptions={[{ id: 'u1', name: 'Morgan AM' }]}
        designerOptions={[{ id: 'u2', name: 'Dakota Designer' }]}
        canManage={false}
      />,
    )

    const section = screen.getByRole('region', { name: /client team/i })
    expect(within(section).getByText(/account manager/i)).toBeInTheDocument()
    expect(within(section).getByText('Morgan AM')).toBeInTheDocument()
    expect(within(section).getByText(/^designer$/i)).toBeInTheDocument()
    expect(within(section).getByText('Dakota Designer')).toBeInTheDocument()
  })

  it('exposes reassign dropdowns when viewer can manage the team', () => {
    render(
      <ClientTeamHeader
        clientId="c1"
        clientName="Cedar Creek Dental"
        am={morgan}
        designer={dakota}
        amOptions={[
          { id: 'u1', name: 'Morgan AM' },
          { id: 'u3', name: 'Riley Replacement' },
        ]}
        designerOptions={[
          { id: 'u2', name: 'Dakota Designer' },
          { id: 'u4', name: 'Quinn Designer' },
        ]}
        canManage
      />,
    )

    expect(screen.getByLabelText(/reassign account manager/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/reassign designer/i)).toBeInTheDocument()
  })
})

describe('Batch detail: sticky client thread rail', () => {
  function renderRail(props: { events: ActivityEventView[]; hideComposer?: boolean }) {
    return render(
      <aside
        aria-label="Client thread"
        data-testid="client-thread-rail"
        className="lg:sticky lg:top-4 lg:self-start lg:order-3 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto rounded-2xl bg-card p-4"
      >
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-3">
          Client thread
        </h2>
        <ActivityThread
          clientId="c1"
          events={props.events}
          hideComposer={props.hideComposer}
        />
      </aside>,
    )
  }

  it('renders the thread heading and the client scoped ActivityEvents passed in', () => {
    renderRail({
      events: [
        makeCommentEvent({ id: 'evt1', payload: { kind: 'comment', body: 'Looks good to me', mentionedUserIds: [] } }),
        makeCommentEvent({ id: 'evt2', payload: { kind: 'comment', body: 'Send to client', mentionedUserIds: [] } }),
      ],
    })

    const rail = screen.getByTestId('client-thread-rail')
    expect(within(rail).getByText(/client thread/i)).toBeInTheDocument()
    expect(within(rail).getByText('Looks good to me')).toBeInTheDocument()
    expect(within(rail).getByText('Send to client')).toBeInTheDocument()
  })

  it('applies sticky positioning classes on lg+ so the rail pins on scroll', () => {
    renderRail({ events: [] })
    const rail = screen.getByTestId('client-thread-rail')
    expect(rail.className).toMatch(/lg:sticky/)
    expect(rail.className).toMatch(/lg:top-4/)
    expect(rail.className).toMatch(/lg:max-h-/)
    expect(rail.className).toMatch(/lg:overflow-y-auto/)
  })

  it('shows the composer when canEdit is allowed (hideComposer=false)', () => {
    renderRail({ events: [], hideComposer: false })
    const rail = screen.getByTestId('client-thread-rail')
    // CommentComposer ships a textarea + Send button.
    expect(within(rail).getByRole('textbox')).toBeInTheDocument()
  })

  it('hides the composer when the viewer cannot edit', () => {
    renderRail({ events: [], hideComposer: true })
    const rail = screen.getByTestId('client-thread-rail')
    expect(within(rail).queryByRole('textbox')).not.toBeInTheDocument()
  })
})
