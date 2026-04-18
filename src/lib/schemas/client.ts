import { z } from 'zod'

const isoDate = /^\d{4}-\d{2}-\d{2}$/

const holidayHandlingEnum = z.enum(['Major-US', 'Off'])

const statusEnum = z.enum(['active', 'paused', 'archived'])
const autoCrawlEnum = z.enum(['always', 'when_empty', 'never'])

function csvToArray(val: unknown): unknown {
  if (typeof val !== 'string') return val
  return val
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

const urlsField = z
  .preprocess(csvToArray, z.array(z.string().url()))
  .default([])

const excludedDatesField = z
  .preprocess(
    csvToArray,
    z.array(z.string().regex(isoDate, 'Must be YYYY-MM-DD'))
  )
  .default([])

export const clientInputSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  businessSummary: z.string().max(2000).optional(),
  brandVoice: z.string().max(1000).optional(),
  industry: z.string().max(100).optional(),
  location: z.string().max(200).optional(),
  phone: z.string().max(50).optional(),
  mainCta: z.string().max(1000).optional(),
  focus1: z.string().max(500).optional(),
  focus2: z.string().max(500).optional(),
  focus3: z.string().max(500).optional(),
  dos: z.string().max(2000).optional(),
  donts: z.string().max(2000).optional(),
  postingDays: z.string().default('Mon,Wed,Fri'),
  postLength: z.string().max(500).optional(),
  urls: urlsField,
  targetAudience: z.string().max(2000).optional(),
  holidayHandling: holidayHandlingEnum.default('Major-US'),
  excludedDates: excludedDatesField,
  assetsFolderUrl: z.string().url().optional().or(z.literal('')),
  autoCrawl: autoCrawlEnum.default('always'),
  assignedAmId: z.string().optional(),
  status: statusEnum.default('active'),
})

// Explicit partial schema without defaults — so updates only touch the fields
// the caller actually provides.
export const clientUpdateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200).optional(),
  businessSummary: z.string().max(2000).optional(),
  brandVoice: z.string().max(1000).optional(),
  industry: z.string().max(100).optional(),
  location: z.string().max(200).optional(),
  phone: z.string().max(50).optional(),
  mainCta: z.string().max(1000).optional(),
  focus1: z.string().max(500).optional(),
  focus2: z.string().max(500).optional(),
  focus3: z.string().max(500).optional(),
  dos: z.string().max(2000).optional(),
  donts: z.string().max(2000).optional(),
  postingDays: z.string().optional(),
  postLength: z.string().max(500).optional(),
  urls: z.preprocess(csvToArray, z.array(z.string().url())).optional(),
  targetAudience: z.string().max(2000).optional(),
  holidayHandling: holidayHandlingEnum.optional(),
  excludedDates: z
    .preprocess(csvToArray, z.array(z.string().regex(isoDate, 'Must be YYYY-MM-DD')))
    .optional(),
  assetsFolderUrl: z.string().url().optional().or(z.literal('')),
  autoCrawl: autoCrawlEnum.optional(),
  assignedAmId: z.string().optional(),
  status: statusEnum.optional(),
})

export type ClientInput = z.infer<typeof clientInputSchema>
export type ClientUpdate = z.infer<typeof clientUpdateSchema>
