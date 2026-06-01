'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { clientInputSchema, type ClientInput } from '@/lib/schemas/client'
import { Button } from '@/components/ui/button'
import { BrandCheckbox } from '@/components/ui/brand-checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { PageSection } from '@/components/ui/page-section'

function arrayToCsv(val: unknown): string {
  if (Array.isArray(val)) return val.join(', ')
  if (typeof val === 'string') return val
  return ''
}

type Props = {
  mode: 'create' | 'edit'
  defaultValues?: Partial<ClientInput>
  onSubmit: (input: ClientInput) => void | Promise<void>
}

export function ClientForm({ mode, defaultValues, onSubmit }: Props) {
  const form = useForm<any>({
    resolver: zodResolver(clientInputSchema) as any,
    defaultValues: {
      name: defaultValues?.name ?? '',
      businessSummary: defaultValues?.businessSummary ?? '',
      brandVoice: defaultValues?.brandVoice ?? '',
      industry: defaultValues?.industry ?? '',
      location: defaultValues?.location ?? '',
      phone: defaultValues?.phone ?? '',
      mainCta: defaultValues?.mainCta ?? '',
      focus1: defaultValues?.focus1 ?? '',
      focus2: defaultValues?.focus2 ?? '',
      focus3: defaultValues?.focus3 ?? '',
      dos: defaultValues?.dos ?? '',
      donts: defaultValues?.donts ?? '',
      postingDays: defaultValues?.postingDays ?? 'Mon,Wed,Fri',
      postLength: defaultValues?.postLength ?? '',
      urls: arrayToCsv(defaultValues?.urls),
      targetAudience: defaultValues?.targetAudience ?? '',
      holidayHandling: defaultValues?.holidayHandling ?? 'Major-US',
      excludedDates: arrayToCsv(defaultValues?.excludedDates),
      assetsFolderUrl: defaultValues?.assetsFolderUrl ?? '',
      canvaUrl: defaultValues?.canvaUrl ?? '',
      autoCrawl: defaultValues?.autoCrawl ?? 'always',
      status: defaultValues?.status ?? 'active',
      clientReviewEnabled: (defaultValues as any)?.clientReviewEnabled ?? false,
    },
  })

  const submitLabel = mode === 'create' ? 'Create client' : 'Save changes'

  return (
    <form
      onSubmit={form.handleSubmit((data) => onSubmit(data as ClientInput))}
      className="space-y-6"
    >
      <PageSection title="Identity">
        <div className="space-y-5">
          <Field
            label="Name"
            htmlFor="name"
            error={form.formState.errors.name?.message as string | undefined}
          >
            <Input id="name" {...form.register('name')} />
          </Field>
          <Field label="Industry" htmlFor="industry">
            <Input id="industry" {...form.register('industry')} />
          </Field>
          <Field label="Location" htmlFor="location">
            <Input id="location" {...form.register('location')} placeholder="City, State" />
          </Field>
          <Field label="Phone" htmlFor="phone">
            <Input id="phone" {...form.register('phone')} />
          </Field>
        </div>
      </PageSection>

      <PageSection title="Brand">
        <div className="space-y-5">
          <Field label="Business summary" htmlFor="businessSummary">
            <Textarea id="businessSummary" {...form.register('businessSummary')} rows={3} />
          </Field>
          <Field label="Brand voice" htmlFor="brandVoice">
            <Textarea id="brandVoice" {...form.register('brandVoice')} rows={2} />
          </Field>
          <Field label="Target audience" htmlFor="targetAudience">
            <Textarea id="targetAudience" {...form.register('targetAudience')} rows={2} />
          </Field>
        </div>
      </PageSection>

      <PageSection title="Strategy">
        <div className="space-y-5">
          <Field label="Main CTA" htmlFor="mainCta">
            <Textarea id="mainCta" {...form.register('mainCta')} rows={3} />
          </Field>
          <Field label="Focus 1" htmlFor="focus1">
            <Textarea id="focus1" {...form.register('focus1')} rows={2} />
          </Field>
          <Field label="Focus 2" htmlFor="focus2">
            <Textarea id="focus2" {...form.register('focus2')} rows={2} />
          </Field>
          <Field label="Focus 3" htmlFor="focus3">
            <Textarea id="focus3" {...form.register('focus3')} rows={2} />
          </Field>
          <Field label="Dos" htmlFor="dos">
            <Textarea id="dos" {...form.register('dos')} rows={2} />
          </Field>
          <Field label="Don'ts" htmlFor="donts">
            <Textarea id="donts" {...form.register('donts')} rows={2} />
          </Field>
        </div>
      </PageSection>

      <PageSection title="Scheduling">
        <div className="space-y-5">
          <Field label="Posting days" hint="Comma-separated: Mon,Wed,Fri" htmlFor="postingDays">
            <Input id="postingDays" {...form.register('postingDays')} />
          </Field>
          <Field label="Post length" htmlFor="postLength">
            <Input
              id="postLength"
              {...form.register('postLength')}
              placeholder="e.g. Max 360 characters"
            />
          </Field>
          <Field label="Holiday handling" htmlFor="holidayHandling">
            <select
              id="holidayHandling"
              {...form.register('holidayHandling')}
              className="h-11 w-full rounded-xl border border-input bg-card px-3.5 text-[15px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
            >
              <option value="Major-US">Major US holidays</option>
              <option value="Off">None</option>
            </select>
          </Field>
          <Field label="Excluded dates" hint="Comma-separated YYYY-MM-DD" htmlFor="excludedDates">
            <Input id="excludedDates" {...form.register('excludedDates')} />
          </Field>
        </div>
      </PageSection>

      <PageSection title="Assets">
        <div className="space-y-5">
          <Field label="URLs" hint="Comma-separated full URLs" htmlFor="urls">
            <Input id="urls" {...form.register('urls')} />
          </Field>
          <Field label="Assets folder URL" htmlFor="assetsFolderUrl">
            <Input
              id="assetsFolderUrl"
              {...form.register('assetsFolderUrl')}
              placeholder="https://..."
            />
          </Field>
          <Field
            label="Canva URL"
            hint="Folder or design link for this client's monthly content"
            htmlFor="canvaUrl"
          >
            <Input
              id="canvaUrl"
              {...form.register('canvaUrl')}
              placeholder="https://www.canva.com/..."
            />
          </Field>
        </div>
      </PageSection>

      <PageSection title="Crawl Settings">
        <Field label="Automatic crawling" htmlFor="autoCrawl">
          <select
            id="autoCrawl"
            {...form.register('autoCrawl')}
            className="h-11 w-full rounded-xl border border-input bg-card px-3.5 text-[15px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          >
            <option value="always">Always recrawl (every generation)</option>
            <option value="when_empty">Only when no stored data exists</option>
            <option value="never">Never crawl automatically (use stored data)</option>
          </select>
          <p className="text-[13px] text-muted-foreground mt-2">
            Controls whether the pipeline crawls websites during content generation. &quot;Always&quot; gives freshest data but uses crawl credits each time. &quot;Never&quot; is free but uses older data.
          </p>
        </Field>
      </PageSection>

      <PageSection title="Workflow">
        <div className="space-y-5">
          <label htmlFor="clientReviewEnabled" className="flex items-start gap-3 cursor-pointer">
            <BrandCheckbox
              id="clientReviewEnabled"
              {...form.register('clientReviewEnabled')}
              className="mt-1"
            />
            <span className="flex flex-col gap-1">
              <span className="font-medium">Client Review</span>
              <span className="text-sm text-muted-foreground">
                When on, this client gets steps 8 and 9 in the relay
                (Sent to client + Client review). When off, batches skip
                those steps and shorten to 10 total.
              </span>
              <span className="text-sm text-muted-foreground">
                Changes only apply to new batches. Open batches keep the
                flow they started under.
              </span>
            </span>
          </label>
        </div>
      </PageSection>

      <div className="flex justify-end gap-2">
        <Button variant="accent" size="lg" type="submit">{submitLabel}</Button>
      </div>
    </form>
  )
}

function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: string
  hint?: string
  error?: string
  htmlFor?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor} className="text-[13px] font-medium text-foreground">{label}</Label>
      {children}
      {hint && <p className="text-[12px] text-muted-foreground">{hint}</p>}
      {error && <p className="text-[12px] text-destructive">{error}</p>}
    </div>
  )
}
