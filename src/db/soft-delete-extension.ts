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
 * How the flags flow:
 *
 * 1. `withArchived()` / `onlyArchived()` are model-level methods that return
 *    a new model delegate proxy with `_withArchived` or `_onlyArchived`
 *    properties set on it. Each query method (findMany, findFirst, etc.) on
 *    that proxy injects the flag into the `args` object before forwarding.
 *
 * 2. The query interceptors read and strip `_withArchived` / `_onlyArchived`
 *    from `args`, then inject the appropriate `deletedAt` filter (or skip it).
 *
 * The flags are never forwarded to Prisma's SQL builder — they are consumed
 * and removed inside the interceptors.
 */
import { PrismaClient, Prisma } from '@prisma/client'

/**
 * Prisma's query interceptor receives lowercase camelCase model names that
 * match the `modelProps` keys in the generated client type map
 * (e.g. "client", "contentRun", "batch", "post").
 */
const SOFT_DELETE_MODELS = ['client', 'contentRun', 'batch', 'post'] as const
type SoftDeleteModel = (typeof SOFT_DELETE_MODELS)[number]

function isSoftDeleteModel(model: string | undefined): model is SoftDeleteModel {
  return SOFT_DELETE_MODELS.includes(model as SoftDeleteModel)
}

// Internal arg shape used inside the interceptors.
// The flag keys are stripped before the query reaches Prisma's core.
type SoftDeleteArgs = {
  where?: Record<string, unknown>
  _withArchived?: boolean
  _onlyArchived?: boolean
  [key: string]: unknown
}

// Shared logic for injecting (or skipping) the soft-delete filter
function injectFilter(args: SoftDeleteArgs): SoftDeleteArgs {
  const { _withArchived, _onlyArchived, ...rest } = args
  if (_withArchived) return rest
  return {
    ...rest,
    where: {
      ...rest.where,
      deletedAt: _onlyArchived ? { not: null } : null,
    },
  }
}

// ---------------------------------------------------------------------------
// Extension factory
// ---------------------------------------------------------------------------
export function applySoftDelete<T extends PrismaClient>(client: T) {
  return client.$extends({
    name: 'softDelete',

    // -----------------------------------------------------------------------
    // Query interceptors — auto-inject deletedAt filter for the 4 models
    // -----------------------------------------------------------------------
    query: {
      $allModels: {
        async findMany({
          model,
          args,
          query,
        }: {
          model?: string
          args: SoftDeleteArgs
          query: (args: SoftDeleteArgs) => Promise<unknown>
        }) {
          if (!isSoftDeleteModel(model)) return query(args)
          return query(injectFilter(args))
        },

        async findFirst({
          model,
          args,
          query,
        }: {
          model?: string
          args: SoftDeleteArgs
          query: (args: SoftDeleteArgs) => Promise<unknown>
        }) {
          if (!isSoftDeleteModel(model)) return query(args)
          return query(injectFilter(args))
        },

        async findUnique({
          model,
          args,
          query,
        }: {
          model?: string
          args: SoftDeleteArgs
          query: (args: SoftDeleteArgs) => Promise<unknown>
        }) {
          if (!isSoftDeleteModel(model)) return query(args)
          return query(injectFilter(args))
        },

        async count({
          model,
          args,
          query,
        }: {
          model?: string
          args: SoftDeleteArgs
          query: (args: SoftDeleteArgs) => Promise<unknown>
        }) {
          if (!isSoftDeleteModel(model)) return query(args)
          return query(injectFilter(args))
        },
      },
    },

    // -----------------------------------------------------------------------
    // Model helpers — return a delegate that injects flags into query args
    // -----------------------------------------------------------------------
    model: {
      $allModels: {
        /**
         * Returns a model delegate that includes soft-deleted rows alongside
         * live rows in subsequent read queries.
         *
         * Usage: `db.client.withArchived().findMany({ where: ... })`
         */
        withArchived<M>(this: M): Omit<M, 'withArchived' | 'onlyArchived'> {
          // Wrap each query operation to inject _withArchived into the args
          return buildFlagProxy(this as object, '_withArchived') as Omit<
            M,
            'withArchived' | 'onlyArchived'
          >
        },

        /**
         * Returns a model delegate whose read queries return ONLY
         * soft-deleted rows (deletedAt IS NOT NULL).
         *
         * Usage: `db.client.onlyArchived().findMany({ where: ... })`
         */
        onlyArchived<M>(this: M): Omit<M, 'withArchived' | 'onlyArchived'> {
          return buildFlagProxy(this as object, '_onlyArchived') as Omit<
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
 * method whose first argument is an `args` object by injecting a flag field
 * (`_withArchived` or `_onlyArchived`) into that args object.
 *
 * This is the mechanism that bridges the model-level helper (which returns a
 * new model context) to the query interceptor (which reads flags from `args`).
 */
function buildFlagProxy(target: object, flag: '_withArchived' | '_onlyArchived') {
  return new Proxy(target, {
    get(obj, prop: string | symbol) {
      const value = (obj as Record<string | symbol, unknown>)[prop]
      if (typeof value !== 'function') return value
      // Wrap the method: inject the flag into the first argument
      return (args: SoftDeleteArgs = {}, ...rest: unknown[]) => {
        return (value as Function).call(obj, { ...args, [flag]: true }, ...rest)
      }
    },
  })
}
