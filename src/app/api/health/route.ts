import { db } from '@/db/client'
import { NextResponse } from 'next/server'

export async function GET() {
  const checks: Record<string, string> = {}

  checks.env_database_url = process.env.DATABASE_URL ? 'set' : 'MISSING'
  checks.env_clerk_secret = process.env.CLERK_SECRET_KEY ? 'set' : 'MISSING'
  checks.env_openai = process.env.OPENAI_API_KEY ? 'set' : 'MISSING'
  checks.env_anthropic = process.env.ANTHROPIC_API_KEY ? 'set' : 'MISSING'
  checks.env_apify = process.env.APIFY_TOKEN ? 'set' : 'MISSING'

  try {
    await db.$queryRawUnsafe('SELECT 1')
    checks.database = 'connected'
  } catch (error) {
    checks.database = `FAILED: ${error instanceof Error ? error.message : String(error)}`
  }

  const allOk = !Object.values(checks).some((v) => v.startsWith('MISSING') || v.startsWith('FAILED'))

  return NextResponse.json(
    { status: allOk ? 'ok' : 'degraded', checks },
    { status: allOk ? 200 : 503 }
  )
}
