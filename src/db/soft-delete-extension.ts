/**
 * Soft-delete Prisma extension.
 *
 * Wraps a PrismaClient so that queries on the four soft-deletable models
 * (Client, Batch, ContentRun, Post) automatically filter out rows where
 * `deletedAt` is not null. Two opt-in escape hatches are provided:
 *
 *   db.client.withArchived().findMany(...)   — returns live + archived rows
 *   db.client.onlyArchived().findMany(...)   — returns only archived rows
 *
 * How the filtering works:
 *
 * 1. Query interceptors inject `deletedAt: null` into the `where` clause
 *    for every read operation on the four soft-deletable models, unless the
 *    caller has already supplied a `deletedAt` key in `where`.
 *
 * 2. `withArchived()` returns a model proxy whose read methods inject
 *    `where.deletedAt = undefined` before calling the real Prisma method.
 *    The `undefined` value satisfies Prisma's type validator (treated as
 *    "field not set") while causing the `'deletedAt' in where` check in
 *    the interceptor to evaluate to `true`, which signals the interceptor
 *    to leave the `deletedAt` filter alone.
 *
 * 3. `onlyArchived()` returns a model proxy whose read methods inject
 *    `where.deletedAt = { not: null }` — the interceptor sees the key
 *    present and passes it through unchanged, so only soft-deleted rows
 *    are returned.
 *
 * This approach avoids the previous `_withArchived` / `_onlyArchived`
 * flag mechanism, which failed against real Prisma because Prisma's
 * strict input validator rejects unknown argument names before the
 * query interceptors have a chance to strip them.
 */
import { PrismaClient } from '@prisma/client'

/**
 * Prisma's query interceptor receives lowercase camelCase model names that
 * match the `modelProps` keys in the generated client type map
 * (e.g. "client", "contentRun", "batch", "post").
 *
 * The set uses lowercase for case-insensitive comparison since Prisma
 * passes the model name with its original casing.
 */
const SOFT_DELETE_MODELS = new Set(['client', 'contentrun', 'batch', 'post'])

function isSoftDeleteModel(model: string | undefined): boolean {
  return SOFT_DELETE_MODELS.has((model ?? '').toLowerCase())
}

type WhereArg = Record<string, unknown> | undefined

/**
 * Inject `deletedAt: null` into `where` unless the caller has already
 * provided a `deletedAt` key (which signals withArchived / onlyArchived
 * opt-out mode).
 */
function injectDefaultFilter(args: { where?: WhereArg; [k: string]: unknown }) {
  if ('deletedAt' in (args.where ?? {})) return args
  return { ...args, where: { ...args.where, deletedAt: null } }
}

// ---------------------------------------------------------------------------
// Extension factory
// ---------------------------------------------------------------------------
export function applySoftDelete<T extends PrismaClient>(client: T) {
  return client.$extends({
    name: 'softDelete',

    // -----------------------------------------------------------------------
    // Query interceptors — auto-inject deletedAt: null for the 4 models
    // unless the caller already set a deletedAt filter in `where`.
    // -----------------------------------------------------------------------
    query: {
      $allModels: {
        async findMany({
          model,
          args,
          query,
        }: {
          model?: string
          args: { where?: WhereArg; [k: string]: unknown }
          query: (args: { where?: WhereArg; [k: string]: unknown }) => Promise<unknown>
        }) {
          if (!isSoftDeleteModel(model)) return query(args)
          return query(injectDefaultFilter(args))
        },

        async findFirst({
          model,
          args,
          query,
        }: {
          model?: string
          args: { where?: WhereArg; [k: string]: unknown }
          query: (args: { where?: WhereArg; [k: string]: unknown }) => Promise<unknown>
        }) {
          if (!isSoftDeleteModel(model)) return query(args)
          return query(injectDefaultFilter(args))
        },

        async findUnique({
          model,
          args,
          query,
        }: {
          model?: string
          args: { where?: WhereArg; [k: string]: unknown }
          query: (args: { where?: WhereArg; [k: string]: unknown }) => Promise<unknown>
        }) {
          if (!isSoftDeleteModel(model)) return query(args)
          return query(injectDefaultFilter(args))
        },

        async count({
          model,
          args,
          query,
        }: {
          model?: string
          args: { where?: WhereArg; [k: string]: unknown }
          query: (args: { where?: WhereArg; [k: string]: unknown }) => Promise<unknown>
        }) {
          if (!isSoftDeleteModel(model)) return query(args)
          return query(injectDefaultFilter(args))
        },
      },
    },

    // -----------------------------------------------------------------------
    // Model helpers — return a delegate that pre-sets `where.deletedAt`
    // to signal the interceptor to skip its default injection.
    // -----------------------------------------------------------------------
    model: {
      $allModels: {
        /**
         * Returns a model delegate whose read queries include both live and
         * soft-deleted rows (i.e. no `deletedAt` filter is applied).
         *
         * Usage: `db.client.withArchived().findMany({ where: ... })`
         *
         * Mechanism: injects `where.deletedAt = undefined` into each call.
         * The `undefined` value is valid per Prisma's type validator (treated
         * as "field not set" at the SQL level) while the presence of the key
         * in the `where` object tells the interceptor the caller has opted out.
         */
        withArchived<M>(this: M): Omit<M, 'withArchived' | 'onlyArchived'> {
          return buildWhereProxy(this as object, undefined) as Omit<
            M,
            'withArchived' | 'onlyArchived'
          >
        },

        /**
         * Returns a model delegate whose read queries return ONLY
         * soft-deleted rows (deletedAt IS NOT NULL).
         *
         * Usage: `db.client.onlyArchived().findMany({ where: ... })`
         *
         * Mechanism: injects `where.deletedAt = { not: null }` into each call.
         * The interceptor sees the key present and passes the filter through.
         */
        onlyArchived<M>(this: M): Omit<M, 'withArchived' | 'onlyArchived'> {
          return buildWhereProxy(this as object, { not: null }) as Omit<
            M,
            'withArchived' | 'onlyArchived'
          >
        },
      },
    },
  })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a Proxy over the Prisma model delegate `target` that wraps every
 * method whose first argument is an `args` object by injecting a specific
 * `where.deletedAt` value into that args object.
 *
 * - `deletedAtValue = undefined`   → withArchived  (no filter applied)
 * - `deletedAtValue = { not:null }` → onlyArchived (only soft-deleted rows)
 */
function buildWhereProxy(
  target: object,
  deletedAtValue: undefined | { not: null },
) {
  return new Proxy(target, {
    get(obj, prop: string | symbol) {
      const value = (obj as Record<string | symbol, unknown>)[prop]
      if (typeof value !== 'function') return value
      return (args: { where?: WhereArg; [k: string]: unknown } = {}, ...rest: unknown[]) => {
        const newWhere = Object.assign({ deletedAt: deletedAtValue }, args.where)
        return (value as Function).call(obj, { ...args, where: newWhere }, ...rest)
      }
    },
  })
}
