import type { Client } from '@prisma/client'

export function ClientProfileView({ client }: { client: Client }) {
  return (
    <div className="space-y-6">
      <Section title="Identity">
        <Row label="Name" value={client.name} />
        <Row label="Industry" value={client.industry} />
        <Row label="Location" value={client.location} />
        <Row label="Phone" value={client.phone} />
      </Section>

      <Section title="Brand">
        <Row label="Business summary" value={client.businessSummary} multiline />
        <Row label="Brand voice" value={client.brandVoice} multiline />
        <Row label="Target audience" value={client.targetAudience} multiline />
      </Section>

      <Section title="Strategy">
        <Row label="Main CTA" value={client.mainCta} multiline />
        <Row label="Focus 1" value={client.focus1} multiline />
        <Row label="Focus 2" value={client.focus2} multiline />
        <Row label="Focus 3" value={client.focus3} multiline />
        <Row label="Dos" value={client.dos} multiline />
        <Row label="Don'ts" value={client.donts} multiline />
      </Section>

      <Section title="Scheduling">
        <Row label="Posting days" value={client.postingDays} />
        <Row label="Post length" value={client.postLength} />
        <Row label="Holiday handling" value={client.holidayHandling} />
        <Row
          label="Excluded dates"
          value={client.excludedDates.length ? client.excludedDates.join(', ') : null}
        />
      </Section>

      <Section title="Assets">
        <Row
          label="URLs"
          value={client.urls.length ? client.urls.join(', ') : null}
        />
        <Row label="Assets folder" value={client.assetsFolderUrl} />
      </Section>
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-4 sm:p-6">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <dl className="space-y-3">{children}</dl>
    </section>
  )
}

function Row({
  label,
  value,
  multiline = false,
}: {
  label: string
  value: string | null | undefined
  multiline?: boolean
}) {
  return (
    <div className="flex flex-col gap-1 sm:grid sm:grid-cols-3 sm:gap-4">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd
        className={
          'sm:col-span-2 text-sm text-foreground ' +
          (multiline ? 'whitespace-pre-wrap' : '')
        }
      >
        {value || <span className="text-muted-foreground">—</span>}
      </dd>
    </div>
  )
}
