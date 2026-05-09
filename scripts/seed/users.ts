/**
 * Demo seed: 9 Clerk + DB users for the Relay Demo Agency org.
 *
 * Creates / upserts the Organization row first (keyed by clerkOrgId), then
 * the User and Membership rows. Returns a typed handle the rest of the
 * seed uses to look up users by their semantic key (admin, am1, am2, etc.).
 *
 * `linkedClientId` for the three client-role users is left null at this
 * step. The clients seed step calls back via `linkClientUsers` once the
 * Cedar Creek / Apex / Sunrise Yoga rows exist.
 */
import type { PrismaClient } from '@prisma/client'
import { UserRole } from '@prisma/client'
import {
  CLERK_DEMO_ORG_NAME,
  ensureClerkMembership,
  ensureClerkOrg,
  ensureClerkUser,
  type ClerkClient,
} from './clerk'

export type UserKey =
  | 'admin'
  | 'am1'
  | 'am2'
  | 'designer1'
  | 'designer2'
  | 'client1'
  | 'client2'
  | 'client3'
  | 'platform'

export interface DemoUser {
  key: UserKey
  email: string
  firstName: string
  lastName: string
  role: UserRole
  platformOwner: boolean
  clerkRole: 'org:admin' | 'org:member'
}

export const DEMO_USERS: DemoUser[] = [
  {
    key: 'admin',
    email: 'alex.admin@relaydemo.test',
    firstName: 'Alex',
    lastName: 'Brooks',
    role: UserRole.admin,
    platformOwner: false,
    clerkRole: 'org:admin',
  },
  {
    key: 'am1',
    email: 'morgan.am@relaydemo.test',
    firstName: 'Morgan',
    lastName: 'Reyes',
    role: UserRole.account_manager,
    platformOwner: false,
    clerkRole: 'org:admin',
  },
  {
    key: 'am2',
    email: 'sam.am@relaydemo.test',
    firstName: 'Sam',
    lastName: 'Patel',
    role: UserRole.account_manager,
    platformOwner: false,
    clerkRole: 'org:admin',
  },
  {
    key: 'designer1',
    email: 'riley.designer@relaydemo.test',
    firstName: 'Riley',
    lastName: 'Chen',
    role: UserRole.designer,
    platformOwner: false,
    clerkRole: 'org:admin',
  },
  {
    key: 'designer2',
    email: 'jordan.designer@relaydemo.test',
    firstName: 'Jordan',
    lastName: 'Kim',
    role: UserRole.designer,
    platformOwner: false,
    clerkRole: 'org:admin',
  },
  {
    key: 'client1',
    email: 'casey.client@relaydemo.test',
    firstName: 'Casey',
    lastName: 'Cedar Creek',
    role: UserRole.client,
    platformOwner: false,
    clerkRole: 'org:member',
  },
  {
    key: 'client2',
    email: 'taylor.client@relaydemo.test',
    firstName: 'Taylor',
    lastName: 'Apex',
    role: UserRole.client,
    platformOwner: false,
    clerkRole: 'org:member',
  },
  {
    key: 'client3',
    email: 'dakota.client@relaydemo.test',
    firstName: 'Dakota',
    lastName: 'Sunrise Yoga',
    role: UserRole.client,
    platformOwner: false,
    clerkRole: 'org:member',
  },
  {
    key: 'platform',
    email: 'pat.platform@relaydemo.test',
    firstName: 'Pat',
    lastName: 'Owner',
    role: UserRole.admin,
    platformOwner: true,
    clerkRole: 'org:admin',
  },
]

export interface SeededUserMap {
  organizationId: string
  clerkOrgId: string
  users: Record<UserKey, { id: string; clerkUserId: string; email: string; name: string }>
}

export interface SeedUsersOptions {
  skipClerk: boolean
}

/**
 * Idempotent. Creates the Clerk side and DB side of the demo org plus all
 * 9 demo users + their Memberships. Returns a typed handle keyed by user
 * role for downstream seed steps.
 *
 * When `skipClerk` is true, the script assumes the Clerk side already
 * exists and looks up each row by email on the DB. In that mode it cannot
 * bootstrap the Clerk org from scratch, so refuses if the DB org row is
 * missing.
 */
