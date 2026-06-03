'use client'

import { Button } from '@/components/ui/button'
import { toSocialPlannerCsv, type SocialPlannerPost } from '@/lib/social-planner-csv'

export type ExportPost = SocialPlannerPost

export function ExportButton({
  posts,
  filename,
}: {
  posts: ExportPost[]
  filename: string
}) {
  const handleExport = () => {
    const csv = toSocialPlannerCsv(posts)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${filename}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Button variant="outline" onClick={handleExport}>
      Export CSV
    </Button>
  )
}
