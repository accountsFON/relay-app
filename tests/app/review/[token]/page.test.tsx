/**
 * Unit tests for src/app/review/[token]/page.tsx.
 *
 * The middleware (src/middleware.ts) is the gate that decides whether the
 * page runs at all. We do NOT exercise the middleware here — its behavior
 * is covered by tests/middleware.test.ts and tests/lib/magic-link.test.ts.
 * Instead, we simulate the two outcomes:
 *
 *   - middleware passes → attaches x-magic-link-id + x-magic-link-batch-id
 *     headers + the page renders the appropriate branch based on the
 *     session cookie.
 *   - middleware rejects (404 or 410) → page is never invoked; we model
 *     this by either omitting the headers (the page treats that as 404)
 *     or having findUnique return null (modeled 410).
 */
process.env.MAGIC_LINK_SECRET = 'test-secret-base64-min-32-bytes-xxxxxxxxxxx'

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// --- Mocks: must be hoisted before importing the page module --------------
// vi.hoisted runs before vi.mock so we can share mock fns by reference.

const mocks = vi.hoisted(() => {
  return {
    headersMock: vi.fn(),
    cookiesMock: vi.fn(),
    notFoundMock: vi.fn(() => {
      throw new Error('NEXT_NOT_FOUND')
    }),
    findUniqueMagicLink: vi.fn(),
    updateMagicLink: vi.fn().mockResolvedValue({}),
    findManyPosts: vi.fn().mockResolvedValue([]),
    findUniqueReviewer: vi.fn(),
    listThreadsForBatch: vi.fn().mockResolvedValue(new Map()),
  }
})

vi.mock('next/headers', () => ({
  headers: () => mocks.headersMock(),
  cookies: () => mocks.cookiesMock(),
}))

vi.mock('next/navigation', () => ({
  notFound: mocks.notFoundMock,
}))

vi.mock('@/db/client', () => ({
  db: {
    magicLink: {
      findUnique: (...args: unknown[]) => mocks.findUniqueMagicLink(...args),
      update: (...args: unknown[]) => mocks.updateMagicLink(...args),
    },
    magicLinkReviewer: {
      findUnique: (...args: unknown[]) => mocks.findUniqueReviewer(...args),
    },
    post: {
      findMany: (...args: unknown[]) => mocks.findManyPosts(...args),
    },
  },
}))

vi.mock('@/server/repositories/threads', () => ({
  listThreadsForBatch: (...args: unknown[]) => mocks.listThreadsForBatch(...args),
}))

// Render-only stubs for the child components — we are testing the page's
// branching logic, not the visual output of the modal or feed.
vi.mock('@/app/review/[token]/name-modal', () => ({
  NameModal: ({ token }: { token: string }) => (
    <div data-testid="name-modal">modal:{token}</div>
  ),
}))

vi.mock('@/app/review/[token]/review-feed', () => ({
  ReviewFeed: ({ reviewerName }: { reviewerName: string }) => (
    <div data-testid="review-feed">feed:{reviewerName}</div>
  ),
}))

// Real lib/magic-link is fine; it just needs the env set above.
import { signSession } from '@/lib/magic-link'
import ReviewPage from '@/app/review/[token]/page'

const FAKE_TOKEN = 'fake.token.value'
const FAKE_MAGIC_LINK_ID = 'ml_test_1'
const FAKE_BATCH_ID = 'batch_test_1'

function makeHeaders(values: Record<string, string>) {
  const h = new Headers()
  for (const [k, v] of Object.entries(values)) h.set(k, v)
  return h
}

function makeCookieJar(values: Record<string, string>) {
  return {
    get: (name: string) =>
      values[name] !== undefined ? { value: values[name] } : undefined,
  }
}

async function renderPage() {
  const element = await ReviewPage({ params: Promise.resolve({ token: FAKE_TOKEN }) })
  return renderToStaticMarkup(element as React.ReactElement)
}

beforeEach(() => {
  vi.clearAllMocks()
  // Sensible default: middleware passed, attached both headers, magic
  // link row exists and is non-revoked. Individual tests override.
  mocks.headersMock.mockResolvedValue(
    makeHeaders({
      'x-magic-link-id': FAKE_MAGIC_LINK_ID,
      'x-magic-link-batch-id': FAKE_BATCH_ID,
    }),
  )
  mocks.cookiesMock.mockResolvedValue(makeCookieJar({}))
  mocks.findUniqueMagicLink.mockResolvedValue({
    id: FAKE_MAGIC_LINK_ID,
    defaultReviewerName: 'Default Name',
    defaultReviewerEmail: 'default@example.com',
    batch: {
      id: FAKE_BATCH_ID,
      label: 'Sept Wk 1',
      client: { id: 'client_1', name: 'Acme Co' },
    },
  })
  mocks.updateMagicLink.mockResolvedValue({})
  mocks.findManyPosts.mockResolvedValue([])
  mocks.listThreadsForBatch.mockResolvedValue(new Map())
  mocks.notFoundMock.mockImplementation(() => {
    throw new Error('NEXT_NOT_FOUND')
  })
})

describe('ReviewPage /review/[token]', () => {
  it('renders the name modal when no session cookie is present', async () => {
    mocks.cookiesMock.mockResolvedValue(makeCookieJar({}))
    const html = await renderPage()
    expect(html).toContain('data-testid="name-modal"')
    expect(html).not.toContain('data-testid="review-feed"')
  })

  it('renders the feed when a valid session cookie is present', async () => {
    const cookieValue = signSession({
      magicLinkId: FAKE_MAGIC_LINK_ID,
      reviewerId: 'reviewer_1',
    })
    mocks.cookiesMock.mockResolvedValue(
      makeCookieJar({ 'magic-link-session': cookieValue }),
    )
    mocks.findUniqueReviewer.mockResolvedValue({
      id: 'reviewer_1',
      name: 'Jordan Reviewer',
      magicLinkId: FAKE_MAGIC_LINK_ID,
    })

    const html = await renderPage()
    expect(html).toContain('data-testid="review-feed"')
    expect(html).toContain('Jordan Reviewer')
    expect(html).not.toContain('data-testid="name-modal"')
  })

  it('returns notFound when middleware-rejected (no x-magic-link-id header)', async () => {
    // Simulates the 404 path: middleware short-circuited with a 404 before
    // attaching the header. The page should call notFound() defensively.
    mocks.headersMock.mockResolvedValue(makeHeaders({}))

    await expect(renderPage()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mocks.notFoundMock).toHaveBeenCalled()
  })

  it('returns notFound when the magic link is missing/expired (modeled 410)', async () => {
    // The middleware attached headers from a valid signature check, but the
    // DB row has since vanished (e.g. revoked between middleware and render
    // — race) or is otherwise unfetchable. Model 410 by returning null
    // from findUnique. Page should bail with notFound rather than render
    // partial chrome.
    mocks.findUniqueMagicLink.mockResolvedValue(null)

    await expect(renderPage()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mocks.notFoundMock).toHaveBeenCalled()
  })
})
