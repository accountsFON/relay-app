import { redirect } from 'next/navigation'
import { getOrgContext } from '@/server/middleware/auth'
import { can } from '@/server/auth/permissions'
import { listFeedbackForAdmin } from '@/server/repositories/feedback'
import { HeroBand } from '@/components/hero-band'
import { PageSection } from '@/components/ui/page-section'
import { EmptyState } from '@/components/ui/empty-state'
import { AdminTabs } from '../admin-tabs'
import { FeedbackRow } from './feedback-row'

/**
 * Admin-only bug report dashboard. Lists submissions from the in-app "Report
 * a bug" reporter, open (unresolved) first then newest. Platform owners see
 * every org's feedback; a regular org admin is scoped to their own org
 * (enforced in listFeedbackForAdmin).
 */
export default async function AdminFeedbackPage() {
  const ctx = await getOrgContext()
  if (!ctx || !can(ctx, 'admin.portal')) redirect('/no-access')

  const feedback = await listFeedbackForAdmin({
    organizationDbId: ctx.organizationDbId,
    platformOwner: ctx.platformOwner,
  })
  const openCount = feedback.filter((f) => f.resolvedAt === null).length

  return (
    <div className="px-6 py-10 md:px-12 md:py-14 max-w-5xl">
      <HeroBand
        title="Feedback"
        subtitle="Bug reports from the in-app reporter. Open items first, then newest."
      />

      <div className="mt-6">
        <AdminTabs />
      </div>

      <div className="mt-10">
        <PageSection
          title={`Bug reports · ${openCount} open`}
          description="High severity also pages admins immediately; the rest roll into the Monday digest."
        >
          {feedback.length === 0 ? (
            <EmptyState
              title="No reports yet"
              description="Nothing has come in through the Report a bug button."
            />
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border bg-background">
              {feedback.map((f) => (
                <li key={f.id}>
                  <FeedbackRow feedback={f} />
                </li>
              ))}
            </ul>
          )}
        </PageSection>
      </div>
    </div>
  )
}
