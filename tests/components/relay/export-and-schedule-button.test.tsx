import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ExportAndScheduleButton } from '@/components/relay/export-and-schedule-button'
import { NECTR_CRM_URL } from '@/lib/nectr'
import { uploadDriveGraphicsAction } from '@/server/actions/relay'
import { toast } from 'sonner'

vi.mock('@/server/actions/relay', () => ({ uploadDriveGraphicsAction: vi.fn() }))

vi.mock('sonner', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() })
  return { toast }
})

const POSTS = [
  { date: '2026-05-01', caption: 'Hello', hashtags: '#a #b', mediaUrl: 'http://x/y.jpg' },
]

function clickIt() {
  fireEvent.click(screen.getByRole('button', { name: /export csv & go to nectrcrm/i }))
}

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
    vi.mocked(uploadDriveGraphicsAction).mockResolvedValue({
      status: 'ok',
      folderUrl: 'https://drive.google.com/drive/folders/f1',
      month: 'May 2026',
      uploaded: 1,
      overwritten: 0,
      failed: [],
    })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('downloads the CSV then opens NectrCRM in a new tab', () => {
    render(<ExportAndScheduleButton posts={POSTS} filename="acme-2026-05" batchId="b1" />)
    clickIt()
    expect(clickSpy).toHaveBeenCalled() // download triggered
    expect(openSpy).toHaveBeenCalledWith(
      NECTR_CRM_URL,
      '_blank',
      'noopener,noreferrer',
    )
    // Download must fire BEFORE the redirect (the anchor click before window.open).
    expect(clickSpy.mock.invocationCallOrder[0]).toBeLessThan(
      openSpy.mock.invocationCallOrder[0],
    )
  })

  /**
   * The Drive archive moved here from Finish on 2026-08-31. This click is the
   * one that actually schedules the posts, so it is where the graphics should
   * be archived.
   */
  it('archives the graphics to Drive for this batch', async () => {
    render(<ExportAndScheduleButton posts={POSTS} filename="acme-2026-05" batchId="b1" />)
    clickIt()
    await waitFor(() =>
      expect(uploadDriveGraphicsAction).toHaveBeenCalledWith({ batchId: 'b1' }),
    )
  })

  it('opens NectrCRM before waiting on the upload, so the popup is not blocked', async () => {
    // window.open must stay inside the user gesture. Awaiting a server action
    // first would put it in a later task and browsers would block the tab.
    let resolveUpload: (v: unknown) => void = () => {}
    vi.mocked(uploadDriveGraphicsAction).mockReturnValue(
      new Promise((r) => {
        resolveUpload = r
      }) as never,
    )

    render(<ExportAndScheduleButton posts={POSTS} filename="acme-2026-05" batchId="b1" />)
    clickIt()

    expect(openSpy).toHaveBeenCalled()
    resolveUpload({ status: 'skipped', reason: 'no-images' })
  })

  it('confirms the archive when it succeeds', async () => {
    render(<ExportAndScheduleButton posts={POSTS} filename="acme-2026-05" batchId="b1" />)
    clickIt()
    await waitFor(() => expect(toast.success).toHaveBeenCalled())
    expect(String(vi.mocked(toast.success).mock.calls.at(-1)?.[0])).toContain('May 2026')
  })

  it('reports a read-only folder with a retry, naming the field to fix', async () => {
    vi.mocked(uploadDriveGraphicsAction).mockResolvedValue({
      status: 'failed',
      folderUrl: null,
      month: 'May 2026',
      uploaded: 0,
      overwritten: 0,
      failed: [
        {
          name: '(folder May 2026)',
          reason: 'The user does not have sufficient permissions for this file.',
        },
      ],
    })

    render(<ExportAndScheduleButton posts={POSTS} filename="acme-2026-05" batchId="b1" />)
    clickIt()

    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    const [text, opts] = vi.mocked(toast.error).mock.calls.at(-1) ?? []
    expect(String(text)).toContain('Assets folder')
    expect((opts as { action?: { label: string } })?.action?.label).toBe('Retry')
  })

  it('never lets a Drive failure break the scheduling handoff', async () => {
    vi.mocked(uploadDriveGraphicsAction).mockRejectedValue(new Error('drive down'))
    render(<ExportAndScheduleButton posts={POSTS} filename="acme-2026-05" batchId="b1" />)
    clickIt()
    // The CSV downloaded and NectrCRM opened regardless.
    expect(clickSpy).toHaveBeenCalled()
    expect(openSpy).toHaveBeenCalled()
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
  })
})
