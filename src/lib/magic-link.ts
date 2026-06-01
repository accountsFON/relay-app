/**
 * Magic-link auth primitives.
 *
 * Two token types live here:
 *
 *  1. The URL token (signToken / verifyToken): opaque value embedded in
 *     /review/[token]. Carries the magic-link id and an expiry. Server
 *     validates by recomputing the HMAC; never stored raw, only as
 *     sha256(token) (hashToken) on MagicLink.tokenHash for revocation
 *     lookup.
 *
 *  2. The session value (signSession / verifySession): signed cookie
 *     value scoped to a single magic link, identifies a returning
 *     reviewer. 30-day expiry baked into the signed payload so the
 *     cookie outlives the JS session but never the link itself.
 *
 * Both use HMAC-SHA256 with MAGIC_LINK_SECRET. The env check is lazy
 * (first function call, not module load) so a Vercel preview build can
 * compile without the secret being set in that environment. Any actual
 * sign/verify call without the secret throws loudly.
 *
 * See projects/relay-app/2026-05-16-post-preview-feedback-system-design.md
 * § Magic link auth model for the full spec.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

function getSecret(): string {
  const s = process.env.MAGIC_LINK_SECRET
  if (!s || s.length < 32) {
    throw new Error(
      'MAGIC_LINK_SECRET is unset or shorter than 32 chars. Generate with `openssl rand -base64 32` and set it in .env.local + Vercel project env.',
    )
  }
  return s
}

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

// ---------------------------------------------------------------------------
// base64url helpers, Node's Buffer 'base64url' encoding strips padding and
// uses URL-safe characters; we wrap it for clarity at call sites.
// ---------------------------------------------------------------------------

function base64urlEncode(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input
  return buf.toString('base64url')
}

function base64urlDecodeToBuffer(input: string): Buffer {
  return Buffer.from(input, 'base64url')
}

function base64urlDecodeToString(input: string): string {
  return base64urlDecodeToBuffer(input).toString('utf8')
}

// ---------------------------------------------------------------------------
// URL token: signToken / verifyToken / hashToken
// ---------------------------------------------------------------------------

export interface SignTokenInput {
  magicLinkId: string
  /** Unix epoch milliseconds. Token is invalid once Date.now() > expiresAt. */
  expiresAt: number
}

export interface VerifiedToken {
  magicLinkId: string
  expiresAt: number
}

/**
 * Returns `{sigBase64Url}.{magicLinkId}.{expiresAt}`. The id and expiresAt
 * portions are intentionally readable (not encrypted), the security
 * property is that an attacker cannot forge a valid signature without
 * MAGIC_LINK_SECRET, and the server re-checks revocation + expiry on every
 * request.
 */
export function signToken({ magicLinkId, expiresAt }: SignTokenInput): string {
  if (!magicLinkId || typeof magicLinkId !== 'string') {
    throw new Error('signToken: magicLinkId required')
  }
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) {
    throw new Error('signToken: expiresAt must be a positive epoch ms')
  }
  const payload = `${magicLinkId}.${expiresAt}`
  const sig = createHmac("sha256", getSecret()).update(payload).digest()
  return `${base64urlEncode(sig)}.${payload}`
}

/**
 * Returns the parsed claims if the signature checks out and the token has
 * not expired. Returns null on any failure (malformed, bad signature,
 * expired). Callers use the magicLinkId for the DB lookup; the lookup is
 * the second gate (revocation + batch archival).
 */
export function verifyToken(token: string): VerifiedToken | null {
  if (typeof token !== 'string' || token.length === 0) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [sigPart, magicLinkId, expiresAtPart] = parts
  if (!sigPart || !magicLinkId || !expiresAtPart) return null

  const expiresAt = Number(expiresAtPart)
  if (!Number.isFinite(expiresAt)) return null

  const payload = `${magicLinkId}.${expiresAtPart}`
  const expected = createHmac("sha256", getSecret()).update(payload).digest()

  let provided: Buffer
  try {
    provided = base64urlDecodeToBuffer(sigPart)
  } catch {
    return null
  }
  if (provided.length !== expected.length) return null
  if (!timingSafeEqual(provided, expected)) return null

  if (Date.now() > expiresAt) return null

  return { magicLinkId, expiresAt }
}

/**
 * sha256 hex of the entire token. Used to look up MagicLink rows on
 * /review/[token] requests without ever persisting the raw token.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

// ---------------------------------------------------------------------------
// Session cookie: signSession / verifySession
// ---------------------------------------------------------------------------

export interface SignSessionInput {
  magicLinkId: string
  reviewerId: string
}

export interface VerifiedSession {
  magicLinkId: string
  reviewerId: string
}

interface SessionPayload {
  magicLinkId: string
  reviewerId: string
  /** Unix epoch ms when this signed session expires. Independent of token expiry. */
  exp: number
}

/**
 * Returns `{sigBase64Url}.{base64url(JSON payload)}`. The payload includes
 * the magic-link id so a session lifted from one link cannot identify a
 * reviewer on a different link; the verifier checks both fields against
 * the calling site's expectations.
 */
export function signSession({ magicLinkId, reviewerId }: SignSessionInput): string {
  if (!magicLinkId || typeof magicLinkId !== 'string') {
    throw new Error('signSession: magicLinkId required')
  }
  if (!reviewerId || typeof reviewerId !== 'string') {
    throw new Error('signSession: reviewerId required')
  }
  const payload: SessionPayload = {
    magicLinkId,
    reviewerId,
    exp: Date.now() + SESSION_TTL_MS,
  }
  const payloadEncoded = base64urlEncode(JSON.stringify(payload))
  const sig = createHmac("sha256", getSecret()).update(payloadEncoded).digest()
  return `${base64urlEncode(sig)}.${payloadEncoded}`
}

/**
 * Reverse of signSession. Returns null on malformed input, bad signature,
 * or expired session. Callers should additionally compare the returned
 * magicLinkId to the URL token's magicLinkId before trusting the
 * reviewer identity.
 */
export function verifySession(value: string): VerifiedSession | null {
  if (typeof value !== 'string' || value.length === 0) return null
  const parts = value.split('.')
  if (parts.length !== 2) return null
  const [sigPart, payloadEncoded] = parts
  if (!sigPart || !payloadEncoded) return null

  const expected = createHmac("sha256", getSecret()).update(payloadEncoded).digest()
  let provided: Buffer
  try {
    provided = base64urlDecodeToBuffer(sigPart)
  } catch {
    return null
  }
  if (provided.length !== expected.length) return null
  if (!timingSafeEqual(provided, expected)) return null

  let payload: SessionPayload
  try {
    const json = base64urlDecodeToString(payloadEncoded)
    payload = JSON.parse(json) as SessionPayload
  } catch {
    return null
  }

  if (
    !payload ||
    typeof payload.magicLinkId !== 'string' ||
    typeof payload.reviewerId !== 'string' ||
    typeof payload.exp !== 'number'
  ) {
    return null
  }

  if (Date.now() > payload.exp) return null

  return { magicLinkId: payload.magicLinkId, reviewerId: payload.reviewerId }
}
