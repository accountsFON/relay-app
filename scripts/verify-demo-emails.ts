/**
 * One-shot helper: mark every demo user's Clerk email_address as verified
 * so interactive sign-in does not prompt for an email code on first session.
 *
 * Why this is needed: `clerk.users.createUser({ emailAddress: ['x@y.z'] })`
 * (the path used by the demo seed) creates email addresses with
 * `verification.status === 'unverified'` by default. Clerk then requires
 * email verification at first interactive sign-in, which fails for the demo
 * accounts because @relaydemo.app is a fake domain and the codes never
 * arrive. The audit suite gets around this by signing in via email-ticket
 * tokens, which bypass verification entirely; interactive sign-in cannot.
 *
 * Usage:
 *   DEMO_SEED_ALLOW=true npm run verify-demo-emails
 *
 * Idempotent. Reports `[ok]` for already-verified emails and `[verified]`
 * for ones it patches in this run.
 */
import { createClerkClient } from '@clerk/backend'
import dotenv from 'dotenv'
import path from 'node:path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const DEMO_EMAILS = [
  'alex.admin@relaydemo.app',
  'morgan.am@relaydemo.app',
  'sam.am@relaydemo.app',
  'riley.designer@relaydemo.app',
  'jordan.designer@relaydemo.app',
  'casey.client@relaydemo.app',
  'taylor.client@relaydemo.app',
  'dakota.client@relaydemo.app',
  'pat.platform@relaydemo.app',
]

function assertSafeToRun(): void {
  if (process.env.DEMO_SEED_ALLOW !== 'true') {
    throw new Error(
      'DEMO_SEED_ALLOW is not "true". Refusing to run verify-demo-emails.',
    )
  }
}

async function main(): Promise<void> {
  assertSafeToRun()

  const secretKey = process.env.CLERK_SECRET_KEY
  if (!secretKey) {
    throw new Error('CLERK_SECRET_KEY not set in .env.local')
  }
  const clerk = createClerkClient({ secretKey })

  let okCount = 0
  let verifiedCount = 0
  let missingCount = 0
  let failCount = 0

  for (const email of DEMO_EMAILS) {
    const list = await clerk.users.getUserList({ emailAddress: [email] })
    const user = list.data?.[0]
    if (!user) {
      console.log(`[missing] ${email}, no Clerk user found`)
      missingCount += 1
      continue
    }

    for (const ea of user.emailAddresses) {
      const isVerified = ea.verification?.status === 'verified'
      if (isVerified) {
        console.log(`[ok]       ${email}, already verified`)
        okCount += 1
        continue
      }

      // The Backend SDK does not expose `updateEmailAddress` with a
      // `verified` flag on every version, so we hit the Backend API
      // directly. The endpoint is documented at
      // https://clerk.com/docs/reference/backend-api/tag/Email-Addresses.
      const res = await fetch(
        `https://api.clerk.com/v1/email_addresses/${ea.id}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${secretKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ verified: true }),
        },
      )
      if (!res.ok) {
        const text = await res.text()
        console.error(`[fail]     ${email}, ${res.status} ${text}`)
        failCount += 1
        continue
      }
      console.log(`[verified] ${email}, marked verified`)
      verifiedCount += 1
    }
  }

  console.log(
    `\nDone. ${verifiedCount} newly verified, ${okCount} already ok, ${missingCount} missing, ${failCount} failed.`,
  )
  if (failCount > 0) process.exit(1)
}

main().catch((err) => {
  console.error('verify-demo-emails failed:', err)
  process.exit(1)
})
