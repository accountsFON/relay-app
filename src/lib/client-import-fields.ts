/**
 * Pure metadata for the client CSV importer — no runtime deps, so it is safe to
 * import from both the server parser (`@/server/csv/parseClientsCsv`) and the
 * client-side import UI (the column-mapping step).
 */

export const CLIENT_IMPORT_FIELDS = [
  { field: 'name', label: 'Name', required: true },
  { field: 'businessSummary', label: 'Business summary', required: false },
  { field: 'brandVoice', label: 'Brand voice', required: false },
  { field: 'industry', label: 'Industry', required: false },
  { field: 'location', label: 'Location / city', required: false },
  { field: 'phone', label: 'Phone', required: false },
  { field: 'mainCta', label: 'Main CTA', required: false },
  { field: 'focus1', label: 'Focus 1', required: false },
  { field: 'focus2', label: 'Focus 2', required: false },
  { field: 'focus3', label: 'Focus 3', required: false },
  { field: 'dos', label: "Do's", required: false },
  { field: 'donts', label: "Don'ts", required: false },
  { field: 'postingDays', label: 'Posting days', required: false },
  { field: 'postLength', label: 'Post length', required: false },
  { field: 'urls', label: 'URLs', required: false },
  { field: 'targetAudience', label: 'Target audience', required: false },
  { field: 'holidayHandling', label: 'Holiday handling', required: false },
  { field: 'excludedDates', label: 'Excluded dates', required: false },
  { field: 'assetsFolderUrl', label: 'Assets folder URL', required: false },
  { field: 'autoCrawl', label: 'Auto crawl', required: false },
  { field: 'assignedAmId', label: 'Assigned AM (Relay user ID)', required: false },
  { field: 'assignedDesignerId', label: 'Assigned designer (Relay user ID)', required: false },
] as const

export type ClientField = (typeof CLIENT_IMPORT_FIELDS)[number]['field']

/** field -> CSV header (or null to ignore this field). */
export type FieldMapping = Partial<Record<ClientField, string | null>>
