import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ExportAndScheduleButton } from '@/components/relay/export-and-schedule-button'
import { NECTR_CRM_URL } from '@/lib/nectr'

const POSTS = [
  { date: '2026-05-01', caption: 'Hello', hashtags: '#a #b', mediaUrl: 'http://x/y.jpg' },
]

describe('ExportAndScheduleButton', () => {
  let openSpy: ReturnType<typeof vi.fn>
  let clickSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    openSpy = vi.fn()
    vi.stubGlobal('open', openSpy)
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:mock'),
      revokeObjectURL: vi.fn(),
    })
    clickSpy = vi.fn()
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = document.createElementNS(
        'http://www.w3.org/1999/xhtml',
        tag,
      ) as HTMLElement
      Object.assign(el, { click: clickSpy })
      return el
    })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('downloads the CSV then opens NectrCRM in a new tab', () => {
    render(<ExportAndScheduleButton posts={POSTS} filename="acme-2026-05" />)
    fireEvent.click(
      screen.getByRole('button', { name: /export csv & go to nectrcrm/i }),
    )
    expect(clickSpy).toHaveBeenCalled() // download triggered
    expect(openSpy).toHaveBeenCalledWith(
      NECTR_CRM_URL,
      '_blank',
      'noopener,noreferrer',
    )
  })
})
