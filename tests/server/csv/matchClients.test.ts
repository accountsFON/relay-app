import { describe, it, expect } from 'vitest'
import {
  normalizePhone,
  normalizeUrlHost,
  findMatchingClientIds,
  buildImportPlan,
  type ExistingClientMatchRow,
} from '@/server/csv/matchClients'
import type { ParsedClientRow } from '@/server/csv/parseClientsCsv'

describe('normalizePhone', () => {
  it('reduces to digits and drops a leading US 1', () => {
    expect(normalizePhone('(904) 337-1082')).toBe('9043371082')
    expect(normalizePhone('+1 904-337-1082')).toBe('9043371082')
    expect(normalizePhone('9043371082')).toBe('9043371082')
  })
  it('keeps non-US numbers as their digits', () => {
    expect(normalizePhone('+251 -905-828282')).toBe('251905828282')
  })
  it('returns null for empty/garbage', () => {
    expect(normalizePhone('')).toBeNull()
    expect(normalizePhone(null)).toBeNull()
    expect(normalizePhone('12')).toBeNull()
  })
})

describe('normalizeUrlHost', () => {
  it('strips protocol, www, path, and casing', () => {
    expect(normalizeUrlHost('https://www.Acme.com/about')).toBe('acme.com')
    expect(normalizeUrlHost('acme.com/')).toBe('acme.com')
    expect(normalizeUrlHost('http://acme.com?x=1')).toBe('acme.com')
  })
  it('returns null for empty', () => {
    expect(normalizeUrlHost('')).toBeNull()
    expect(normalizeUrlHost(undefined)).toBeNull()
  })
})

const existing: ExistingClientMatchRow[] = [
  { id: 'c1', name: 'Acme Coffee', phone: '(904) 337-1082', urls: ['https://acme.example'] },
  { id: 'c2', name: 'Beta Roofing', phone: null, urls: ['https://www.beta.example/home'] },
]

describe('findMatchingClientIds', () => {
  it('matches on phone (formatting-insensitive)', () => {
    expect(findMatchingClientIds({ phone: '+1 904 337 1082', urls: [] }, existing)).toEqual(['c1'])
  })
  it('matches on a shared URL host (path/www-insensitive)', () => {
    expect(findMatchingClientIds({ phone: undefined, urls: ['http://beta.example/contact'] }, existing)).toEqual(['c2'])
  })
  it('returns [] when nothing matches', () => {
    expect(findMatchingClientIds({ phone: '555-0000', urls: ['https://new.example'] }, existing)).toEqual([])
  })
})

function okRow(rowIndex: number, data: Partial<ParsedClientRow['data']>): ParsedClientRow {
  return { rowIndex, ok: true, errors: [], data: { name: `Row ${rowIndex}`, ...data } as ParsedClientRow['data'] }
}

describe('buildImportPlan', () => {
  it('marks matched rows as update and unmatched as create', () => {
    const plan = buildImportPlan(
      [
        okRow(2, { name: 'Acme Coffee', phone: '904.337.1082' }), // matches c1
        okRow(3, { name: 'Brand New Co', urls: ['https://brandnew.example'] }), // no match
      ],
      existing,
    )
    expect(plan.ok).toBe(true)
    expect(plan.newCount).toBe(1)
    expect(plan.updateCount).toBe(1)
    expect(plan.rows[0]).toMatchObject({ action: 'update', matchedClientId: 'c1', matchedClientName: 'Acme Coffee' })
    expect(plan.rows[1]).toMatchObject({ action: 'create' })
  })

  it('flags a row that matches multiple existing clients as an error', () => {
    const twoMatch: ExistingClientMatchRow[] = [
      { id: 'a', name: 'A', phone: '9043371082', urls: [] },
      { id: 'b', name: 'B', phone: null, urls: ['https://shared.example'] },
    ]
    const plan = buildImportPlan([okRow(2, { phone: '904-337-1082', urls: ['https://shared.example'] })], twoMatch)
    expect(plan.ok).toBe(false)
    expect(plan.errorCount).toBe(1)
    expect(plan.rows[0].errors.join()).toContain('matches multiple existing clients')
  })

  it('flags two CSV rows that match the same existing client', () => {
    const plan = buildImportPlan(
      [
        okRow(2, { phone: '9043371082' }), // -> c1
        okRow(3, { urls: ['https://acme.example'] }), // -> c1 too
      ],
      existing,
    )
    expect(plan.ok).toBe(false)
    expect(plan.rows.every((r) => !r.ok)).toBe(true)
    expect(plan.rows[0].errors.join()).toContain('same existing client')
  })

  it('keeps parse/validation failures as errors', () => {
    const plan = buildImportPlan(
      [{ rowIndex: 2, ok: false, errors: ['missing required column: name'], data: undefined }],
      existing,
    )
    expect(plan.ok).toBe(false)
    expect(plan.errorCount).toBe(1)
  })
})
