import { db } from '@/db/client'
import { NextResponse } from 'next/server'

/**
 * Public, unauthenticated health probe (allowlisted in src/lib/route-matchers).
 *
 * Reports two independent things:
 *
 *  - `version`: WHICH build is serving. Added 2026-08-17 after a GitHub outage
 *    (Actions, API and Webhooks all degraded) meant neither the GitHub
 *    deployment record nor the commit status ever appeared for a merge that had
 *    in fact deployed cleanly. There was no way to answer "is what I merged
 *    actually live?" without dropping to the Vercel CLI. Now it is one curl,
 *    and it depends on neither GitHub nor Vercel's API:
 *
 *      curl relay-app-xi.vercel.app/api/health
 *
 *    Compare `version.commit` against `git log --oneline -1` on main.
 *
 *  - `checks`: whether this build can actually work (required env vars present,
 *    database reachable).
 *
 * `version` is deliberately OUTSIDE `checks`, because `allOk` below scans every
 * value in `checks` for MISSING/FAILED prefixes; a branch named
 * `fix/MISSING-thing` landing in there would flip the verdict. It is also
 * reported even when the probe is degraded, since a broken deploy is exactly
 * when you most need to know which commit is serving.
 *
 * Only non-sensitive identifiers are exposed: a commit SHA, a branch name, the
 * environment, and the Vercel deployment id. No values, no secrets. The
 * endpoint already reported which env vars are set, which is the more sensitive
 * half and is unchanged.
 */

/** Vercel sets these automatically on every deployment. Absent locally. */
function buildVersion() {
  const fullCommit = process.env.VERCEL_GIT_COMMIT_SHA ?? null
  return {
    // Short form so it can be eyeballed straight against `git log --oneline`.
    commit: fullCommit ? fullCommit.slice(0, 7) : 'local',
    fullCommit,
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    env: process.env.VERCEL_ENV ?? 'local',
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
  }
}

export async function GET() {
  const checks: Record<string, string> = {}

  checks.env_database_url = process.env.DATABASE_URL ? 'set' : 'MISSING'
  checks.env_clerk_secret = process.env.CLERK_SECRET_KEY ? 'set' : 'MISSING'
  checks.env_openai = process.env.OPENAI_API_KEY ? 'set' : 'MISSING'
  checks.env_anthropic = process.env.ANTHROPIC_API_KEY ? 'set' : 'MISSING'
  checks.env_firecrawl = process.env.FIRECRAWL_API_KEY ? 'set' : 'MISSING'

  try {
    await db.$queryRawUnsafe('SELECT 1')
    checks.database = 'connected'
  } catch (error) {
    checks.database = `FAILED: ${error instanceof Error ? error.message : String(error)}`
  }

  const allOk = !Object.values(checks).some((v) => v.startsWith('MISSING') || v.startsWith('FAILED'))

  return NextResponse.json(
    { status: allOk ? 'ok' : 'degraded', version: buildVersion(), checks },
    { status: allOk ? 200 : 503 }
  )
}
