import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { applySoftDelete } from './soft-delete-extension'

// The extended type includes the soft-delete helpers (withArchived / onlyArchived).
// Export this so downstream code can use it instead of the raw PrismaClient type.
export type DbClient = ReturnType<typeof applySoftDelete>

/**
 * The transaction client type for the extended client.
 * Use this instead of `Prisma.TransactionClient` in files that accept `db` or
 * a transaction as a parameter — Prisma's extension changes the transaction
 * client's generic shape.
 *
 * Usage:
 *   type DbOrTx = DbClient | DbTx
 *   async function myFn(tx?: DbOrTx) { ... }
 */
export type DbTx = Parameters<DbClient['$transaction']>[0] extends (
  tx: infer T,
) => Promise<unknown>
  ? T
  : never

const globalForPrisma = globalThis as unknown as { prisma: DbClient | undefined }

function createPrismaClient(): DbClient {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)
  const base = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })
  return applySoftDelete(base)
}

export const db = globalForPrisma.prisma ?? createPrismaClient()
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
