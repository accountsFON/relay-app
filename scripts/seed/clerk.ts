/**
 * Clerk Backend SDK helpers used by the demo seed.
 *
 * The seed script needs to:
 *   - look up an existing Clerk org by name
 *   - create the org if missing (with a known createdBy user)
 *   - look up existing Clerk users by email
 *   - create users with a known password and verified email
 *   - attach users to the org as members
 *   - cascade delete the org + its users on `--clean` runs
 *
 * Runtime check: the SDK is read from `@clerk/backend` (peer of @clerk/nextjs).
 * Auth flows in the running app continue to use `@clerk/nextjs/server`.
 */
import { createClerkClient } from '@clerk/backend'

export type ClerkClient = ReturnType<typeof createClerkClient>

const DEMO_ORG_NAME = 'Relay Demo Agency'
const DEMO_PASSWORD = 'Password!123'

export interface DemoClerkUser {
  email: string
  firstName: string
  lastName: string
}

export interface DemoClerkUserResult {
  email: string
  clerkUserId: string
  created: boolean
}

export function makeClerkClient(): ClerkClient {
  const secretKey = process.env.CLERK_SECRET_KEY
  if (!secretKey) {
    throw new Error('CLERK_SECRET_KEY not set; cannot run demo seed')
  }
  return createClerkClient({ secretKey })
}

export async function findClerkUserByEmail(
  clerk: ClerkClient,
  email: string,
): Promise<{ id: string } | null> {
  const list = await clerk.users.getUserList({ emailAddress: [email] })
  const data = list.data ?? []
  if (data.length === 0) return null
  return { id: data[0].id }
}

/**
 * Idempotent: returns the existing Clerk user if found by email, otherwise
 * creates one with the demo password and the email marked verified so
 * interactive sign in does not prompt for a verification code.
 *
 * `clerk.users.createUser({ emailAddress: ['x@y.z'] })` defaults the email
 * to `verification.status === 'unverified'`. Without an explicit verify
 * step the demo accounts cannot complete an interactive sign in because
 * the codes go to a fake @relaydemo.app domain. We patch each
 * email_address right after creation via the Backend API directly (the
 * SDK does not expose a `verified` flag on every version).
 */
export async function ensureClerkUser(
  clerk: ClerkClient,
  user: DemoClerkUser,
): Promise<DemoClerkUserResult> {
  const found = await findClerkUserByEmail(clerk, user.email)
  if (found) {
    return { email: user.email, clerkUserId: found.id, created: false }
  }
  const created = await clerk.users.createUser({
    emailAddress: [user.email],
    password: DEMO_PASSWORD,
    firstName: user.firstName,
    lastName: user.lastName,
    skipPasswordChecks: true,
    skipPasswordRequirement: false,
  })

  // Re-fetch to walk the email_addresses list, then verify each one.
  const fresh = await clerk.users.getUser(created.id)
  await markEmailsVerified(fresh.emailAddresses ?? [])

  return { email: user.email, clerkUserId: created.id, created: true }
}

/**
 * PATCH each email_address with `verified: true` via the Backend API.
 * Used by ensureClerkUser for new creates and by the standalone
 * `verify-demo-emails` script for backfilling already-created users.
 */
async function markEmailsVerified(
  emailAddresses: { id: string; verification?: { status?: string } | null }[],
): Promise<void> {
  const secretKey = process.env.CLERK_SECRET_KEY
  if (!secretKey) return
  for (const ea of emailAddresses) {
    if (ea.verification?.status === 'verified') continue
    await fetch(`https://api.clerk.com/v1/email_addresses/${ea.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ verified: true }),
    })
  }
}

export async function findClerkOrgByName(
  clerk: ClerkClient,
  name: string,
): Promise<{ id: string } | null> {
  const list = await clerk.organizations.getOrganizationList({ query: name })
  const match = (list.data ?? []).find((o) => o.name === name)
  if (!match) return null
  return { id: match.id }
}

/**
 * Idempotent: returns the existing Relay Demo Agency org if found by name,
 * otherwise creates one with `createdByUserId` as the initial admin.
 */
export async function ensureClerkOrg(
  clerk: ClerkClient,
  createdByUserId: string,
): Promise<{ id: string; created: boolean }> {
  const existing = await findClerkOrgByName(clerk, DEMO_ORG_NAME)
  if (existing) return { id: existing.id, created: false }
  const created = await clerk.organizations.createOrganization({
    name: DEMO_ORG_NAME,
    createdBy: createdByUserId,
  })
  return { id: created.id, created: true }
}

/**
 * Add a user to the demo org. Skips silently if the membership already exists.
 * `role` is the Clerk side role: `org:admin` for staff, `org:member` for clients.
 */
function clerkErrorHas(err: unknown, code: string): boolean {
  if (!err || typeof err !== 'object') return false
  const candidate = err as {
    errors?: { code?: string; message?: string }[]
  }
  for (const e of candidate.errors ?? []) {
    if (e.code === code) return true
  }
  return false
}

function isAlreadyMemberError(err: unknown): boolean {
  if (clerkErrorHas(err, 'already_a_member_in_organization')) return true
  if (!err || typeof err !== 'object') return false
  const candidate = err as {
    message?: unknown
    errors?: { message?: string }[]
  }
  const top = String(candidate.message ?? '').toLowerCase()
  if (top.includes('already')) return true
  for (const e of candidate.errors ?? []) {
    if (String(e.message ?? '').toLowerCase().includes('already')) return true
  }
  return false
}

function isQuotaExceededError(err: unknown): boolean {
  return clerkErrorHas(err, 'organization_membership_quota_exceeded')
}

export interface EnsureMembershipResult {
  created: boolean
  skippedReason?: 'already_member' | 'quota_exceeded'
}

export async function ensureClerkMembership(
  clerk: ClerkClient,
  organizationId: string,
  userId: string,
  role: 'org:admin' | 'org:member',
): Promise<EnsureMembershipResult> {
  try {
    await clerk.organizations.createOrganizationMembership({
      organizationId,
      userId,
      role,
    })
    return { created: true }
  } catch (err) {
    if (isAlreadyMemberError(err)) {
      return { created: false, skippedReason: 'already_member' }
    }
    if (isQuotaExceededError(err)) {
      console.warn(
        `  warn: Clerk membership quota exceeded for user ${userId}; user exists in Clerk and the DB but is not a Clerk org member. Upgrade the dev tier to seat all 9.`,
      )
      return { created: false, skippedReason: 'quota_exceeded' }
    }
    throw err
  }
}

export async function deleteClerkUser(
  clerk: ClerkClient,
  userId: string,
): Promise<void> {
  try {
    await clerk.users.deleteUser(userId)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('not_found')) return
    console.warn(`  warn: failed to delete clerk user ${userId}: ${msg}`)
  }
}

export async function deleteClerkOrg(
  clerk: ClerkClient,
  orgId: string,
): Promise<void> {
  try {
    await clerk.organizations.deleteOrganization(orgId)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('not_found')) return
    console.warn(`  warn: failed to delete clerk org ${orgId}: ${msg}`)
  }
}

export const CLERK_DEMO_PASSWORD = DEMO_PASSWORD
export const CLERK_DEMO_ORG_NAME = DEMO_ORG_NAME
