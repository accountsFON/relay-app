/**
 * Safety-net cleanup for leaked test Organizations.
 *
 * Integration tests create Organizations with a unique `test-*-org-${uid}`
 * name in beforeEach and tear them down in afterEach. If a run is cancelled
 * (Ctrl+C, IDE quit) or a teardown step throws partway, the org leaks. And
 * because prod and dev share the same Neon DB (see the launch readiness gate
 * in projects/relay-app/backlog.md), those leaks surface in the prod
 * platform-owner agency dropdown.
 *
 * Each integration test calls this helper from `afterAll` with its unique
 * org-name prefix. The helper does a defensive sweep: any Organization whose
 * name starts with that prefix gets deleted in the same FK-safe order the
 * afterEach uses. Failures are logged, not thrown — a cleanup hiccup must
 * not fail the test session.
 *
 * Mirrors the order in scripts/cleanup-leaked-test-orgs.ts.
 */
import type { DbClient } from '@/db/client'

export async function cleanupLeakedTestOrgs(
  db: DbClient,
  prefix: string,
): Promise<void> {
  if (!prefix.startsWith('test-')) {
    // Defensive: only sweep prefixes that are clearly test-scoped.
    throw new Error(
      `cleanupLeakedTestOrgs refuses to act on prefix "${prefix}" (must start with "test-")`,
    )
  }

  let orgs: { id: string }[]
  try {
    orgs = await db.organization.findMany({
      where: { name: { startsWith: prefix } },
      select: { id: true },
    })
  } catch (err) {
    console.warn(`[cleanupLeakedTestOrgs] lookup failed for "${prefix}":`, err)
    return
  }

  for (const org of orgs) {
    try {
      const clients = await db.client.findMany({
        where: { organizationId: org.id },
        select: { id: true },
      })
      const clientIds = clients.map((c) => c.id)

      if (clientIds.length > 0) {
        await db.post.deleteMany({ where: { clientId: { in: clientIds } } })
        await db.contentRun.deleteMany({ where: { clientId: { in: clientIds } } })
        await db.batch.deleteMany({ where: { clientId: { in: clientIds } } })
      }
      await db.trashAuditLog.deleteMany({ where: { organizationId: org.id } })
      await db.permissionAuditLog.deleteMany({ where: { organizationId: org.id } })
      await db.membership.deleteMany({ where: { organizationId: org.id } })
      await db.user.deleteMany({ where: { organizationId: org.id } })
      await db.client.deleteMany({ where: { organizationId: org.id } })
      await db.organization.delete({ where: { id: org.id } })
    } catch (err) {
      console.warn(
        `[cleanupLeakedTestOrgs] failed to delete ${org.id} (prefix "${prefix}"):`,
        err,
      )
    }
  }
}
