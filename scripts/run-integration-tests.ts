/**
 * Wrapper around `vitest run` for integration tests. Loads .env.local,
 * copies TEST_DATABASE_URL onto DATABASE_URL, then spawns vitest. The
 * env override is inherited by the child process; existing test files
 * that call `dotenv.config()` will not overwrite it (dotenv is
 * non-overriding by default).
 */
import path from 'node:path'
import dotenv from 'dotenv'
import { spawnSync } from 'node:child_process'
import { assertNotProdDb } from '@/lib/db-guardrail'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const testUrl = process.env.TEST_DATABASE_URL
if (!testUrl) {
  console.error(
    '[run-integration-tests] TEST_DATABASE_URL is unset. Add it to .env.local.',
  )
  process.exit(1)
}
assertNotProdDb(testUrl)

const passthroughArgs = process.argv.slice(2)
const result = spawnSync(
  'npx',
  [
    'vitest',
    'run',
    '--passWithNoTests',
    '**/*.integration.test.ts',
    ...passthroughArgs,
  ],
  {
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: 'inherit',
  },
)
process.exit(result.status ?? 1)
