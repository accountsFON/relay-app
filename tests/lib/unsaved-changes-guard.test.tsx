import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { NavigationGuard } from '@/lib/unsaved-changes'

afterEach(() => {
  vi.restoreAllMocks()
})

function clickAnchor(href: string, attrs: Record<string, string> = {}) {
  const a = document.createElement('a')
  a.setAttribute('href', href)
  a.textContent = 'go'
  for (const [k, v] of Object.entries(attrs)) a.setAttribute(k, v)
  document.body.appendChild(a)
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
  a.dispatchEvent(event)
  a.remove()
  return event
}

describe('NavigationGuard', () => {
  it('blocks an internal link click when armed and the user declines', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<NavigationGuard hasUnsavedChanges />)
    const event = clickAnchor('/clients/123')
    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
  })

  it('allows an internal link click when the user confirms', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<NavigationGuard hasUnsavedChanges />)
    const event = clickAnchor('/dashboard')
    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(false)
  })

  it('does nothing when not armed', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<NavigationGuard hasUnsavedChanges={false} />)
    const event = clickAnchor('/clients/123')
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it('ignores external links, new-tab links, and modifier clicks', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<NavigationGuard hasUnsavedChanges />)
    expect(clickAnchor('https://example.com/').defaultPrevented).toBe(false)
    expect(clickAnchor('/x', { target: '_blank' }).defaultPrevented).toBe(false)
    expect(clickAnchor('/x', { download: '' }).defaultPrevented).toBe(false)
    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('re-arms the back-button trap when the user declines a popstate', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const pushSpy = vi.spyOn(window.history, 'pushState')
    render(<NavigationGuard hasUnsavedChanges />)
    pushSpy.mockClear()
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(pushSpy).toHaveBeenCalled()
  })

  it('navigates back when the user confirms a popstate', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    render(<NavigationGuard hasUnsavedChanges />)
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(backSpy).toHaveBeenCalled()
  })

  it('stops prompting once disarmed (true -> false)', () => {
    vi.spyOn(window.history, 'back').mockImplementation(() => {})
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { rerender } = render(<NavigationGuard hasUnsavedChanges />)
    rerender(<NavigationGuard hasUnsavedChanges={false} />)
    const event = clickAnchor('/clients/123')
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it('allows modifier-key clicks (e.g. Cmd+click opens a new tab)', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<NavigationGuard hasUnsavedChanges />)
    const a = document.createElement('a')
    a.setAttribute('href', '/clients/123')
    document.body.appendChild(a)
    const event = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      button: 0,
      metaKey: true,
    })
    a.dispatchEvent(event)
    a.remove()
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it('ignores same-page hash links', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<NavigationGuard hasUnsavedChanges />)
    const event = clickAnchor(window.location.pathname + '#section')
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })
})
