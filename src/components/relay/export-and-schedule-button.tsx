'use client'

import { CalendarClock, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toSocialPlannerCsv, type SocialPlannerPost } from '@/lib/social-planner-csv'
import { NECTR_CRM_URL } from '@/lib/nectr'

/**
 * Scheduling-step action (P2 #30): one click exports the Social Planner CSV,
 * then opens NectrCRM in a new tab (the relay stays open behind it) so the AM
 * uploads the CSV and schedules. Replaces the old always-on toolbar Export CSV
 * button; lives in the next-steps banner at Scheduling.
 */
export function ExportAndScheduleButton({
  posts,
  filename,
}: {
  posts: SocialPlannerPost[]
  filename: string
}) {
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
  }

  return (
    <Button onClick={handleClick} data-tour-anchor="schedule-export">
      <CalendarClock />
      <span>Export CSV &amp; go to NectrCRM</span>
      <ExternalLink className="opacity-60" />
    </Button>
  )
}
