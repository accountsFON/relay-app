import { describe, it, expect } from 'vitest'
import { parseClientsCsv, CLIENT_CSV_TEMPLATE } from '@/server/csv/parseClientsCsv'

describe('parseClientsCsv — canonical template format (regression)', () => {
  it('parses the shipped template with all fields mapped', () => {
    const rows = parseClientsCsv(CLIENT_CSV_TEMPLATE)
    expect(rows).toHaveLength(1)
    expect(rows[0].ok).toBe(true)
    expect(rows[0].data?.name).toBe('Acme Marketing Example')
    expect(rows[0].data?.urls).toEqual(['https://acme.example', 'https://acme-blog.example'])
  })

  it('flags a missing name', () => {
    const rows = parseClientsCsv('name,industry\n,Coffee\n')
    expect(rows[0].ok).toBe(false)
    expect(rows[0].errors.join()).toContain('missing required column: name')
  })
})

describe('parseClientsCsv — case-insensitive headers', () => {
  it('accepts upper/mixed-case canonical headers', () => {
    const rows = parseClientsCsv('Name,Industry,BrandVoice\nAkkoo Coffee,Coffee,Warm\n')
    expect(rows[0].ok).toBe(true)
    expect(rows[0].data?.name).toBe('Akkoo Coffee')
    expect(rows[0].data?.industry).toBe('Coffee')
    expect(rows[0].data?.brandVoice).toBe('Warm')
  })
})

describe('parseClientsCsv — Airtable-style display headers', () => {
  it('maps human-readable Airtable column names to canonical fields', () => {
    const csv =
      'Name,Business Summary,City/Region,Business Phone Number,Main CTA,Do,Don\'t,Google Drive Link (Assets Folder),Posting Days,Holiday Handling\n' +
      'Akkoo Coffee,Premium cafe,"Addis Ababa, Ethiopia",+251-905,Visit us,Use client photos,Avoid jargon,https://drive.example,"Mon,Wed,Fri",Major-US\n'
    const rows = parseClientsCsv(csv)
    expect(rows[0].ok).toBe(true)
    const d = rows[0].data!
    expect(d.name).toBe('Akkoo Coffee')
    expect(d.businessSummary).toBe('Premium cafe')
    expect(d.location).toBe('Addis Ababa, Ethiopia')
    expect(d.phone).toBe('+251-905')
    expect(d.mainCta).toBe('Visit us')
    expect(d.dos).toBe('Use client photos')
    expect(d.donts).toBe('Avoid jargon')
    expect(d.assetsFolderUrl).toBe('https://drive.example')
    expect(d.postingDays).toBe('Mon,Wed,Fri')
    expect(d.holidayHandling).toBe('Major-US')
  })

  it('splits newline-separated URLs (Airtable export style) into a list', () => {
    const csv = 'Name,URLs\nAkkoo,"https://a.example\nhttps://b.example"\n'
    const rows = parseClientsCsv(csv)
    expect(rows[0].ok).toBe(true)
    expect(rows[0].data?.urls).toEqual(['https://a.example', 'https://b.example'])
  })

  it('ignores unknown columns — a foreign AMID does NOT populate assignedAmId', () => {
    const csv = 'Name,AMID,DESIGNERID,Copy Journey\nAkkoo,1211906949595442,1211389383646819,Legacy\n'
    const rows = parseClientsCsv(csv)
    expect(rows[0].ok).toBe(true)
    expect(rows[0].data?.assignedAmId).toBeUndefined()
    expect(rows[0].data?.assignedDesignerId).toBeUndefined()
  })
})
