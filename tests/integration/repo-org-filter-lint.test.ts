/**
 * Static guard: every db.<model>.<verb>(...) call inside src/server/repositories
 * must include `organizationId` in its arguments. The whole multi-tenant
 * isolation story rests on this invariant. A new repo helper that forgets
 * the org filter is a silent cross-tenant data leak waiting to happen.
 *
 * This is intentionally an imperfect string-level check (false positives
 * possible when `organizationId` appears in a comment or unrelated string).
 * It's a guard rail, not a formal proof. Allow-listed files below are ones
 * that intentionally cross orgs (the Membership repo for org-switcher
 * support, Organization itself, audit log creator, platform-owner setter).
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'fs'
import path from 'node:path'

const REPO_DIR = path.join(process.cwd(), 'src/server/repositories')

const ALLOWLIST = new Set([
  // Operates on Memberships (which have userId+organizationId composite key);
  // queries by userId alone are correct (e.g., listMembershipsForUser for the
  // org switcher).
  'memberships.ts',
  // Operates on Organization itself, where organizationId is the primary key.
  'organizations.ts',
  // permissionAuditLogs.createMany takes organizationId via the entry data;
  // no findMany/updateMany/deleteMany calls.
  'permissionAuditLogs.ts',
  // roleDefaults: every helper takes organizationId in its signature.
  'roleDefaults.ts',
  // Users post-multi-tenant aren't org-scoped (they have N Memberships).
  // Queries by clerkUserId (login flow) and by id (platform-owner setter)
  // are both correct without an org filter.
  'users.ts',
  // ContentRuns are scoped indirectly via Client.organizationId. Every
  // caller goes through findClientForUser(ctx, clientId) before touching
  // a run, which validates the org membership for the active user.
  'contentRuns.ts',
  // Posts are scoped indirectly via ContentRun -> Client.organizationId.
  // Same pattern as ContentRuns.
  'posts.ts',
  // Batches are scoped indirectly via Batch.clientId -> Client.organizationId.
  // listStuckBatches takes orgId explicitly; every other caller resolves the
  // batch through findClientForUser first.
  'batches.ts',
  // ActivityEvent + Mention queries scope by clientId or mentionedUserId.
  // Per-spec note in activityEvents.ts: callers verify client visibility via
  // findClientForUser before reading; mention queries are per-user (which is
  // already user-private, not cross-org).
  'activityEvents.ts',
  // Search queries scope through the parent client's organizationId on every
  // entity. The lint regex truncates before reaching the nested filter on
  // long Prisma where clauses, but every search.ts call has explicit
  // `client: { organizationId: ctx.organizationDbId, ...scopeFilter }`.
  'search.ts',
  // Magic links are intentionally cross-org at the repository layer: the
  // security model is "knowing the signed token = access to the batch"
  // (Figma/Loom/Notion shared-link pattern). Every lookup is keyed by
  // tokenHash or sessionId, both of which are unguessable random secrets.
  // The /review/[token] middleware re-validates the token signature +
  // expiry + revocation before any handler reads from these helpers.
  'magicLinks.ts',
  // PostThreads + PostComments are scoped indirectly via Post -> Client.organizationId.
  // Every action wrapping these repo functions resolves auth via getOrgContext()
  // + findPostForUser() (or magic-link reviewer auth) before any repo call,
  // so the org boundary is enforced one layer up. Adding organizationId to
  // every PostThread query would require joining through Post for no
  // defense-in-depth gain.
  'threads.ts',
  // ReviewSessions + ReviewItems are scoped indirectly via
  // MagicLink -> Batch -> Client -> Organization. The reviewer-side
  // action layer (src/server/actions/reviewSessions.ts) re-validates the
  // signed URL token + the magic-link session cookie + cookie-magicLinkId
  // == URL-token-magicLinkId on every call; the AM-side actions (landing
  // in later Layer 2/3 tasks) use getOrgContext() then findClientForUser.
  // Same defense-in-depth profile as threads.ts above.
  'reviewSessions.ts',
  // In-app feedback (Phase 5 item 27) is intentionally not org-scoped.
  // Rows are operational reports from any signed-in user routed to
  // platform admins via the weekly digest + urgent paths. The action
  // layer (src/server/actions/feedback.ts) calls requireOrgContext()
  // for auth, but stamps userId only , there is no Feedback.organizationId
  // and admins span orgs by design.
  'feedback.ts',
])

function listTsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const full = path.join(dir, f)
    return statSync(full).isDirectory()
      ? listTsFiles(full)
      : full.endsWith('.ts') && !full.endsWith('.test.ts')
        ? [full]
        : []
  })
}

describe('repo helpers always include organizationId in scoped operations', () => {
  it('every db.<model>.<verb>(...) call in scoped repo files mentions organizationId', () => {
    const files = listTsFiles(REPO_DIR)
    const violations: string[] = []

    for (const file of files) {
      const basename = path.basename(file)
      if (ALLOWLIST.has(basename)) continue

      const content = readFileSync(file, 'utf-8')
      // Match db.<model>.<verb>(...) capturing the args. Crude but works
      // for a sanity check.
      // Reads/updates/deletes are where missing organizationId silently
      // leaks data. Creates are excluded: missing organizationId on a
      // create fails at runtime via Prisma (required FK), not silently.
      const callRegex =
        /db\.\w+\.(findMany|findFirst|findUnique|updateMany|deleteMany|update|delete)\s*\(\s*\{[^}]*\}/gm
      const calls = content.match(callRegex) ?? []

      for (const call of calls) {
        if (!call.includes('organizationId')) {
          violations.push(
            `${path.relative(process.cwd(), file)}:\n  ${call.replace(/\s+/g, ' ').slice(0, 140)}...`,
          )
        }
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `Found ${violations.length} repo call(s) missing organizationId:\n\n` +
          violations.join('\n\n') +
          '\n\nIf the call is intentionally cross-org, add the file to the ALLOWLIST in this test.',
      )
    }
    expect(violations).toEqual([])
  })
})
