import { requireClientViewer } from '@/server/middleware/permissions'
import { can } from '@/server/auth/permissions'
import { getOrgBranding } from '@/server/repositories/organizations'
import { HeroBand } from '@/components/hero-band'
import { PageSection } from '@/components/ui/page-section'
import { Badge } from '@/components/ui/badge'
import { CreditCard, Bell, Building2, Plug, Lock, Compass, Palette } from 'lucide-react'
import { ToursPanel } from '@/components/onboarding/tours-panel'
import { OrgBrandingForm } from './org-branding-form'

export default async function OrgSettingsPage() {
  const ctx = await requireClientViewer()

  // White-label branding (P2 #21) is the first live agency-level control.
  // Admin-only (mutation re-checks `admin.portal` in the action).
  const isAdmin = can(ctx, 'admin.portal')
  const branding = isAdmin ? await getOrgBranding(ctx.organizationDbId) : null

  const sections = [
    {
      icon: Building2,
      title: 'Agency profile',
      blurb: 'Name, logo, default time zone, billing contact.',
    },
    {
      icon: CreditCard,
      title: 'Billing & plan',
      blurb: 'Current plan, credit balance, invoices, payment method.',
    },
    {
      icon: Bell,
      title: 'Notifications',
      blurb: 'When you get pinged in app, by email, or by Slack.',
    },
    {
      icon: Plug,
      title: 'Integrations',
      blurb: 'Connected services: Google Drive, Slack, Make, Webflow, etc.',
    },
    {
      icon: Lock,
      title: 'Security',
      blurb: 'Sign in methods, session policies, audit log.',
    },
  ]

  return (
    <div className="px-6 py-10 md:px-12 md:py-14 max-w-3xl">
      <HeroBand
        title="Settings"
        subtitle="Agency level configuration. Coming soon."
      />

      <div className="mt-8 space-y-3">
        {sections.map((s) => {
          const Icon = s.icon
          return (
            <PageSection key={s.title}>
              <div className="flex items-start gap-4">
                <div className="rounded-full bg-neutral-100 p-2.5 shrink-0">
                  <Icon className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-base font-medium">{s.title}</h3>
                    <Badge variant="secondary" className="text-[10px]">
                      Soon
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{s.blurb}</p>
                </div>
              </div>
            </PageSection>
          )
        })}

        {/* White-label branding (P2 #21) — a live control (admins only). Agency
            logo + accent color; applies to the client review email + page. */}
        {branding && (
          <PageSection>
            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-4">
                <div className="rounded-full bg-neutral-100 p-2.5 shrink-0">
                  <Palette className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-medium">White-label branding</h3>
                  <p className="text-sm text-muted-foreground">
                    Your logo + one accent color on the client review email and
                    review page.
                  </p>
                </div>
              </div>
              <OrgBrandingForm
                brandLogoUrl={branding.brandLogoUrl}
                brandColor={branding.brandColor}
              />
            </div>
          </PageSection>
        )}

        {/* Guided tour reset. Phase 4 item 25. Lives above the
            placeholder copy because it is the one live control on
            this page. Clears both User onboarding columns and routes
            back to /welcome. */}
        <PageSection>
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex items-start gap-4">
              <div className="rounded-full bg-neutral-100 p-2.5 shrink-0">
                <Compass className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-medium">Guided tour</h3>
                <p className="text-sm text-muted-foreground">
                  Restart the 60 second product tour and revisit the welcome launch pad.
                </p>
              </div>
            </div>
            <ToursPanel role={ctx.role} />
          </div>
        </PageSection>
      </div>

      <p className="mt-10 text-xs text-muted-foreground italic" style={{ fontFamily: 'var(--font-serif)' }}>
        These surfaces are placeholders while the team builds them out. Drop feedback in the daily.
      </p>
    </div>
  )
}
