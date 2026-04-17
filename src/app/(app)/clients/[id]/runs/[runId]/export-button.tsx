'use client'

import { Button } from '@/components/ui/button'

type ExportPost = {
  date: string
  caption: string
  hashtags: string
  graphicHook: string
  designerNotes: string
  status: string
}

export function ExportButton({
  posts,
  filename,
}: {
  posts: ExportPost[]
  filename: string
}) {
  const handleExport = () => {
    const headers = ['Date', 'Caption', 'Hashtags', 'Graphic Hook', 'Designer Notes', 'Status']
    const rows = posts.map((p) => [
      p.date,
      escapeCsv(p.caption),
      escapeCsv(p.hashtags),
      escapeCsv(p.graphicHook),
      escapeCsv(p.designerNotes),
      p.status,
    ])

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
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

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}
