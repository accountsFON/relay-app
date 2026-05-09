/**
 * /library — Beta QA index. Lists every route + every component so we can
 * hit-test the app without missing anything.
 *
 * Temporary surface. Drop after the beta cycle. Routes are clickable;
 * components are listed with their file paths since they need props.
 *
 * For dynamic routes (`[id]`, `[batchId]`, `[runId]`, `[userId]`), this
 * page fetches one of each from the DB and substitutes. If nothing exists
 * yet, the link reads "(no sample data — create one first)".
 */
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireOrgContext } from '@/server/middleware/auth'
import { db } from '@/db/client'
import { PageHeader } from '@/components/page-header'
import { PageSection } from '@/components/ui/page-section'
import { Badge } from '@/components/ui/badge'

export const dynamic = 'force-dynamic'

interface RouteLink {
  href: string | null
  label: string
  description?: string
}

export default async function LibraryPage() {
  const ctx = await requireOrgContext()
  // Beta QA index is agency-internal — bounce client-role users.
  if (ctx.role === 'client') redirect('/dashboard')

  // Fetch one of each entity to seed dynamic-route links.
  const [client, batch, run, member] = await Promise.all([
    db.client.findFirst({
      where: { organizationId: ctx.organizationDbId },
      select: { id: true, name: true },
    }),
    db.batch.findFirst({
      where: { client: { organizationId: ctx.organizationDbId } },
      select: { id: true, clientId: true, label: true },
    }),
    db.contentRun.findFirst({
      where: { client: { organizationId: ctx.organizationDbId } },
      select: { id: true, clientId: true },
    }),
    db.user.findFirst({
      where: { memberships: { some: { organizationId: ctx.organizationDbId } } },
      select: { id: true, name: true },
    }),
  ])

  const routes: { section: string; items: RouteLink[] }[] = [
    {
      section: 'App',
      items: [
        { href: '/dashboard', label: '/dashboard', description: 'Role-aware dispatcher' },
        { href: '/inbox', label: '/inbox', description: 'Mentions grouped by client' },
        { href: '/library', label: '/library', description: 'You are here' },
        { href: '/settings/org', label: '/settings/org', description: 'Org settings (placeholder sections)' },
        { href: '/no-access', label: '/no-access', description: 'Access-denied screen' },
        { href: '/platform', label: '/platform', description: 'Platform-owner view' },
      ],
    },
    {
      section: 'Clients',
      items: [
        { href: '/clients', label: '/clients', description: 'Client list' },
        { href: '/clients/new', label: '/clients/new', description: 'New client form' },
        { href: '/clients/import', label: '/clients/import', description: 'CSV bulk import' },
        client
          ? { href: `/clients/${client.id}`, label: `/clients/[id]`, description: `${client.name} (sample, inline-editable profile)` }
          : { href: null, label: '/clients/[id]', description: 'no clients yet' },
        client
          ? { href: `/clients/${client.id}/generate`, label: '/clients/[id]/generate', description: `Generate run for ${client.name}` }
          : { href: null, label: '/clients/[id]/generate', description: 'no clients yet' },
        run
          ? {
              href: `/clients/${run.clientId}/runs/${run.id}`,
              label: '/clients/[id]/runs/[runId]',
              description: 'Run detail (sample)',
            }
          : { href: null, label: '/clients/[id]/runs/[runId]', description: 'no runs yet' },
        batch
          ? {
              href: `/clients/${batch.clientId}/batches/${batch.id}`,
              label: '/clients/[id]/batches/[batchId]',
              description: `Batch ${batch.label} (sample)`,
            }
          : { href: null, label: '/clients/[id]/batches/[batchId]', description: 'no batches yet' },
      ],
    },
    {
      section: 'Admin',
      items: [
        { href: '/admin', label: '/admin', description: 'Onboarding queue + stuck watchlist' },
        { href: '/admin/clients', label: '/admin/clients', description: 'Client assignment view' },
        { href: '/admin/roles', label: '/admin/roles', description: 'Role defaults' },
        { href: '/admin/users', label: '/admin/users', description: 'Team list' },
        member
          ? { href: `/admin/users/${member.id}`, label: '/admin/users/[id]', description: `${member.name} detail` }
          : { href: null, label: '/admin/users/[id]', description: 'no members yet' },
      ],
    },
    {
      section: 'Auth + Onboarding',
      items: [
        { href: '/sign-in', label: '/sign-in', description: 'Clerk sign-in' },
        { href: '/sign-up', label: '/sign-up', description: 'Clerk sign-up' },
        { href: '/onboarding', label: '/onboarding', description: 'First-run org setup' },
        { href: '/pending', label: '/pending', description: 'Awaiting access' },
      ],
    },
  ]

  const componentGroups: { group: string; items: { name: string; path: string; note?: string }[] }[] = [
    {
      group: 'App chrome',
      items: [
        { name: 'AppShell', path: 'src/components/app-shell.tsx', note: 'Sidebar + header on every authed route' },
        { name: 'PageHeader', path: 'src/components/page-header.tsx' },
        { name: 'OrgSwitcher', path: 'src/components/org-switcher.tsx' },
        { name: 'MaintenanceScreen', path: 'src/components/maintenance-screen.tsx', note: 'Renders when RELAY_MAINTENANCE_MODE=true' },
      ],
    },
    {
      group: 'Clients',
      items: [
        { name: 'ClientForm', path: 'src/components/clients/client-form.tsx' },
        { name: 'ClientListItem', path: 'src/components/clients/client-list-item.tsx' },
        { name: 'ClientProfileView', path: 'src/components/clients/client-profile-view.tsx' },
        { name: 'ClientQuickAccess', path: 'src/components/clients/client-quick-access.tsx' },
        { name: 'ClientStatusBadge', path: 'src/components/clients/client-status-badge.tsx' },
      ],
    },
    {
      group: 'Activity',
      items: [
        { name: 'ActivityThread', path: 'src/components/activity/activity-thread.tsx' },
        { name: 'CommentComposer', path: 'src/components/activity/comment-composer.tsx' },
        { name: 'EventRenderer', path: 'src/components/activity/event-renderer.tsx' },
      ],
    },
    {
      group: 'Relay',
      items: [
        { name: 'BatchCard', path: 'src/components/relay/batch-card.tsx' },
        { name: 'KanbanCard', path: 'src/components/relay/kanban-card.tsx' },
        { name: 'RelayTrack', path: 'src/components/relay/relay-track.tsx' },
        { name: 'ChecklistPanel', path: 'src/components/relay/checklist-panel.tsx' },
        { name: 'ClientDecisionPanel', path: 'src/components/relay/client-decision-panel.tsx' },
        { name: 'CopySubStatePanel', path: 'src/components/relay/copy-substate-panel.tsx' },
        { name: 'RevisionPlanComposer', path: 'src/components/relay/revision-plan-composer.tsx' },
      ],
    },
    {
      group: 'UI primitives',
      items: [
        { name: 'ActionBar', path: 'src/components/ui/action-bar.tsx' },
        { name: 'Avatar', path: 'src/components/ui/avatar.tsx' },
        { name: 'Badge', path: 'src/components/ui/badge.tsx' },
        { name: 'Button', path: 'src/components/ui/button.tsx' },
        { name: 'Card', path: 'src/components/ui/card.tsx' },
        { name: 'DataRow', path: 'src/components/ui/data-row.tsx' },
        { name: 'Dialog', path: 'src/components/ui/dialog.tsx' },
        { name: 'DropdownMenu', path: 'src/components/ui/dropdown-menu.tsx' },
        { name: 'EmptyState', path: 'src/components/ui/empty-state.tsx' },
        { name: 'InfoTooltip', path: 'src/components/ui/info-tooltip.tsx' },
        { name: 'Input', path: 'src/components/ui/input.tsx' },
        { name: 'Label', path: 'src/components/ui/label.tsx' },
        { name: 'PageSection', path: 'src/components/ui/page-section.tsx' },
        { name: 'Select', path: 'src/components/ui/select.tsx' },
        { name: 'Separator', path: 'src/components/ui/separator.tsx' },
        { name: 'Skeleton', path: 'src/components/ui/skeleton.tsx' },
        { name: 'Textarea', path: 'src/components/ui/textarea.tsx' },
        { name: 'Tooltip', path: 'src/components/ui/tooltip.tsx' },
      ],
    },
  ]

  return (
    <div className="px-6 py-10 md:px-12 md:py-14 max-w-5xl">
      <PageHeader
        title="Library"
        description="Beta QA index. Click any route to visit it. Components are listed for inventory only (no preview)."
        actions={<Badge variant="primary">BETA</Badge>}
      />

      <div className="mt-10 space-y-8">
        {routes.map((section) => (
          <PageSection key={section.section} title={`Routes — ${section.section}`}>
            <ul className="divide-y divide-border rounded-md border border-border bg-background">
              {section.items.map((item) => (
                <li
                  key={item.label}
                  className="flex items-center justify-between gap-4 px-4 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    {item.href ? (
                      <Link
                        href={item.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[14px] font-mono text-foreground hover:underline"
                      >
                        {item.label} ↗
                      </Link>
                    ) : (
                      <span className="text-[14px] font-mono text-muted-foreground">
                        {item.label}
                      </span>
                    )}
                    {item.description && (
                      <p className="text-[12px] text-muted-foreground">{item.description}</p>
                    )}
                  </div>
                  {item.href ? (
                    <Badge variant="success">live</Badge>
                  ) : (
                    <Badge variant="outline">no sample</Badge>
                  )}
                </li>
              ))}
            </ul>
          </PageSection>
        ))}

        {componentGroups.map((group) => (
          <PageSection key={group.group} title={`Components — ${group.group}`}>
            <ul className="divide-y divide-border rounded-md border border-border bg-background">
              {group.items.map((item) => (
                <li key={item.name} className="flex items-baseline justify-between gap-4 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <span className="text-[14px] font-medium text-foreground">{item.name}</span>
                    {item.note && (
                      <p className="text-[12px] text-muted-foreground">{item.note}</p>
                    )}
                  </div>
                  <code className="text-[11px] text-muted-foreground">{item.path}</code>
                </li>
              ))}
            </ul>
          </PageSection>
        ))}
      </div>
    </div>
  )
}
