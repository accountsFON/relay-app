import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChangesNavigator, type NavItem } from '@/components/review/changes-navigator'

const items: NavItem[] = [
  { id: 'a', anchorKey: 'post-1', resolved: false },
  { id: 'b', anchorKey: 'post-1', resolved: true },
  { id: 'c', anchorKey: 'post-2', resolved: false },
]

describe('ChangesNavigator', () => {
  it('shows an "X of Y resolved" counter', () => {
    render(<ChangesNavigator items={items} filterOn={false} onToggleFilter={vi.fn()} onNavigate={vi.fn()} />)
    expect(screen.getByTestId('changes-navigator-counter').textContent).toMatch(/1 of 3 resolved/i)
  })

  it('Next scrolls to the first unresolved item, then the next unresolved (skipping resolved)', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()
    render(<ChangesNavigator items={items} filterOn={false} onToggleFilter={vi.fn()} onNavigate={onNavigate} />)
    const next = screen.getByTestId('changes-navigator-next')
    await user.click(next)
    expect(onNavigate).toHaveBeenLastCalledWith('post-1')
    await user.click(next)
    expect(onNavigate).toHaveBeenLastCalledWith('post-2')
  })

  it('Prev is disabled at the start (stop at ends)', () => {
    render(<ChangesNavigator items={items} filterOn={false} onToggleFilter={vi.fn()} onNavigate={vi.fn()} />)
    expect((screen.getByTestId('changes-navigator-prev') as HTMLButtonElement).disabled).toBe(true)
  })

  it('the filter toggle calls onToggleFilter', async () => {
    const user = userEvent.setup()
    const onToggleFilter = vi.fn()
    render(<ChangesNavigator items={items} filterOn={false} onToggleFilter={onToggleFilter} onNavigate={vi.fn()} />)
    await user.click(screen.getByTestId('changes-navigator-filter'))
    expect(onToggleFilter).toHaveBeenCalledOnce()
  })

  it('empty state: 0 of 0, Next disabled', () => {
    render(<ChangesNavigator items={[]} filterOn={false} onToggleFilter={vi.fn()} onNavigate={vi.fn()} />)
    expect(screen.getByTestId('changes-navigator-counter').textContent).toMatch(/0 of 0/i)
    expect((screen.getByTestId('changes-navigator-next') as HTMLButtonElement).disabled).toBe(true)
  })
})
