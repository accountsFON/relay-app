import { describe, it, expect } from 'vitest'
import { clientInputSchema, clientUpdateSchema } from '@/lib/schemas/client'

describe('clientInputSchema', () => {
  const validInput = {
    name: 'Akkoo Coffee',
    businessSummary: 'Specialty coffee roaster in Addis Ababa.',
    brandVoice: 'Warm, authentic, story-driven',
    industry: 'Coffee',
    location: 'Addis Ababa, Ethiopia',
    phone: '+251-11-555-0100',
    mainCta: 'Visit akkoocoffee.com',
    focus1: 'Single-origin beans',
    focus2: 'Ethiopian heritage',
    focus3: 'Roasting craft',
    dos: 'Use warm adjectives, reference coffee origins',
    donts: 'No generic "best coffee" claims',
    postingDays: 'Mon,Wed,Fri',
    postLength: 'Max 360 characters',
    urls: ['https://akkoocoffee.com', 'https://akkoocoffee.com/origins'],
    targetAudience: 'Specialty coffee drinkers, 25-55',
    holidayHandling: 'Major-US' as const,
    excludedDates: ['2026-05-15'],
    assetsFolderUrl: 'https://drive.google.com/drive/folders/abc',
  }

  it('accepts a fully-populated valid client', () => {
    const result = clientInputSchema.safeParse(validInput)
    expect(result.success).toBe(true)
  })

  it('requires name', () => {
    const { name, ...rest } = validInput
    const result = clientInputSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it('rejects empty name', () => {
    const result = clientInputSchema.safeParse({ ...validInput, name: '' })
    expect(result.success).toBe(false)
  })

  it('allows missing optional fields', () => {
    const result = clientInputSchema.safeParse({
      name: 'Minimal Client',
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid holidayHandling enum', () => {
    const result = clientInputSchema.safeParse({
      ...validInput,
      holidayHandling: 'Nonsense',
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid URL in urls array', () => {
    const result = clientInputSchema.safeParse({
      ...validInput,
      urls: ['not a url'],
    })
    expect(result.success).toBe(false)
  })

  it('rejects excluded dates not in YYYY-MM-DD format', () => {
    const result = clientInputSchema.safeParse({
      ...validInput,
      excludedDates: ['05/15/2026'],
    })
    expect(result.success).toBe(false)
  })

  it('preprocesses CSV string into urls array', () => {
    const result = clientInputSchema.safeParse({
      ...validInput,
      urls: 'https://akkoocoffee.com, https://akkoocoffee.com/origins',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.urls).toEqual([
        'https://akkoocoffee.com',
        'https://akkoocoffee.com/origins',
      ])
    }
  })

  it('preprocesses CSV string into excludedDates array', () => {
    const result = clientInputSchema.safeParse({
      ...validInput,
      excludedDates: '2026-05-15, 2026-05-22',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.excludedDates).toEqual(['2026-05-15', '2026-05-22'])
    }
  })

  it('treats empty CSV string as empty array', () => {
    const result = clientInputSchema.safeParse({
      ...validInput,
      urls: '',
      excludedDates: '',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.urls).toEqual([])
      expect(result.data.excludedDates).toEqual([])
    }
  })

  it('applies defaults for postingDays, holidayHandling, status', () => {
    const result = clientInputSchema.safeParse({ name: 'Default Test' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.postingDays).toBe('Mon,Wed,Fri')
      expect(result.data.holidayHandling).toBe('Major-US')
      expect(result.data.status).toBe('active')
    }
  })
})

describe('clientUpdateSchema', () => {
  it('allows partial updates (all fields optional)', () => {
    const result = clientUpdateSchema.safeParse({ name: 'New Name' })
    expect(result.success).toBe(true)
  })

  it('still validates fields that are provided', () => {
    const result = clientUpdateSchema.safeParse({ name: '' })
    expect(result.success).toBe(false)
  })
})
