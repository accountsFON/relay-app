/**
 * Demo seed: deterministic archived items for the trash UI.
 *
 * Run after all live data is seeded. Archives a small, predictable set of
 * rows so every tab in /admin/trash has non-zero counts and the badge
 * countdown spread is visually meaningful.
 *
 *   Posts:   1 per live client,  deletedAt = 3 days ago  (green badge — plenty of grace)
 *   Batch:   clients[0] first batch,  deletedAt = 25 days ago  (red badge — close to 30d purge)
 *             cascade-stamps contentRuns + posts inside the batch.
 *   Client:  last live client,  deletedAt = 7 days ago  (amber badge)
 *             cascade-stamps batches + contentRuns + posts.
 *
 * Safe to call on freshly seeded data. The soft-delete extension filters
 * archived rows from default queries, so findFirst/findMany calls here
 * will always find live rows (exactly what we want to archive).
 *
 * If a targeted row is already archived (re-run without --clean), the
 * update is a no-op because deletedAt is already set — we skip it to
 * avoid touching the existing timestamp.
 */
import type { DbClient } from '@/db/client'
import type { SeededClient } from './clients'

export interface SeedArchivedInput {
  db: DbClient
  /** An account-manager user — actor for post + batch archives. */
  actorUserId: string
  /** An admin user — actor for the client archive. */
  ownerUserId: string
  /** All live clients returned by seedClients. */
  clients: SeededClient[]
}

export async function seedArchivedItems(input: SeedArchivedInput): Promise<void> {
  const { db, actorUserId, ownerUserId, clients } = input
  const now = new Date()
  const days = (n: number) => new Date(now.getTime() - n * 86_400_000)

  // Only operate on clients that were seeded as live (active or paused).
  // The seed already has a ClientStatus.archived client (Polaris Wellness,
  // idx 18) that carries no batches/posts, so exclude it from the
  // cascade-client step.
  const liveClients = clients.filter((c) => c.status !== 'archived')

  if (liveClients.length === 0) {
    console.log('  seedArchivedItems: no live clients found, skipping')
    return
  }

  // ------------------------------------------------------------------ //
  // 1. Archive one POST per live client — 3 days ago                    //
  //    The soft-delete extension auto-filters archived rows so findFirst //
  //    returns the first live post for the client.                       //
  // ------------------------------------------------------------------ //
  let postCount = 0
  for (const client of liveClients) {
    // Use withArchived-negated form: default query already excludes deleted rows.
    const post = await db.post.findFirst({
      where: { clientId: client.id },
      select: { id: true, deletedAt: true },
      orderBy: { createdAt: 'asc' },
    })
    if (!post || post.deletedAt !== null) continue // already archived or none
    await db.post.update({
      where: { id: post.id },
      data: { deletedAt: days(3), deletedBy: actorUserId },
    })
    postCount++
  }

  // ------------------------------------------------------------------ //
  // 2. Archive one BATCH — 25 days ago (red badge in /admin/trash)      //
  //    Cascade-stamp all live contentRuns and posts inside the batch.    //
  // ------------------------------------------------------------------ //
  const targetClient = liveClients[0]
  const targetBatch = await db.batch.findFirst({
    where: { clientId: targetClient.id },
    select: { id: true, deletedAt: true },
    orderBy: { createdAt: 'asc' },
  })

  let batchArchived = false
  if (targetBatch && targetBatch.deletedAt === null) {
    const batchTs = days(25)
    await db.$transaction(async (tx) => {
      await tx.batch.update({
        where: { id: targetBatch.id },
        data: { deletedAt: batchTs, deletedBy: actorUserId },
      })

      // Stamp live contentRuns whose posts belong to this batch.
      const runs = await tx.contentRun.findMany({
        where: {
          posts: { some: { batchId: targetBatch.id } },
          deletedAt: null,
        },
        select: { id: true },
      })
      if (runs.length > 0) {
        await tx.contentRun.updateMany({
          where: { id: { in: runs.map((r) => r.id) } },
          data: { deletedAt: batchTs, deletedBy: actorUserId },
        })
      }

      // Stamp live posts inside the batch.
      await tx.post.updateMany({
        where: { batchId: targetBatch.id, deletedAt: null },
        data: { deletedAt: batchTs, deletedBy: actorUserId },
      })
    })
    batchArchived = true
  }

  // ------------------------------------------------------------------ //
  // 3. Archive the last live client — 7 days ago                        //
  //    Cascade-stamp all its batches, contentRuns, and posts.            //
  //    Use a different client from targetClient so the archived batch    //
  //    and the archived client belong to separate clients.               //
  // ------------------------------------------------------------------ //
  const churnedClient =
    liveClients.length > 1 ? liveClients[liveClients.length - 1] : null

  let clientArchived = false
  if (churnedClient && churnedClient.id !== targetClient.id) {
    // Fetch the raw DB row to check deletedAt regardless of soft-delete filter.
    // We use findFirst with the deletedAt key present so the extension passes
    // through without injecting its own filter.
    const rawClient = await db.client.findFirst({
      where: { id: churnedClient.id, deletedAt: null },
      select: { id: true },
    })

    if (rawClient) {
      const clientTs = days(7)
      await db.$transaction(async (tx) => {
        await tx.client.update({
          where: { id: churnedClient.id },
          data: { deletedAt: clientTs, deletedBy: ownerUserId },
        })
        await tx.batch.updateMany({
          where: { clientId: churnedClient.id, deletedAt: null },
          data: { deletedAt: clientTs, deletedBy: ownerUserId },
        })
        await tx.contentRun.updateMany({
          where: { clientId: churnedClient.id, deletedAt: null },
          data: { deletedAt: clientTs, deletedBy: ownerUserId },
        })
        await tx.post.updateMany({
          where: { clientId: churnedClient.id, deletedAt: null },
          data: { deletedAt: clientTs, deletedBy: ownerUserId },
        })
      })
      clientArchived = true
    }
  }

  console.log(
    `  ✓ Seeded archived items: ${postCount} posts (3d), ` +
      `${batchArchived ? '1 batch + cascade (25d)' : '0 batches'}, ` +
      `${clientArchived ? `1 client "${churnedClient?.name}" + cascade (7d)` : '0 clients'}`,
  )
}
