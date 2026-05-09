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
 * creates one with the demo password and the email pre verified.
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
  return { email: user.email, clerkUserId: created.id, created: true }
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
export async function ensureClerkMembership(
  clerk: ClerkClient,
  organizationId: string,
  userId: string,
  role: 'org:admin' | 'org:member',
): Promise<{ created: boolean }> {
  try {
    await clerk.organizations.createOrganizationMembership({
      organizationId,
      userId,
      role,
    })
    return { created: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.toLowerCase().includes('already')) return { created: false }
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
