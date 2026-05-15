/**
 * One-shot bootstrap for the Neon DB split. Idempotent and re-runnable.
 *
 * Prereqs (humans, once):
 *   - PR #36 merged to main
 *   - npm install -g neonctl
 *   - neonctl auth (browser flow)
 *
 * Run once per developer machine after pulling the chore/neon-db-split branch.
 *
 * Steps:
 *   1. Sanity check (neonctl + gh auth, repo root)
 *   2. Create dev + test Neon branches (idempotent)
 *   3. Capture connection strings via neonctl
 *   4. Backup .env.local
 *   5. Rewrite .env.local with new vars
 *   6. Migrate + seed dev branch
 *   7. Migrate test branch
 *   8. Smoke run integration tests
 *   9. Print summary
 */
import path from 'node:path'
import fs from 'node:fs'
import { spawnSync, type SpawnSyncReturns } from 'node:child_process'

const REPO_FILES = ['package.json', 'src/db/schema.prisma']
const PROD_HOSTNAME = 'ep-odd-math-a4uda3vs.us-east-1.aws.neon.tech'
const NEON_PROJECT_ID = 'purple-flower-31732050'

function sh(cmd: string, args: string[], opts: { silent?: boolean } = {}):
  SpawnSyncReturns<string> {
  return spawnSync(cmd, args, {
    encoding: 'utf8',
    stdio: opts.silent ? 'pipe' : ['inherit', 'pipe', 'pipe'],
  })
}

function fail(msg: string): never {
  console.error(`\n[bootstrap] ${msg}\n`)
  process.exit(1)
}

function step(n: number, label: string): void {
  console.log(`\n--- step ${n}: ${label} ---`)
}

// 1. Sanity check
function sanityCheck(): void {
  step(1, 'sanity check')
  for (const f of REPO_FILES) {
    if (!fs.existsSync(path.resolve(process.cwd(), f))) {
      fail(`expected file ${f} not found. Run from the relay-app repo root.`)
    }
  }
  const neon = sh('neonctl', ['me'], { silent: true })
  if (neon.status !== 0) {
    fail(
      'neonctl is not installed or not authenticated.\n' +
        '  Install: npm install -g neonctl\n' +
        '  Auth:    neonctl auth',
    )
  }
  const gh = sh('gh', ['auth', 'status'], { silent: true })
  if (gh.status !== 0) fail('gh is not authenticated. Run: gh auth login')
  console.log('  neonctl: ok')
  console.log('  gh: ok')
  console.log('  repo root: ok')
}

// 2. Create branches
function createBranch(name: string): void {
  const result = sh(
    'neonctl',
    ['branches', 'create', '--name', name, '--project-id', NEON_PROJECT_ID],
    { silent: true },
  )
  if (result.status === 0) {
    console.log(`  created branch: ${name}`)
    return
  }
  if ((result.stderr ?? '').includes('already exists')) {
    console.log(`  branch already exists: ${name}`)
    return
  }
  fail(`neonctl branches create failed for ${name}:\n${result.stderr}`)
}

function createBranches(): void {
  step(2, 'create dev + test Neon branches (idempotent)')
  createBranch('dev')
  createBranch('test')
}

// 3. Capture connection strings
function connectionString(branch: string): string {
  const result = sh(
    'neonctl',
    ['connection-string', branch, '--project-id', NEON_PROJECT_ID],
    { silent: true },
  )
  if (result.status !== 0) {
    fail(`neonctl connection-string failed for ${branch}:\n${result.stderr}`)
  }
  return (result.stdout ?? '').trim()
}

interface ConnStrings { dev: string; test: string }

function captureConnectionStrings(): ConnStrings {
  step(3, 'capture connection strings')
  const dev = connectionString('dev')
  const test = connectionString('test')
  console.log(`  dev:  ${new URL(dev).hostname}`)
  console.log(`  test: ${new URL(test).hostname}`)
  return { dev, test }
}

