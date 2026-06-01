import { schedules, logger } from '@trigger.dev/sdk/v3'
import { db } from '@/db/client'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * The warning fires when deletedAt falls in the window:
 *   (now - 24 days, now - 23 days]
 *
 * At purge time the item will be 30 days old, so this fires 6-7 days before
 * purge, nominally ~7 days before (when deletedAt ≈ now - 23 days).
 *
 * Crucially the 1-day-wide window means each item is caught exactly once
 * across its lifetime, regardless of how many times the daily job runs.
 */
const WINDOW_LO_DAYS = 24 // exclusive lower bound (gt)
const WINDOW_HI_DAYS = 23 // inclusive upper bound (lte)
const DAYS_UNTIL_PURGE = 7 // label shown to recipients

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ImpendingItem {
  type: 'Client' | 'Batch' | 'ContentRun' | 'Post'
  label: string
  archivedBy: string | null
  archivedAt: Date
}

export interface RecipientAddress {
  email: string
  displayName: string | null
}

// ---------------------------------------------------------------------------
// Notification stub
//
// Placeholder, replace the body with a real email send once transport is
// added (e.g., Resend). The function signature and call site stay unchanged.
// ---------------------------------------------------------------------------

export async function notifyOrgAdminsOfImpendingPurge(
  orgId: string,
  orgName: string,
  recipients: RecipientAddress[],
  items: ImpendingItem[],
  scheduledPurgeDate: Date,
): Promise<void> {
  logger.warn('Impending trash purge notification (transport stub)', {
    orgId,
    orgName,
    recipientCount: recipients.length,
    recipientEmails: recipients.map((r) => r.email),
    scheduledPurgeDate: scheduledPurgeDate.toISOString(),
    itemCount: items.length,
    items: items
      .slice(0, 20)
      .map((i) => ({
        type: i.type,
        label: i.label.slice(0, 80),
        archivedAt: i.archivedAt.toISOString(),
      })),
  })
  // TODO: replace with real email send once transport is added. Example:
  //   await resend.emails.send({
  //     from: 'noreply@relay.app',
  //     to: recipients.map(r => r.email),
  //     subject: `7 days until permanent deletion in ${orgName}`,
  //     react: ImpendingPurgeEmail({ orgName, items, scheduledPurgeDate }),
  //   });
}

// ---------------------------------------------------------------------------
// Inner run logic, exported so integration tests can call it directly
// without needing the Trigger.dev harness.
// ---------------------------------------------------------------------------

export interface NotifyRunResult {
  orgsNotified: number
  itemCount: number
}

export interface NotifyRunOptions {
  /** Override the current time (useful for testing). */
  now?: Date
  /**
   * Restrict processing to specific organizations. Used only in tests to
   * prevent globally-scoped queries from touching fixtures from other tests.
   *
   * @internal Do not use in production code.
   */
  _testOrganizationIds?: string[]
}

