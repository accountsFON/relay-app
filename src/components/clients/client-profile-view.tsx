import type { Client } from '@prisma/client'
import { PageSection } from '@/components/ui/page-section'

export function ClientProfileView({ client }: { client: Client }) {
  return (
    <div className="space-y-6">
      <PageSection title="Identity">
        <dl className="space-y-4">
          <Row label="Name" value={client.name} />
          <Row label="Industry" value={client.industry} />
          <Row label="Location" value={client.location} />
          <Row label="Phone" value={client.phone} />
        </dl>
      </PageSection>

      <PageSection title="Brand">
        <dl className="space-y-4">
          <Row label="Business summary" value={client.businessSummary} multiline />
          <Row label="Brand voice" value={client.brandVoice} multiline />
          <Row label="Target audience" value={client.targetAudience} multiline />
        </dl>
      </PageSection>

      <PageSection title="Strategy">
        <dl className="space-y-4">
          <Row label="Main CTA" value={client.mainCta} multiline />
          <Row label="Focus 1" value={client.focus1} multiline />
          <Row label="Focus 2" value={client.focus2} multiline />
          <Row label="Focus 3" value={client.focus3} multiline />
          <Row label="Dos" value={client.dos} multiline />
          <Row label="Don'ts" value={client.donts} multiline />
        </dl>
      </PageSection>

      <PageSection title="Scheduling">
        <dl className="space-y-4">
          <Row label="Posting days" value={client.postingDays} />
          <Row label="Post length" value={client.postLength} />
          <Row label="Holiday handling" value={client.holidayHandling} />
          <Row
            label="Excluded dates"
            value={client.excludedDates.length ? client.excludedDates.join(', ') : null}
          />
        </dl>
      </PageSection>

      <PageSection title="Assets">
        <dl className="space-y-4">
          <Row
            label="URLs"
            value={client.urls.length ? client.urls.join(', ') : null}
          />
          <Row label="Assets folder" value={client.assetsFolderUrl} />
        </dl>
      </PageSection>
    </div>
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
    <div className="flex flex-col gap-1 sm:grid sm:grid-cols-3 sm:gap-6">
      <dt className="text-[13px] font-medium text-muted-foreground">{label}</dt>
      <dd
        className={
          'sm:col-span-2 text-[14px] text-foreground ' +
          (multiline ? 'whitespace-pre-wrap' : '')
        }
      >
        {value || <span className="text-ink-20">—</span>}
      </dd>
    </div>
  )
}
