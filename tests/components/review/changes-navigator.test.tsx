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

  it('Next disables after stepping to the last unresolved item', async () => {
    const user = userEvent.setup()
    render(<ChangesNavigator items={items} filterOn={false} onToggleFilter={vi.fn()} onNavigate={vi.fn()} />)
    const next = screen.getByTestId('changes-navigator-next') as HTMLButtonElement
    await user.click(next) // -> post-1 (idx 0)
    await user.click(next) // -> post-2 (idx 2), the last unresolved
    expect(next.disabled).toBe(true)
  })

  it('all-resolved list: Next disabled immediately + counter shows all resolved', () => {
    const allResolved: NavItem[] = [
      { id: 'x', anchorKey: 'post-x', resolved: true },
      { id: 'y', anchorKey: 'post-y', resolved: true },
    ]
    render(<ChangesNavigator items={allResolved} filterOn={false} onToggleFilter={vi.fn()} onNavigate={vi.fn()} />)
    expect((screen.getByTestId('changes-navigator-next') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByTestId('changes-navigator-counter').textContent).toMatch(/2 of 2 resolved/i)
  })

  it('empty state: 0 of 0, Next disabled', () => {
    render(<ChangesNavigator items={[]} filterOn={false} onToggleFilter={vi.fn()} onNavigate={vi.fn()} />)
    expect(screen.getByTestId('changes-navigator-counter').textContent).toMatch(/0 of 0/i)
    expect((screen.getByTestId('changes-navigator-next') as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('ChangesNavigator navigate mode', () => {
  const navItems: NavItem[] = [
    { id: 'p1', anchorKey: 'post-1', resolved: false },
    { id: 'p2', anchorKey: 'post-2', resolved: true },
    { id: 'p3', anchorKey: 'post-3', resolved: false },
  ]

  it('hides the filter toggle in navigate mode', () => {
    render(<ChangesNavigator items={navItems} filterOn={false} onToggleFilter={vi.fn()} onNavigate={vi.fn()} mode="navigate" />)
    expect(screen.queryByTestId('changes-navigator-filter')).not.toBeInTheDocument()
  })

  it('counter reads "X of Y" and Next walks ALL items in order (ignores resolved)', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()
    render(<ChangesNavigator items={navItems} filterOn={false} onToggleFilter={vi.fn()} onNavigate={onNavigate} mode="navigate" />)
    const next = screen.getByTestId('changes-navigator-next')
    await user.click(next)
    expect(onNavigate).toHaveBeenLastCalledWith('post-1')
    expect(screen.getByTestId('changes-navigator-counter').textContent).toMatch(/1 of 3/i)
    await user.click(next)
    expect(onNavigate).toHaveBeenLastCalledWith('post-2') // walks the resolved one too
    expect(screen.getByTestId('changes-navigator-counter').textContent).toMatch(/2 of 3/i)
  })

  it('Next disables at the last item in navigate mode', async () => {
    const user = userEvent.setup()
    render(<ChangesNavigator items={navItems} filterOn={false} onToggleFilter={vi.fn()} onNavigate={vi.fn()} mode="navigate" />)
    const next = screen.getByTestId('changes-navigator-next') as HTMLButtonElement
    await user.click(next); await user.click(next); await user.click(next)
    expect(next.disabled).toBe(true)
  })

  it('REGRESSION: resolve mode is unchanged (default) — counter says "resolved", Next skips resolved', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()
    render(<ChangesNavigator items={navItems} filterOn={false} onToggleFilter={vi.fn()} onNavigate={onNavigate} />)
    expect(screen.getByTestId('changes-navigator-counter').textContent).toMatch(/1 of 3 resolved/i)
    expect(screen.getByTestId('changes-navigator-filter')).toBeInTheDocument()
    await user.click(screen.getByTestId('changes-navigator-next'))
    expect(onNavigate).toHaveBeenLastCalledWith('post-1')
    await user.click(screen.getByTestId('changes-navigator-next'))
    expect(onNavigate).toHaveBeenLastCalledWith('post-3') // skips resolved p2
  })
})
