'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { clientInputSchema, type ClientInput } from '@/lib/schemas/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

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
      status: defaultValues?.status ?? 'active',
    },
  })

  const submitLabel = mode === 'create' ? 'Create client' : 'Save changes'

  return (
    <form
      onSubmit={form.handleSubmit((data) => onSubmit(data as ClientInput))}
      className="space-y-8"
    >
      <Section title="Identity">
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
      </Section>

      <Section title="Brand">
        <Field label="Business summary" htmlFor="businessSummary">
          <Textarea id="businessSummary" {...form.register('businessSummary')} rows={3} />
        </Field>
        <Field label="Brand voice" htmlFor="brandVoice">
          <Textarea id="brandVoice" {...form.register('brandVoice')} rows={2} />
        </Field>
        <Field label="Target audience" htmlFor="targetAudience">
          <Textarea id="targetAudience" {...form.register('targetAudience')} rows={2} />
        </Field>
      </Section>

      <Section title="Strategy">
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
      </Section>

      <Section title="Scheduling">
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
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
          >
            <option value="Major-US">Major US holidays</option>
            <option value="Off">None</option>
          </select>
        </Field>
        <Field label="Excluded dates" hint="Comma-separated YYYY-MM-DD" htmlFor="excludedDates">
          <Input id="excludedDates" {...form.register('excludedDates')} />
        </Field>
      </Section>

      <Section title="Assets">
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
      </Section>

      <div className="flex justify-end">
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
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
      <div className="space-y-4">{children}</div>
    </section>
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
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