export async function seedUsers(
  db: PrismaClient,
  clerk: ClerkClient | null,
  opts: SeedUsersOptions,
): Promise<SeededUserMap> {
  if (!opts.skipClerk && !clerk) {
    throw new Error('seedUsers requires a Clerk client unless skipClerk=true')
  }

  let clerkOrgId: string

  if (opts.skipClerk || !clerk) {
    const dbOrg = await db.organization.findFirst({
      where: { name: CLERK_DEMO_ORG_NAME },
      select: { clerkOrgId: true },
    })
    if (!dbOrg) {
      throw new Error(
        '--skip-clerk requires the demo org to already exist in the DB',
      )
    }
    clerkOrgId = dbOrg.clerkOrgId
  } else {
    const adminUser = DEMO_USERS.find((u) => u.key === 'admin')!
    const clerkAdmin = await ensureClerkUser(clerk, {
      email: adminUser.email,
      firstName: adminUser.firstName,
      lastName: adminUser.lastName,
    })
    const clerkOrg = await ensureClerkOrg(clerk, clerkAdmin.clerkUserId)
    clerkOrgId = clerkOrg.id
    await ensureClerkMembership(
      clerk,
      clerkOrgId,
      clerkAdmin.clerkUserId,
      adminUser.clerkRole,
    )
  }

  const org = await db.organization.upsert({
    where: { clerkOrgId },
    update: { name: CLERK_DEMO_ORG_NAME },
    create: {
      name: CLERK_DEMO_ORG_NAME,
      clerkOrgId,
      plan: 'agency',
      runCredits: 100,
    },
    select: { id: true },
  })

  const seededUsers: Partial<SeededUserMap['users']> = {}

  for (const u of DEMO_USERS) {
    let clerkUserId: string

    if (opts.skipClerk || !clerk) {
      const existing = await db.user.findFirst({
        where: { email: u.email, organizationId: org.id },
        select: { clerkUserId: true },
      })
      if (!existing) {
        throw new Error(
          `--skip-clerk: expected DB user ${u.email} to already exist`,
        )
      }
      clerkUserId = existing.clerkUserId
    } else {
      const created = await ensureClerkUser(clerk, {
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
      })
      clerkUserId = created.clerkUserId
      await ensureClerkMembership(clerk, clerkOrgId, clerkUserId, u.clerkRole)
    }

    const name = `${u.firstName} ${u.lastName}`
    const dbUser = await db.user.upsert({
      where: { clerkUserId },
      update: {
        organizationId: org.id,
        role: u.role,
        platformOwner: u.platformOwner,
        email: u.email,
        name,
      },
      create: {
        clerkUserId,
        organizationId: org.id,
        role: u.role,
        platformOwner: u.platformOwner,
        email: u.email,
        name,
      },
      select: { id: true },
    })

    await db.membership.upsert({
      where: {
        userId_organizationId: {
          userId: dbUser.id,
          organizationId: org.id,
        },
      },
      update: { role: u.role },
      create: {
        userId: dbUser.id,
        organizationId: org.id,
        role: u.role,
      },
    })

    seededUsers[u.key] = {
      id: dbUser.id,
      clerkUserId,
      email: u.email,
      name,
    }
  }

  return {
    organizationId: org.id,
    clerkOrgId,
    users: seededUsers as SeededUserMap['users'],
  }
}

/**
 * Patch the three client-role users with their linkedClientId. Called from
 * the seed entry point after clients are written.
 */
export async function linkClientUsers(
  db: PrismaClient,
  users: SeededUserMap['users'],
  links: { client1: string; client2: string; client3: string },
): Promise<void> {
  await db.user.update({
    where: { id: users.client1.id },
    data: { linkedClientId: links.client1 },
  })
  await db.user.update({
    where: { id: users.client2.id },
    data: { linkedClientId: links.client2 },
  })
  await db.user.update({
    where: { id: users.client3.id },
    data: { linkedClientId: links.client3 },
  })
}