export async function runNotifyImpendingPurge(
  options: NotifyRunOptions = {},
): Promise<NotifyRunResult> {
  const now = options.now ?? new Date()
  const lo = new Date(now.getTime() - WINDOW_LO_DAYS * 86_400_000) // exclusive lower bound
  const hi = new Date(now.getTime() - WINDOW_HI_DAYS * 86_400_000) // inclusive upper bound

  const orgFilter =
    options._testOrganizationIds && options._testOrganizationIds.length > 0
      ? options._testOrganizationIds
      : null

  // -------------------------------------------------------------------------
  // Step 1: Query all 4 entity types in the 1-day window in parallel
  // -------------------------------------------------------------------------

  const [clients, batches, runs, posts] = await Promise.all([
    db.client.onlyArchived().findMany({
      where: {
        deletedAt: { gt: lo, lte: hi },
        ...(orgFilter ? { organizationId: { in: orgFilter } } : {}),
      },
      select: {
        id: true,
        name: true,
        deletedAt: true,
        deletedBy: true,
        organizationId: true,
      },
    }),
    db.batch.onlyArchived().findMany({
      where: {
        deletedAt: { gt: lo, lte: hi },
        ...(orgFilter ? { client: { organizationId: { in: orgFilter } } } : {}),
      },
      select: {
        id: true,
        label: true,
        deletedAt: true,
        deletedBy: true,
        clientId: true,
      },
    }),
    db.contentRun.onlyArchived().findMany({
      where: {
        deletedAt: { gt: lo, lte: hi },
        ...(orgFilter ? { client: { organizationId: { in: orgFilter } } } : {}),
      },
      select: {
        id: true,
        targetMonth: true,
        deletedAt: true,
        deletedBy: true,
        clientId: true,
      },
    }),
    db.post.onlyArchived().findMany({
      where: {
        deletedAt: { gt: lo, lte: hi },
        ...(orgFilter ? { client: { organizationId: { in: orgFilter } } } : {}),
      },
      select: {
        id: true,
        caption: true,
        deletedAt: true,
        deletedBy: true,
        clientId: true,
      },
    }),
  ])

  // -------------------------------------------------------------------------
  // Step 2: Resolve orgId for child entities (Batch, ContentRun, Post)
  // via their parent Client
  // -------------------------------------------------------------------------

  const childClientIds = Array.from(
    new Set([
      ...batches.map((b) => b.clientId),
      ...runs.map((r) => r.clientId),
      ...posts.map((p) => p.clientId),
    ]),
  )

  const orgByClient = new Map<string, { id: string; name: string; organizationId: string }>()
  if (childClientIds.length > 0) {
    const rows = await db.client.withArchived().findMany({
      where: { id: { in: childClientIds } },
      select: { id: true, name: true, organizationId: true },
    })
    for (const r of rows) orgByClient.set(r.id, r)
  }

  // -------------------------------------------------------------------------
  // Step 3: Resolve actor display names for archivedBy
  // -------------------------------------------------------------------------

  const actorIds = Array.from(
    new Set(
      [
        ...clients.map((c) => c.deletedBy),
        ...batches.map((b) => b.deletedBy),
        ...runs.map((r) => r.deletedBy),
        ...posts.map((p) => p.deletedBy),
      ].filter(Boolean) as string[],
    ),
  )

  const actorMap = new Map<string, string>()
  if (actorIds.length > 0) {
    const users = await db.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, name: true, email: true },
    })
    for (const u of users) actorMap.set(u.id, u.name ?? u.email)
  }

  // -------------------------------------------------------------------------
  // Step 4: Group items by org
  // -------------------------------------------------------------------------

  const byOrg = new Map<string, ImpendingItem[]>()

  const pushItem = (orgId: string, item: ImpendingItem) => {
    const list = byOrg.get(orgId) ?? []
    list.push(item)
    byOrg.set(orgId, list)
  }

  for (const c of clients) {
    pushItem(c.organizationId, {
      type: 'Client',
      label: c.name,
      archivedBy: c.deletedBy ? (actorMap.get(c.deletedBy) ?? null) : null,
      archivedAt: c.deletedAt!,
    })
  }

  for (const b of batches) {
    const cl = orgByClient.get(b.clientId)
    if (!cl) continue
    pushItem(cl.organizationId, {
      type: 'Batch',
      label: `${b.label} (${cl.name})`,
      archivedBy: b.deletedBy ? (actorMap.get(b.deletedBy) ?? null) : null,
      archivedAt: b.deletedAt!,
    })
  }

  for (const r of runs) {
    const cl = orgByClient.get(r.clientId)
    if (!cl) continue
    pushItem(cl.organizationId, {
      type: 'ContentRun',
      label: `Run for ${cl.name} (${r.targetMonth})`,
      archivedBy: r.deletedBy ? (actorMap.get(r.deletedBy) ?? null) : null,
      archivedAt: r.deletedAt!,
    })
  }

  for (const p of posts) {
    const cl = orgByClient.get(p.clientId)
    if (!cl) continue
    pushItem(cl.organizationId, {
      type: 'Post',
      label: `${p.caption.slice(0, 80)}… (${cl.name})`,
      archivedBy: p.deletedBy ? (actorMap.get(p.deletedBy) ?? null) : null,
      archivedAt: p.deletedAt!,
    })
  }

  // -------------------------------------------------------------------------
  // Step 5: Early exit if nothing hit the window
  // -------------------------------------------------------------------------

  const orgIds = Array.from(byOrg.keys())
  if (orgIds.length === 0) {
    logger.info('No items hit the impending-purge window today', { now: now.toISOString() })
    return { orgsNotified: 0, itemCount: 0 }
  }

  // -------------------------------------------------------------------------
  // Step 6: Fetch org names + admin recipients
  // -------------------------------------------------------------------------

  const [orgs, memberships] = await Promise.all([
    db.organization.findMany({
      where: { id: { in: orgIds } },
      select: { id: true, name: true },
    }),
    db.membership.findMany({
      where: { organizationId: { in: orgIds }, role: 'admin' },
      select: {
        organizationId: true,
        user: { select: { email: true, name: true } },
      },
    }),
  ])

  const orgNames = new Map<string, string>()
  for (const o of orgs) orgNames.set(o.id, o.name)

  const adminsByOrg = new Map<string, RecipientAddress[]>()
  for (const m of memberships) {
    const list = adminsByOrg.get(m.organizationId) ?? []
    list.push({ email: m.user.email, displayName: m.user.name ?? null })
    adminsByOrg.set(m.organizationId, list)
  }

  // -------------------------------------------------------------------------
  // Step 7: Dispatch one notification per org
  // -------------------------------------------------------------------------

  const scheduledPurgeDate = new Date(now.getTime() + DAYS_UNTIL_PURGE * 86_400_000)
  let orgsNotified = 0
  let totalItems = 0

  for (const [orgId, items] of byOrg.entries()) {
    const recipients = adminsByOrg.get(orgId) ?? []
    if (recipients.length === 0) {
      logger.warn('No admin recipients for impending purge warning', {
        orgId,
        itemCount: items.length,
      })
      continue
    }

    await notifyOrgAdminsOfImpendingPurge(
      orgId,
      orgNames.get(orgId) ?? orgId,
      recipients,
      items,
      scheduledPurgeDate,
    )

    orgsNotified += 1
    totalItems += items.length
  }

  return { orgsNotified, itemCount: totalItems }
}

// ---------------------------------------------------------------------------
// Trigger.dev scheduled task wrapper
// ---------------------------------------------------------------------------

export const notifyImpendingPurgeTask = schedules.task({
  id: 'notify-impending-purge',
  cron: '0 9 * * *', // daily at 09:00 UTC
  run: () => runNotifyImpendingPurge({}),
})
