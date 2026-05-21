import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { HeaderBell } from '@/components/notifications/header-bell'
import { NotificationProvider } from '@/components/notifications/notification-provider'

vi.spyOn(global, 'fetch').mockResolvedValue(
  new Response(JSON.stringify({ count: 0, items: [] }), { status: 200 }),
)

function renderBell(count: number) {
  vi.spyOn(global, 'fetch').mockResolvedValueOnce(
    new Response(JSON.stringify({ count, items: [] }), { status: 200 }),
  )
  return render(
    <NotificationProvider>
      <HeaderBell />
    </NotificationProvider>,
  )
}

describe('HeaderBell badge', () => {
  it('shows no badge when count is 0', async () => {
    const { container } = renderBell(0)
    await screen.findByRole('button', { name: /Notifications, 0 unread/i })
    expect(container.querySelector('[data-testid="bell-badge"]')).toBeNull()
  })

  it('shows numeric badge for 1', async () => {
    renderBell(1)
    await screen.findByText('1')
  })

  it('shows numeric badge for 5', async () => {
    renderBell(5)
    await screen.findByText('5')
  })

  it('shows numeric badge for 9', async () => {
    renderBell(9)
    await screen.findByText('9')
  })

  it('shows "9+" for counts >= 10', async () => {
    renderBell(10)
    await screen.findByText('9+')
  })

  it('shows "9+" for counts >> 10', async () => {
    renderBell(42)
    await screen.findByText('9+')
  })

  it('toggles ARIA expanded on click', async () => {
    renderBell(3)
    const btn = await screen.findByRole('button', { name: /Notifications, 3 unread/i })
    expect(btn.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(btn)
    expect(btn.getAttribute('aria-expanded')).toBe('true')
  })
})