// 4 + 5. Rewrite .env.local
function rewriteEnvLocal(strings: ConnStrings): void {
  step(4, 'backup .env.local')
  const envPath = path.resolve(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) {
    fail('.env.local not found. Copy from .env.example first.')
  }
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = `${envPath}.backup-${ts}`
  fs.copyFileSync(envPath, backupPath)
  console.log(`  backed up to ${path.basename(backupPath)}`)

  step(5, 'rewrite .env.local')
  const lines = fs.readFileSync(envPath, 'utf8').split('\n')
  const upserts: Record<string, string> = {
    DATABASE_URL: `"${strings.dev}"`,
    TEST_DATABASE_URL: `"${strings.test}"`,
    PROD_DATABASE_HOSTNAME: `"${PROD_HOSTNAME}"`,
  }
  const seen = new Set<string>()
  const updated = lines.map((line) => {
    const m = line.match(/^([A-Z_]+)=/)
    if (!m) return line
    const key = m[1]
    if (key in upserts) {
      seen.add(key)
      return `${key}=${upserts[key]}`
    }
    return line
  })
  for (const [key, value] of Object.entries(upserts)) {
    if (!seen.has(key)) updated.push(`${key}=${value}`)
  }
  fs.writeFileSync(envPath, updated.join('\n'))
  console.log('  .env.local updated with DATABASE_URL, TEST_DATABASE_URL, PROD_DATABASE_HOSTNAME')
}

// 6. Migrate + seed dev
function migrateAndSeedDev(strings: ConnStrings): void {
  step(6, 'migrate + seed dev branch')
  const env = { ...process.env, DATABASE_URL: strings.dev }
  let result = spawnSync(
    'npx',
    ['prisma', 'migrate', 'deploy', '--schema=src/db/schema.prisma'],
    { env, stdio: 'inherit' },
  )
  if (result.status !== 0) fail('prisma migrate deploy failed against dev')

  result = spawnSync('npm', ['run', 'seed:demo'], {
    env: { ...env, DEMO_SEED_ALLOW: 'true' },
    stdio: 'inherit',
  })
  if (result.status !== 0) fail('seed:demo failed against dev')
}

// 7. Migrate test
function migrateTest(strings: ConnStrings): void {
  step(7, 'migrate test branch')
  const result = spawnSync(
    'npx',
    ['prisma', 'migrate', 'deploy', '--schema=src/db/schema.prisma'],
    { env: { ...process.env, DATABASE_URL: strings.test }, stdio: 'inherit' },
  )
  if (result.status !== 0) fail('prisma migrate deploy failed against test')
}

// 8. Smoke run integration tests
function smokeRun(): void {
  step(8, 'smoke run integration tests against the new test branch')
  const result = spawnSync('npm', ['run', 'test:integration'], {
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    fail(
      'integration tests failed against the new test branch.\n' +
        'Read the failure above before re-running.',
    )
  }
}

// 9. Summary
function summary(strings: ConnStrings): void {
  step(9, 'summary')
  console.log('')
  console.log('Save these to 1Password ("Relay App") so other devs can pull:')
  console.log(`  DATABASE_URL (dev):       ${strings.dev}`)
  console.log(`  TEST_DATABASE_URL (test): ${strings.test}`)
  console.log('')
  console.log('Manual eyeball check (5 sec):')
  console.log('  https://cloud.trigger.dev → relay-app project → env vars')
  console.log(`  DATABASE_URL there must still contain "${PROD_HOSTNAME}".`)
  console.log('')
  console.log('Ready to: git push -u origin chore/neon-db-split && gh pr create')
}

function main(): void {
  sanityCheck()
  createBranches()
  const strings = captureConnectionStrings()
  rewriteEnvLocal(strings)
  migrateAndSeedDev(strings)
  migrateTest(strings)
  smokeRun()
  summary(strings)
}

main()
