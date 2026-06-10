/**
 * /welcome - Launch pad.
 *
 * Server component. The (app)/layout.tsx redirects first time users
 * here when both User.onboardingTourSeenAt and User.launchPadDismissedAt
 * are null. After the user lands, the launch pad gives them three
 * concrete next actions plus a "Take the tour" CTA that starts the
 * popover tour on the dashboard. The "Skip, I'll explore" link
 * persists launchPadDismissedAt and navigates to /dashboard.
 *
 * Role gating per Phase 4 item 25 + Julio's call:
 *   - Admin + Platform Owner: get the AM card set (default per the
 *     brief, Julio ratified "Admin + Platform Owner default cards").
 *   - account_manager: same AM cards.
 *   - designer: gets the Designer card set.
 *   - client: should never land here (the (app) layout skips client
 *     persona users; they get the magic link review tutorial from
 *     item 24 instead). We still render the AM cards as a safe
 *     default in case the gate ever changes.
 *
 * Phase 4 item 25. See
 * projects/relay-app/2026-06-01-phase-4-design-brief.md § Item 25.
 */
import { requireOrgContext } from '@/server/middleware/auth'
import { db } from '@/db/client'
import { HeroBand } from '@/components/hero-band'
import { WelcomeLaunchPad } from '@/components/onboarding/welcome-launch-pad'
import { findUserByClerkId } from '@/server/repositories/users'

type LaunchPadCard = {
  id: string
  title: string
  body: string
  href: string
  cta: string
}

const AM_CARDS: LaunchPadCard[] = [
  {
    id: 'create-client',
    title: 'Create your first client',
    body: 'Set up the client brief so we can generate content that sounds like them.',
    href: '/clients/new',
    cta: 'Add a client',
  },
  {
    id: 'generate-content',
    title: 'Generate a month of content',
    body: 'Open a client, pick a month, and let Relay generate the posts.',
    href: '/clients',
    cta: 'Open clients',
  },
  {
    id: 'review-batch',
    title: 'Review and pass a relay',
    body: 'Check the relays waiting on you, give the green light, and move them forward.',
    href: '/dashboard',
    cta: 'See my queue',
  },
]

const DESIGNER_CARDS: LaunchPadCard[] = [
  {
    id: 'open-queue',
    title: 'Open your design queue',
    body: 'Every relay waiting on you, grouped by client. Start with the oldest.',
    href: '/dashboard',
    cta: 'Open queue',
  },
  {
    id: 'edit-graphic',
    title: 'Edit a post graphic',
    body: 'Pick a holding relay, jump into the designs, and refine until it sings.',
    href: '/dashboard',
    cta: 'Browse relays',
  },
  {
    id: 'pass-to-am',
    title: 'Pass to AM review',
    body: 'When the designs are tight, hand the relay back to the AM for the next step.',
    href: '/dashboard',
    cta: 'View relays',
  },
]

function cardsForRole(role: string): LaunchPadCard[] {
  if (role === 'designer') return DESIGNER_CARDS
  // admin, platform owner, account_manager, client all get the AM cards.
  return AM_CARDS
}

export default async function WelcomePage() {
  const ctx = await requireOrgContext()

  // First touch on /welcome refreshes the User row so we know the
  // launch pad actually rendered. The (app) layout redirect only
  // checks for both columns being null, so the page can rely on its
  // own dismissal actions to flip launchPadDismissedAt.
  const dbUser = await findUserByClerkId(ctx.userId)
  const name = dbUser?.name?.split(' ')[0] ?? 'there'

  const cards = cardsForRole(ctx.role)

  // Pull a sample first batch for the designer queue card so the deep
  // link can carry the user straight into something useful. Falls back
  // to /dashboard if the user has no assigned work yet.
  let designerJumpHref: string | null = null
  if (ctx.role === 'designer') {
    const firstBatch = await db.batch
      .findFirst({
        where: {
          deletedAt: null,
          client: {
            assignedDesignerId: ctx.userDbId,
            deletedAt: null,
          },
        },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      })
      .catch(() => null)
    if (firstBatch) designerJumpHref = `/batches/${firstBatch.id}`
  }

  return (
    <div className="px-6 py-10 md:px-12 md:py-14 max-w-5xl">
      <HeroBand
        title={`Welcome to Relay, ${name}.`}
        subtitle="Pick one to get rolling. The 60 second tour is here whenever you want it."
      />

      <WelcomeLaunchPad cards={cards} designerJumpHref={designerJumpHref} />
    </div>
  )
}
