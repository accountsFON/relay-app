'use client'

import { CalendarClock, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { SimpleTooltip, InfoHint } from '@/components/relay/relay-tooltips'
import { toSocialPlannerCsv, type SocialPlannerPost } from '@/lib/social-planner-csv'
import { NECTR_CRM_URL } from '@/lib/nectr'
import { uploadDriveGraphicsAction } from '@/server/actions/relay'
import { driveUploadMessage } from '@/lib/drive-upload-message'

/**
 * Scheduling-step action (P2 #30): one click exports the Social Planner CSV,
 * then opens NectrCRM in a new tab (the relay stays open behind it) so the AM
 * uploads the CSV and schedules. Replaces the old always-on toolbar Export CSV
 * button; lives in the next-steps banner at Scheduling.
 *
 * Since 2026-08-31 the same click ALSO archives the post graphics into the
 * client's Google Drive. That side effect used to hang off Finish, and this is
 * the click that actually does the scheduling work, so the graphics land in
 * Drive at the moment the AM is scheduling rather than minutes later when they
 * close out the relay. The Scheduling checklist carries a matching human
 * verification item ("Check that the designs got uploaded to the Google
 * Drive"), which is the safety net now that Finish no longer archives anything.
 *
 * Ordering matters: the CSV download and `window.open` both run SYNCHRONOUSLY
 * inside the click handler, before the server action is awaited. Awaiting first
 * would push `window.open` into a later task and browsers would treat the new
 * tab as an unrequested popup and block it.
 */
export function ExportAndScheduleButton({
  posts,
  filename,
  batchId,
}: {
  posts: SocialPlannerPost[]
  filename: string
  batchId: string
}) {
  function archiveGraphics() {
    // Fire and forget by design: the AM has already been handed off to
    // NectrCRM, so this reports through a toast and can never block or undo
    // the scheduling handoff.
    void uploadDriveGraphicsAction({ batchId })
      .then((res) => notifyDriveResult(res))
      .catch(() => notifyDriveResult(null))
  }

  function notifyDriveResult(res: Parameters<typeof driveUploadMessage>[0]) {
    const msg = driveUploadMessage(res)
    if (!msg) return
    const retry = msg.retryable
      ? { action: { label: 'Retry', onClick: () => archiveGraphics() } }
      : undefined

    if (msg.tone === 'success') {
      const url = res && 'folderUrl' in res ? res.folderUrl : null
      toast.success(
        msg.text,
        url
          ? { action: { label: 'Open folder', onClick: () => window.open(url, '_blank') } }
          : undefined,
      )
      return
    }
    if (msg.tone === 'error') {
      toast.error(msg.text, retry)
      return
    }
    toast(msg.text)
  }

  const handleClick = () => {
    const csv = toSocialPlannerCsv(posts)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${filename}.csv`
    link.click()
    URL.revokeObjectURL(url)
    window.open(NECTR_CRM_URL, '_blank', 'noopener,noreferrer')

    // Only after the gesture-bound work above.
    archiveGraphics()
  }

  return (
    <SimpleTooltip content="Download the Social Planner CSV, archive the graphics to Google Drive, and open NectrCRM to schedule">
      <Button onClick={handleClick} data-tour-anchor="schedule-export">
        <CalendarClock />
        <span>Export CSV &amp; go to NectrCRM</span>
        <ExternalLink className="opacity-60" />
        <InfoHint />
      </Button>
    </SimpleTooltip>
  )
}
