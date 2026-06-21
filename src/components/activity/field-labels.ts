// Pure, client-safe. Shared by event-renderer.tsx and edit-diff-row.tsx.

/**
 * Map raw schema field keys to user-readable labels. Used when the activity
 * payload carries a `fieldsChanged` array (or a `changes` diff) sourced from a
 * Prisma model or Zod schema. Keys not in the map fall back to a spaced,
 * capitalized form.
 */
export const FIELD_NAME_LABELS: Record<string, string> = {
  // Client schema
  name: 'Name',
  businessSummary: 'Business summary',
  brandVoice: 'Brand voice',
  industry: 'Industry',
  location: 'Location',
  phone: 'Phone',
  mainCta: 'Main CTA',
  focus1: 'Focus 1',
  focus2: 'Focus 2',
  focus3: 'Focus 3',
  dos: 'Dos',
  donts: 'Donts',
  postingDays: 'Posting days',
  postLength: 'Post length',
  urls: 'URLs',
  targetAudience: 'Target audience',
  holidayHandling: 'Holiday handling',
  excludedDates: 'Excluded dates',
  assetsFolderUrl: 'Assets folder',
  canvaUrl: 'Canva URL',
  autoCrawl: 'Auto crawl',
  assignedAmId: 'Account Manager',
  assignedDesignerId: 'Designer',
  primaryAccountManagerId: 'Account Manager',
  status: 'Status',
  clientReviewEmail: 'Client review email',
  // Post schema
  caption: 'Caption',
  hashtags: 'Hashtags',
  graphicHook: 'Graphic hook',
  designerNotes: 'Designer notes',
}

export function humanizeFieldName(key: string): string {
  if (FIELD_NAME_LABELS[key]) return FIELD_NAME_LABELS[key]
  // Convert camelCase or snake_case into Sentence case.
  const spaced = key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}
