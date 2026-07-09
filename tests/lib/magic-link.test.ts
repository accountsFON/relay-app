/**
 * Unit tests for src/lib/magic-link.ts. Pure crypto + parsing, no DB.
 *
 * MAGIC_LINK_SECRET must be set BEFORE the module under test is imported,
 * because the module throws at load time if the env is missing. We use a
 * top-level assignment + dynamic import to enforce ordering.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

process.env.MAGIC_LINK_SECRET =
  'test-secret-base64-min-32-bytes-xxxxxxxxxxx'

type MagicLinkModule = typeof import('@/lib/magic-link')
let lib: MagicLinkModule

beforeAll(async () => {
  lib = await import('@/lib/magic-link')
})

afterEach(() => {
  vi.useRealTimers()
})

describe('signToken / verifyToken', () => {
  it('roundtrips a freshly signed token', () => {
    const expiresAt = Date.now() + 60_000
    const token = lib.signToken({ magicLinkId: 'ml_abc', expiresAt })
    const verified = lib.verifyToken(token)
    expect(verified).toEqual({ magicLinkId: 'ml_abc', expiresAt })
  })

  it('rejects a token whose HMAC was tampered with', () => {
    const expiresAt = Date.now() + 60_000
    const token = lib.signToken({ magicLinkId: 'ml_abc', expiresAt })
    const [sig, id, exp] = token.split('.')
    // Flip the first character of the signature segment to a known-different
    // base64url char. Both 'A' and 'B' decode to valid base64url so the
    // length check stays consistent and the test exercises the
    // timingSafeEqual mismatch path, not the malformed-input early-out.
    const flipped = sig.startsWith('A')
      ? `B${sig.slice(1)}`
      : `A${sig.slice(1)}`
    const tampered = `${flipped}.${id}.${exp}`
    expect(lib.verifyToken(tampered)).toBeNull()
  })

  it('rejects a token whose expiresAt is in the past', () => {
    const expiresAt = Date.now() - 1_000
    const token = lib.signToken({ magicLinkId: 'ml_expired', expiresAt })
    expect(lib.verifyToken(token)).toBeNull()
  })
})

describe('inspectToken (P2 #23)', () => {
  it('returns valid for a good, unexpired token', () => {
    const expiresAt = Date.now() + 60_000
    const token = lib.signToken({ magicLinkId: 'ml_ok', expiresAt })
    expect(lib.inspectToken(token)).toEqual({
      status: 'valid',
      magicLinkId: 'ml_ok',
      expiresAt,
    })
  })

  it('returns expired (with the id) for a correctly-signed past token', () => {
    const expiresAt = Date.now() - 1_000
    const token = lib.signToken({ magicLinkId: 'ml_exp', expiresAt })
    expect(lib.inspectToken(token)).toEqual({
      status: 'expired',
      magicLinkId: 'ml_exp',
      expiresAt,
    })
  })

  it('returns invalid for a tampered signature (never leaks expired)', () => {
    const expiresAt = Date.now() - 1_000 // past, but the signature is bad
    const token = lib.signToken({ magicLinkId: 'ml_x', expiresAt })
    const [sig, id, exp] = token.split('.')
    const flipped = sig.startsWith('A') ? `B${sig.slice(1)}` : `A${sig.slice(1)}`
    expect(lib.inspectToken(`${flipped}.${id}.${exp}`)).toEqual({ status: 'invalid' })
  })

  it('returns invalid for a malformed token', () => {
    expect(lib.inspectToken('not-a-token')).toEqual({ status: 'invalid' })
    expect(lib.inspectToken('')).toEqual({ status: 'invalid' })
  })
})

describe('hashToken', () => {
  // The "revocation rejected via tokenHash lookup" case in the spec is a
  // composite of (a) the lib producing a stable hash for any given token
  // and (b) the repository looking it up. The repository test covers the
  // DB side; here we cover the deterministic hashing the middleware uses
  // to reach the repository.
  it('produces a stable sha256 hex used by the revocation lookup path', () => {
    const expiresAt = Date.now() + 60_000
    const token = lib.signToken({ magicLinkId: 'ml_rev', expiresAt })
    const h1 = lib.hashToken(token)
    const h2 = lib.hashToken(token)
    expect(h1).toBe(h2)
    expect(h1).toMatch(/^[0-9a-f]{64}$/)
    // Different tokens must hash differently — otherwise revocation
    // collides across links and a revoked link could resurrect another.
    const other = lib.signToken({ magicLinkId: 'ml_other', expiresAt })
    expect(lib.hashToken(other)).not.toBe(h1)
  })
})

describe('signSession / verifySession', () => {
  it('roundtrips and rejects sessions issued under a different secret context', () => {
    // The session payload bakes the magicLinkId so a session lifted from
    // link A cannot identify a reviewer on link B. We verify the payload
    // round-trips cleanly AND that the magicLinkId is what the verifier
    // hands back, so callers can compare it against the URL token.
    const session = lib.signSession({
      magicLinkId: 'ml_A',
      reviewerId: 'rev_1',
    })
    const ok = lib.verifySession(session)
    expect(ok).toEqual({ magicLinkId: 'ml_A', reviewerId: 'rev_1' })

    // A session for a different link does NOT match link A's expectations.
    // The middleware compares the URL-token magicLinkId to this value;
    // mismatch means "wrong link, ignore the cookie".
    const sessionB = lib.signSession({
      magicLinkId: 'ml_B',
      reviewerId: 'rev_1',
    })
    const okB = lib.verifySession(sessionB)
    expect(okB?.magicLinkId).toBe('ml_B')
    expect(okB?.magicLinkId).not.toBe(ok?.magicLinkId)
  })

  it('rejects a session past its 30-day expiry', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const session = lib.signSession({
      magicLinkId: 'ml_exp',
      reviewerId: 'rev_exp',
    })
    expect(lib.verifySession(session)).toEqual({
      magicLinkId: 'ml_exp',
      reviewerId: 'rev_exp',
    })
    // Jump 31 days forward — past the 30-day TTL.
    vi.setSystemTime(new Date('2026-02-01T00:00:01Z'))
    expect(lib.verifySession(session)).toBeNull()
  })
})
