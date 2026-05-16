/**
 * Apply pending Prisma migrations against TEST_DATABASE_URL before the
 * integration test suite runs. Hooked into npm via the `pretest:integration`
 * script in package.json.
 */
import path from 'node:path'
import dotenv from 'dotenv'
import { spawnSync } from 'node:child_process'
import { assertNotProdDb } from '@/lib/db-guardrail'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const testUrl = process.env.TEST_DATABASE_URL
if (!testUrl) {
  console.error(
    '[migrate-test-db] TEST_DATABASE_URL is unset. Add it to .env.local.\n' +
      '  See projects/relay-app/2026-05-15-neon-db-split-design.md',
  )
  process.exit(1)
}
assertNotProdDb(testUrl)

const result = spawnSync(
  'npx',
  ['prisma', 'migrate', 'deploy', '--schema=src/db/schema.prisma'],
  {
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: 'inherit',
  },
)
process.exit(result.status ?? 1)
