/**
 * Render tests for FeedbackDigestEmail (Phase 5 item 27).
 */
import { describe, it, expect } from 'vitest'
import { render } from '@react-email/render'
import { FeedbackDigestEmail } from '@/server/emails/FeedbackDigestEmail'

const baseItems = [
  {
    id: 'fb-1',
    severity: 'high' as const,
    bodyText: 'page is broken',
    createdAt: new Date('2026-05-30T10:00:00Z'),
    submitterName: 'Julio Aleman',
    submitterEmail: 'julio@fonmarketing.com',
  },
  {
    id: 'fb-2',
    severity: 'medium' as const,
    bodyText: 'button does nothing on click',
    createdAt: new Date('2026-05-31T12:00:00Z'),
    submitterName: 'Mollie Huebner',
    submitterEmail: 'mollie@fonmarketing.com',
  },
  {
    id: 'fb-3',
    severity: 'low' as const,
    bodyText: 'typo in copy',
    createdAt: new Date('2026-06-01T08:00:00Z'),
    submitterName: 'Caleb Cody',
    submitterEmail: 'caleb@fonmarketing.com',
  },
]

describe('FeedbackDigestEmail', () => {
  it('renders submitter name + body text for every item', async () => {
    const html = await render(
      <FeedbackDigestEmail
        totalCount={3}
        windowStart={new Date('2026-05-25T13:00:00Z')}
        windowEnd={new Date('2026-06-01T13:00:00Z')}
        items={baseItems}
      />,
    )
    expect(html).toContain('Julio Aleman')
    expect(html).toContain('page is broken')
    expect(html).toContain('Mollie Huebner')
    expect(html).toContain('button does nothing on click')
    expect(html).toContain('Caleb Cody')
    expect(html).toContain('typo in copy')
  })

  it('shows a severity group label for every present severity', async () => {
    const html = await render(
      <FeedbackDigestEmail
        totalCount={3}
        windowStart={new Date('2026-05-25T13:00:00Z')}
        windowEnd={new Date('2026-06-01T13:00:00Z')}
        items={baseItems}
      />,
    )
    expect(html).toContain('High severity')
    expect(html).toContain('Medium severity')
    expect(html).toContain('Low severity')
  })

  it('omits severity group labels when those buckets are empty', async () => {
    const onlyLow = [baseItems[2]]
    const html = await render(
      <FeedbackDigestEmail
        totalCount={1}
        windowStart={new Date('2026-05-25T13:00:00Z')}
        windowEnd={new Date('2026-06-01T13:00:00Z')}
        items={onlyLow}
      />,
    )
    // The footer mentions "High severity reports also fire ..." so we
    // assert on the upper case group label form, which only appears
    // when a bucket renders.
    expect(html).not.toMatch(/>High severity<!-- --> \(/)
    expect(html).not.toMatch(/>Medium severity<!-- --> \(/)
    expect(html).toMatch(/>Low severity<!-- --> \(/)
  })

  it('renders a singular "1 new report" intro for one item', async () => {
    const html = await render(
      <FeedbackDigestEmail
        totalCount={1}
        windowStart={new Date('2026-05-25T13:00:00Z')}
        windowEnd={new Date('2026-06-01T13:00:00Z')}
        items={[baseItems[0]]}
      />,
    )
    expect(html).toContain('1 new report')
  })

  it('renders the plain text fallback with submitter + body text', async () => {
    const plainText = await render(
      <FeedbackDigestEmail
        totalCount={3}
        windowStart={new Date('2026-05-25T13:00:00Z')}
        windowEnd={new Date('2026-06-01T13:00:00Z')}
        items={baseItems}
      />,
      { plainText: true },
    )
    expect(plainText).toContain('Julio Aleman')
    expect(plainText).toContain('page is broken')
    expect(plainText).toContain('typo in copy')
  })
})
