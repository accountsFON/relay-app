import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MarkupOverlay } from '@/components/preview/markup-overlay'
import { PinPopover } from '@/components/preview/pin-popover'

function mockOverlayRect() {
  // Force a known 400x400 layout for the overlay so click coords convert
  // predictably to percentages.
  vi.spyOn(HTMLDivElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 400,
    bottom: 400,
    width: 400,
    height: 400,
    toJSON() {
      return {}
    },
  } as DOMRect)
}

describe('MarkupOverlay', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('drops a pin at correct percentage coords on overlay click', async () => {
    mockOverlayRect()
    const onCreatePin = vi.fn()
    const user = userEvent.setup()

    render(
      <div style={{ position: 'relative', width: 400, height: 400 }}>
        <MarkupOverlay
          existingPins={[]}
          onPinClick={() => {}}
          onCreatePin={onCreatePin}
        />
      </div>,
    )

    const overlay = screen.getByTestId('markup-overlay')
    // userEvent.pointer with explicit client coords , click center-right.
    await user.pointer({
      target: overlay,
      coords: { clientX: 300, clientY: 100 },
      keys: '[MouseLeft]',
    })

    expect(onCreatePin).toHaveBeenCalledTimes(1)
    const [x, y] = onCreatePin.mock.calls[0]
    // 300/400 = 75%, 100/400 = 25%
    expect(x).toBeCloseTo(75, 5)
    expect(y).toBeCloseTo(25, 5)
  })

  it('renders existing pins with their numbered badges', () => {
    render(
      <div style={{ position: 'relative', width: 400, height: 400 }}>
        <MarkupOverlay
          existingPins={[
            { id: 'thread-a', x: 10, y: 20, status: 'open' },
            { id: 'thread-b', x: 80, y: 80, status: 'resolved' },
          ]}
          onPinClick={() => {}}
          onCreatePin={() => {}}
        />
      </div>,
    )

    const pins = screen.getAllByTestId('markup-overlay-pin')
    expect(pins).toHaveLength(2)
    expect(pins[0].textContent).toBe('1')
    expect(pins[0].getAttribute('data-thread-id')).toBe('thread-a')
    expect(pins[0].getAttribute('data-status')).toBe('open')
    expect(pins[1].textContent).toBe('2')
    expect(pins[1].getAttribute('data-thread-id')).toBe('thread-b')
    expect(pins[1].getAttribute('data-status')).toBe('resolved')
  })

  it('calls onPinClick (not onCreatePin) when an existing pin is clicked', async () => {
    mockOverlayRect()
    const onPinClick = vi.fn()
    const onCreatePin = vi.fn()
    const user = userEvent.setup()

    render(
      <div style={{ position: 'relative', width: 400, height: 400 }}>
        <MarkupOverlay
          existingPins={[{ id: 'thread-a', x: 50, y: 50, status: 'open' }]}
          onPinClick={onPinClick}
          onCreatePin={onCreatePin}
        />
      </div>,
    )

    const pin = screen.getByTestId('markup-overlay-pin')
    await user.click(pin)

    expect(onPinClick).toHaveBeenCalledTimes(1)
    expect(onPinClick).toHaveBeenCalledWith('thread-a')
    // The click was stopped from bubbling to the overlay.
    expect(onCreatePin).not.toHaveBeenCalled()
  })

  it('popover position stays inside the viewport when anchor is at the bottom-right edge', () => {
    // jsdom default: innerWidth=1024, innerHeight=768. Anchor near corner.
    render(
      <PinPopover
        thread={{
          id: 'thread-a',
          pin: { kind: 'image', x: 95, y: 95 },
          status: 'open',
          firstComment: {
            author: { kind: 'am', userId: 'u1', name: 'Mollie' },
            body: 'Tighten crop.',
            createdAt: new Date('2026-05-16T12:00:00Z'),
          },
          comments: [
            {
              author: { kind: 'am', userId: 'u1', name: 'Mollie' },
              body: 'Tighten crop.',
              createdAt: new Date('2026-05-16T12:00:00Z'),
            },
          ],
          commentCount: 1,
        }}
        anchor={{ x: 1020, y: 760 }}
        mode="internal"
        onComment={async () => {}}
        onResolve={async () => {}}
      />,
    )

    const pop = screen.getByTestId('pin-popover')
    const style = pop.style
    const left = parseInt(style.left, 10)
    const top = parseInt(style.top, 10)
    const width = parseInt(style.width, 10) || 320

    expect(Number.isFinite(left)).toBe(true)
    expect(Number.isFinite(top)).toBe(true)
    // Popover must not overflow the viewport (jsdom default 1024x768).
    expect(left).toBeGreaterThanOrEqual(0)
    expect(top).toBeGreaterThanOrEqual(0)
    expect(left + width).toBeLessThanOrEqual(1024)
    // Top must be inside viewport (height is browser-measured; just verify
    // the flip pushed it above the anchor when near bottom edge).
    expect(top).toBeLessThan(760)
  })
})
