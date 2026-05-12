/**
 * Tests for the soft-delete Prisma extension.
 *
 * Strategy: unit-test `applySoftDelete` directly rather than hitting the DB.
 * We construct a minimal fake Prisma client that has `$extends` and records
 * the intercepted args so we can assert on what was injected.
 */
import { describe, it, expect } from 'vitest'
import { applySoftDelete } from '@/db/soft-delete-extension'

// ---------------------------------------------------------------------------
// Minimal fake client that mimics the Prisma $extends surface
// ---------------------------------------------------------------------------

/**
 * Build a fake client whose `$extends` method applies the extension by
 * calling the extension factory with the fake client, then returns a proxy
 * that routes model/operation calls through the registered query interceptors.
 *
 * This allows us to call `extendedClient.client.findMany(...)` and verify
 * the extension injects the correct `deletedAt` filter.
 */
function buildFakeClient() {
  // Storage for the interceptors registered by the extension
  let registeredInterceptors: Record<string, Record<string, Function>> = {}
  let registeredModelMethods: Record<string, Record<string, Function>> = {}

  const fakeClient = {
    $extends(ext: {
      name?: string
      query?: Record<string, Record<string, Function>>
      model?: Record<string, Record<string, Function>>
    }) {
      if (ext.query) {
        registeredInterceptors = ext.query as typeof registeredInterceptors
      }
      if (ext.model) {
        registeredModelMethods = ext.model as typeof registeredModelMethods
      }

      // Return a proxy that simulates model.operation() calls
      return new Proxy(
        {},
        {
          get(_target, modelName: string) {
            return new Proxy(
              {},
              {
                get(_modelTarget, operation: string) {
                  // Check if there's a custom model method (e.g. withArchived)
                  const allModelMethods = registeredModelMethods['$allModels'] ?? {}
                  if (operation in allModelMethods) {
                    // Return the model method bound to a context that knows its model name
                    return function (this: unknown) {
                      return allModelMethods[operation].call(
                        buildModelContext(modelName, operation),
                      )
                    }
                  }

                  // Otherwise, return a function that runs query interceptors
                  return async (args: Record<string, unknown> = {}) => {
                    const allOpsInterceptor =
                      registeredInterceptors['$allModels']?.[operation]
                    if (allOpsInterceptor) {
                      // Simulate what Prisma does: call the interceptor with
                      // { model, args, query } where query is the base resolver
                      const baseQuery = async (resolvedArgs: Record<string, unknown>) =>
                        resolvedArgs // just echo args back for inspection
                      return allOpsInterceptor({ model: modelName, args, query: baseQuery })
                    }
                    return args // no interceptor — pass through
                  }
                },
              },
            )
          },
        },
      ) as ReturnType<typeof applySoftDelete>
    },
  }

  // Build a model context object that withArchived/onlyArchived can work with
  function buildModelContext(modelName: string, _operation: string) {
    return new Proxy(
      {},
      {
        get(_t, op: string) {
          const allModelMethods = registeredModelMethods['$allModels'] ?? {}
          if (op in allModelMethods) {
            return function (this: unknown) {
              return allModelMethods[op].call(buildModelContext(modelName, op))
            }
          }
          // Simulate the underlying operation call (findMany etc.)
          return async (args: Record<string, unknown> = {}) => {
            const allOpsInterceptor = registeredInterceptors['$allModels']?.[op]
            if (allOpsInterceptor) {
              const baseQuery = async (resolvedArgs: Record<string, unknown>) => resolvedArgs
              return allOpsInterceptor({ model: modelName, args, query: baseQuery })
            }
            return args
          }
        },
      },
    )
  }

  return fakeClient as unknown as Parameters<typeof applySoftDelete>[0]
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('applySoftDelete extension', () => {
  // -------------------------------------------------------------------------
  // findMany
  // -------------------------------------------------------------------------
  describe('findMany', () => {
    it('injects deletedAt: null for soft-delete models by default', async () => {
      const extended = applySoftDelete(buildFakeClient())
      const result = await (extended.client.findMany as Function)({ where: { organizationId: 'org1' } })
      expect(result).toMatchObject({ where: { organizationId: 'org1', deletedAt: null } })
    })

    it('injects deletedAt: null for Batch model', async () => {
      const extended = applySoftDelete(buildFakeClient())
      const result = await (extended.batch.findMany as Function)({ where: { clientId: 'c1' } })
      expect(result).toMatchObject({ where: { clientId: 'c1', deletedAt: null } })
    })

    it('injects deletedAt: null for ContentRun model', async () => {
      const extended = applySoftDelete(buildFakeClient())
      const result = await (extended.contentRun.findMany as Function)({})
      expect(result).toMatchObject({ where: { deletedAt: null } })
    })

    it('injects deletedAt: null for Post model', async () => {
      const extended = applySoftDelete(buildFakeClient())
      const result = await (extended.post.findMany as Function)({})
      expect(result).toMatchObject({ where: { deletedAt: null } })
    })

    it('does NOT inject deletedAt for non-soft-delete models', async () => {
      const extended = applySoftDelete(buildFakeClient())
      const result = await (extended.organization.findMany as Function)({ where: { name: 'Acme' } })
      // deletedAt should not be injected
      expect((result as any).where?.deletedAt).toBeUndefined()
    })
  })

  // -------------------------------------------------------------------------
  // findFirst
  // -------------------------------------------------------------------------
  describe('findFirst', () => {
    it('injects deletedAt: null by default', async () => {
      const extended = applySoftDelete(buildFakeClient())
      const result = await (extended.client.findFirst as Function)({ where: { id: 'c1' } })
      expect(result).toMatchObject({ where: { id: 'c1', deletedAt: null } })
    })
  })

  // -------------------------------------------------------------------------
  // findUnique
  // -------------------------------------------------------------------------
  describe('findUnique', () => {
    it('injects deletedAt: null by default', async () => {
      const extended = applySoftDelete(buildFakeClient())
      const result = await (extended.client.findUnique as Function)({ where: { id: 'c1' } })
      expect(result).toMatchObject({ where: { id: 'c1', deletedAt: null } })
    })
  })

  // -------------------------------------------------------------------------
  // count
  // -------------------------------------------------------------------------
  describe('count', () => {
    it('injects deletedAt: null by default', async () => {
      const extended = applySoftDelete(buildFakeClient())
      const result = await (extended.client.count as Function)({ where: { organizationId: 'org1' } })
      expect(result).toMatchObject({ where: { organizationId: 'org1', deletedAt: null } })
    })
  })

  // -------------------------------------------------------------------------
  // withArchived() — opt-in to include archived rows alongside live ones
  // -------------------------------------------------------------------------
  describe('withArchived()', () => {
    it('skips the deletedAt filter so archived rows are returned', async () => {
      const extended = applySoftDelete(buildFakeClient())
      // withArchived() returns a model proxy with _withArchived flag set
      const proxyModel = (extended.client as any).withArchived()
      const result = await proxyModel.findMany({ where: { organizationId: 'org1' } })
      // deletedAt should NOT be injected
      expect((result as any).where?.deletedAt).toBeUndefined()
    })
  })

  // -------------------------------------------------------------------------
  // onlyArchived() — opt-in to return only archived rows
  // -------------------------------------------------------------------------
  describe('onlyArchived()', () => {
    it('injects deletedAt: { not: null } to return only archived rows', async () => {
      const extended = applySoftDelete(buildFakeClient())
      const proxyModel = (extended.client as any).onlyArchived()
      const result = await proxyModel.findMany({ where: { organizationId: 'org1' } })
      expect(result).toMatchObject({
        where: { organizationId: 'org1', deletedAt: { not: null } },
      })
    })
  })
})
