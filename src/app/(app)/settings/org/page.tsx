import { requireClientViewer } from '@/server/middleware/permissions'
import { HeroBand } from '@/components/hero-band'
import { PageSection } from '@/components/ui/page-section'
import { Badge } from '@/components/ui/badge'
import { CreditCard, Bell, Building2, Plug, Lock } from 'lucide-react'

export default async function OrgSettingsPage() {
  await requireClientViewer()

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
                <div className="rounded-full bg-cream-warm p-2.5 shrink-0">
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
      </div>

      <p className="mt-10 text-xs text-muted-foreground italic" style={{ fontFamily: 'var(--font-serif)' }}>
        These surfaces are placeholders while the team builds them out. Drop feedback in the daily.
      </p>
    </div>
  )
}
