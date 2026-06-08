'use client'

import * as React from 'react'
import { useState, useEffect, useTransition, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { Client } from '@prisma/client'
import { ExternalLink, Link as LinkIcon, Pencil, Check, X } from 'lucide-react'
import { PageSection } from '@/components/ui/page-section'
import { Button } from '@/components/ui/button'
import { BrandCheckbox } from '@/components/ui/brand-checkbox'
import { StatusPill } from '@/components/ui/status-pill'
import { cn } from '@/lib/utils'
import { updateClientAction } from '@/app/(app)/clients/actions'
import type { ClientUpdate } from '@/lib/schemas/client'
import { useUnsavedChanges } from '@/lib/unsaved-changes'

const POSTING_DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

type FieldKey = keyof ClientUpdate

/**
 * Callback ref for inline text editors: focus the field and drop the caret at
 * the end of the existing text so the user can append immediately. Plain
 * `autoFocus` lands the caret at the start of a pre-filled value in some
 * browsers. Module-level so its identity is stable and React invokes it once on
 * mount (a new closure each render would re-fire and fight the user's caret).
 */
function focusAtEnd(el: HTMLInputElement | HTMLTextAreaElement | null) {
  if (!el) return
  el.focus()
  const end = el.value.length
  try {
    el.setSelectionRange(end, end)
  } catch {
    // Some input types (email, number, …) don't support selection; focus alone is fine.
  }
}

export function ClientProfileView({
  client,
  canEdit = false,
}: {
  client: Client
  canEdit?: boolean
}) {
  return (
    <div className="space-y-6">
      <PageSection title="Identity">
        <KeyValueGrid>
          <KeyValueField clientId={client.id} fieldKey="name" label="Name" value={client.name} canEdit={canEdit} required />
          <KeyValueField clientId={client.id} fieldKey="industry" label="Industry" value={client.industry} canEdit={canEdit} />
          <KeyValueField clientId={client.id} fieldKey="location" label="Location" value={client.location} canEdit={canEdit} placeholder="City, State" />
          <KeyValueField clientId={client.id} fieldKey="phone" label="Phone" value={client.phone} canEdit={canEdit} kind="phone" />
        </KeyValueGrid>
      </PageSection>

      <PageSection title="Brand">
        <FieldStack>
          <NarrativeField clientId={client.id} fieldKey="businessSummary" label="Business summary" value={client.businessSummary} canEdit={canEdit} />
          <NarrativeField clientId={client.id} fieldKey="brandVoice" label="Brand voice" value={client.brandVoice} canEdit={canEdit} />
          <NarrativeField clientId={client.id} fieldKey="targetAudience" label="Target audience" value={client.targetAudience} canEdit={canEdit} />
        </FieldStack>
      </PageSection>

      <PageSection title="Strategy">
        <FieldStack>
          <NarrativeField clientId={client.id} fieldKey="mainCta" label="Main CTA" value={client.mainCta} canEdit={canEdit} maxHeight={280} />
          <FocusField clientId={client.id} fieldKey="focus1" index={1} value={client.focus1} canEdit={canEdit} />
          <FocusField clientId={client.id} fieldKey="focus2" index={2} value={client.focus2} canEdit={canEdit} />
          <FocusField clientId={client.id} fieldKey="focus3" index={3} value={client.focus3} canEdit={canEdit} />
          <NarrativeField clientId={client.id} fieldKey="dos" label="Dos" value={client.dos} canEdit={canEdit} maxHeight={260} />
          <NarrativeField clientId={client.id} fieldKey="donts" label="Don'ts" value={client.donts} canEdit={canEdit} maxHeight={260} />
        </FieldStack>
      </PageSection>

      <PageSection title="Scheduling">
        <KeyValueGrid>
          <PostingDaysField clientId={client.id} value={client.postingDays} canEdit={canEdit} />
          <KeyValueField clientId={client.id} fieldKey="postLength" label="Post length" value={client.postLength} canEdit={canEdit} placeholder="e.g. Max 360 characters" />
          <SelectField
            clientId={client.id}
            fieldKey="holidayHandling"
            label="Holiday handling"
            value={client.holidayHandling}
            canEdit={canEdit}
            options={[
              { value: 'Major-US', label: 'Major US holidays' },
              { value: 'Off', label: 'None' },
            ]}
          />
          <ChipsField clientId={client.id} fieldKey="excludedDates" label="Excluded dates" value={client.excludedDates} canEdit={canEdit} placeholder="2026-01-01, 2026-07-04" />
        </KeyValueGrid>
      </PageSection>

      <PageSection title="Workflow">
        <FieldStack>
          <BooleanField
            clientId={client.id}
            fieldKey="clientReviewEnabled"
            label="Client Review"
            value={client.clientReviewEnabled}
            canEdit={canEdit}
            onLabel="On"
            offLabel="Off"
            description={
              <>
                When on, this client gets steps 8 and 9 in the relay (Sent to
                client and Client review). When off, batches skip those steps
                and shorten to 10 total. Changes only apply to new batches;
                open batches keep the flow they started under.
              </>
            }
          />
        </FieldStack>
      </PageSection>

      <PageSection title="Assets">
        <FieldStack>
          <UrlListField clientId={client.id} label="URLs" urls={client.urls} canEdit={canEdit} />
          <LinkField clientId={client.id} fieldKey="assetsFolderUrl" label="Assets folder" href={client.assetsFolderUrl} canEdit={canEdit} />
          <LinkField clientId={client.id} fieldKey="canvaUrl" label="Canva" href={client.canvaUrl} canEdit={canEdit} />
        </FieldStack>
      </PageSection>
    </div>
  )
}

// ============================================================
// Layout helpers
// ============================================================

function KeyValueGrid({ children }: { children: React.ReactNode }) {
  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
      {children}
    </dl>
  )
}

function FieldStack({ children }: { children: React.ReactNode }) {
  return (
    <div className="divide-y divide-border -my-5">
      {React.Children.map(children, (child, i) => (
        <div key={i} className="py-5">{child}</div>
      ))}
    </div>
  )
}

// ============================================================
// Editing infrastructure
// ============================================================

/**
 * useFieldEditor: common state machine for one editable field.
 * Tracks dirty, pending, and exposes save/cancel.
 */
function useFieldEditor<T>({
  clientId,
  fieldKey,
  initial,
  serialize = (v: T) => v as unknown as ClientUpdate[FieldKey],
}: {
  clientId: string
  fieldKey: FieldKey
  initial: T
  serialize?: (value: T) => ClientUpdate[FieldKey]
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<T>(initial)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // When the upstream value changes (after a save), refresh the draft baseline.
  useEffect(() => {
    if (!editing) setDraft(initial)
  }, [initial, editing])

  const isDirty = editing && !equal(draft, initial)
  useUnsavedChanges(isDirty)

  const startEdit = useCallback(() => {
    setDraft(initial)
    setError(null)
    setEditing(true)
  }, [initial])

  const cancel = useCallback(() => {
    if (isDirty && !window.confirm('Discard unsaved changes?')) return
    setEditing(false)
    setError(null)
  }, [isDirty])

  const save = useCallback(() => {
    if (!isDirty) {
      setEditing(false)
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        await updateClientAction(clientId, { [fieldKey]: serialize(draft) } as ClientUpdate)
        setEditing(false)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Save failed')
      }
    })
  }, [isDirty, clientId, fieldKey, draft, serialize, router])

  return { editing, draft, setDraft, pending, error, isDirty, startEdit, cancel, save }
}

function equal(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((v, i) => v === b[i])
  }
  return a === b
}

/**
 * Field chrome shared by all editable fields:
 * label row + edit affordance + dirty pip + save/cancel toolbar.
 */
function FieldHeader({
  label,
  canEdit,
  editing,
  pending,
  isDirty,
  onEdit,
  onSave,
  onCancel,
}: {
  label: string
  canEdit: boolean
  editing: boolean
  pending: boolean
  isDirty: boolean
  onEdit: () => void
  onSave: () => void
  onCancel: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 min-h-7">
      <div className="flex items-center gap-2 min-w-0">
        <h3 className="text-[12px] font-medium uppercase tracking-[0.06em] text-muted-foreground truncate">
          {label}
        </h3>
        {isDirty && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground/70">
            <span className="size-1.5 rounded-full bg-foreground" />
            Unsaved
          </span>
        )}
      </div>
      {canEdit && !editing && (
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${label}`}
          className="inline-flex items-center justify-center size-7 rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-foreground transition-colors shrink-0"
        >
          <Pencil className="size-3.5" />
        </button>
      )}
      {editing && (
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel"
            className="inline-flex items-center justify-center size-7 rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-foreground transition-colors"
          >
            <X className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={pending || !isDirty}
            aria-label="Save"
            className="inline-flex items-center justify-center size-7 rounded-full bg-foreground text-neutral-50 hover:bg-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <Check className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}

function FieldError({ error }: { error: string | null }) {
  if (!error) return null
  return <p className="text-[12px] text-destructive mt-1">{error}</p>
}

// ============================================================
// Field components
// ============================================================

function KeyValueField({
  clientId,
  fieldKey,
  label,
  value,
  canEdit,
  kind = 'text',
  placeholder,
  required = false,
}: {
  clientId: string
  fieldKey: FieldKey
  label: string
  value: string | null | undefined
  canEdit: boolean
  kind?: 'text' | 'phone'
  placeholder?: string
  required?: boolean
}) {
  const editor = useFieldEditor<string>({
    clientId,
    fieldKey,
    initial: value ?? '',
  })

  return (
    <div className="flex flex-col gap-1.5">
      <FieldHeader
        label={label}
        canEdit={canEdit}
        editing={editor.editing}
        pending={editor.pending}
        isDirty={editor.isDirty}
        onEdit={editor.startEdit}
        onSave={editor.save}
        onCancel={editor.cancel}
      />
      {editor.editing ? (
        <>
          <input
            type={kind === 'phone' ? 'tel' : 'text'}
            ref={focusAtEnd}
            value={editor.draft}
            onChange={(e) => editor.setDraft(e.target.value)}
            placeholder={placeholder}
            required={required}
            className="h-10 w-full rounded-xl border border-input bg-card px-3 text-[15px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                editor.save()
              } else if (e.key === 'Escape') {
                editor.cancel()
              }
            }}
          />
          <FieldError error={editor.error} />
        </>
      ) : (
        <dd className="text-[15px] text-foreground break-words">
          {renderInlineValue(value, kind)}
        </dd>
      )}
    </div>
  )
}

function renderInlineValue(
  value: string | null | undefined,
  kind: 'text' | 'phone'
): React.ReactNode {
  if (!value) return <EmptyValue />
  if (kind === 'phone') {
    const tel = value.replace(/[^+\d]/g, '')
    return (
      <a href={`tel:${tel}`} className="hover:text-neutral-500 transition-colors underline-offset-2 hover:underline">
        {value}
      </a>
    )
  }
  return value
}

function NarrativeField({
  clientId,
  fieldKey,
  label,
  value,
  canEdit,
  maxHeight = 240,
}: {
  clientId: string
  fieldKey: FieldKey
  label: string
  value: string | null | undefined
  canEdit: boolean
  maxHeight?: number
}) {
  const editor = useFieldEditor<string>({
    clientId,
    fieldKey,
    initial: value ?? '',
  })

  return (
    <div className="space-y-2">
      <FieldHeader
        label={label}
        canEdit={canEdit}
        editing={editor.editing}
        pending={editor.pending}
        isDirty={editor.isDirty}
        onEdit={editor.startEdit}
        onSave={editor.save}
        onCancel={editor.cancel}
      />
      {editor.editing ? (
        <>
          <textarea
            ref={focusAtEnd}
            value={editor.draft}
            onChange={(e) => editor.setDraft(e.target.value)}
            rows={6}
            className="w-full min-h-[120px] max-h-[400px] overflow-y-auto rounded-xl border border-input bg-card px-3.5 py-2.5 text-[14px] leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 resize-y"
            onKeyDown={(e) => {
              if (e.key === 'Escape') editor.cancel()
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                editor.save()
              }
            }}
          />
          <p className="text-[11px] text-muted-foreground">⌘↵ to save · Esc to cancel</p>
          <FieldError error={editor.error} />
        </>
      ) : value ? (
        <ScrollableContent maxHeight={maxHeight}>
          <Linkified text={value} />
        </ScrollableContent>
      ) : (
        <div className="rounded-xl bg-neutral-100/60 px-4 py-3 text-[14px]">
          <EmptyValue />
        </div>
      )}
    </div>
  )
}

/**
 * FocusField: same shape as NarrativeField but with a numbered badge
 * inline with the label, so Focus 1/2/3 stack consistently with Main CTA,
 * Dos, Don'ts in the Strategy section.
 */
function FocusField({
  clientId,
  fieldKey,
  index,
  value,
  canEdit,
}: {
  clientId: string
  fieldKey: FieldKey
  index: number
  value: string | null | undefined
  canEdit: boolean
}) {
  const editor = useFieldEditor<string>({
    clientId,
    fieldKey,
    initial: value ?? '',
  })

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 min-h-7">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex size-5 items-center justify-center rounded-full bg-foreground text-[10px] font-bold text-neutral-50 tabular-nums shrink-0">
            {index}
          </span>
          <h3 className="text-[12px] font-medium uppercase tracking-[0.06em] text-muted-foreground truncate">
            Focus
          </h3>
          {editor.isDirty && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground/70">
              <span className="size-1.5 rounded-full bg-foreground" />
              Unsaved
            </span>
          )}
        </div>
        {canEdit && !editor.editing && (
          <button
            type="button"
            onClick={editor.startEdit}
            aria-label={`Edit Focus ${index}`}
            className="inline-flex items-center justify-center size-7 rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-foreground transition-colors shrink-0"
          >
            <Pencil className="size-3.5" />
          </button>
        )}
        {editor.editing && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={editor.cancel}
              aria-label="Cancel"
              className="inline-flex items-center justify-center size-7 rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-foreground transition-colors"
            >
              <X className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={editor.save}
              disabled={editor.pending || !editor.isDirty}
              aria-label="Save"
              className="inline-flex items-center justify-center size-7 rounded-full bg-foreground text-neutral-50 hover:bg-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <Check className="size-3.5" />
            </button>
          </div>
        )}
      </div>
      {editor.editing ? (
        <>
          <textarea
            ref={focusAtEnd}
            value={editor.draft}
            onChange={(e) => editor.setDraft(e.target.value)}
            rows={4}
            className="w-full min-h-[100px] max-h-[300px] overflow-y-auto rounded-xl border border-input bg-card px-3.5 py-2.5 text-[14px] leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 resize-y"
            onKeyDown={(e) => {
              if (e.key === 'Escape') editor.cancel()
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                editor.save()
              }
            }}
          />
          <p className="text-[11px] text-muted-foreground">⌘↵ to save · Esc to cancel</p>
          <FieldError error={editor.error} />
        </>
      ) : value ? (
        <ScrollableContent maxHeight={200}>
          <Linkified text={value} />
        </ScrollableContent>
      ) : (
        <div className="rounded-xl bg-neutral-100/60 px-4 py-3 text-[14px]">
          <EmptyValue />
        </div>
      )}
    </div>
  )
}

function PostingDaysField({
  clientId,
  value,
  canEdit,
}: {
  clientId: string
  value: string
  canEdit: boolean
}) {
  const editor = useFieldEditor<string>({
    clientId,
    fieldKey: 'postingDays',
    initial: value,
  })

  const activeDays = editor.editing
    ? new Set(editor.draft.split(',').map((d) => d.trim()))
    : new Set(value.split(',').map((d) => d.trim()))

  const toggleDay = (d: string) => {
    const next = new Set(editor.draft.split(',').map((s) => s.trim()))
    if (next.has(d)) next.delete(d)
    else next.add(d)
    editor.setDraft(POSTING_DAY_ORDER.filter((day) => next.has(day)).join(','))
  }

  return (
    <div className="flex flex-col gap-1.5">
      <FieldHeader
        label="Posting days"
        canEdit={canEdit}
        editing={editor.editing}
        pending={editor.pending}
        isDirty={editor.isDirty}
        onEdit={editor.startEdit}
        onSave={editor.save}
        onCancel={editor.cancel}
      />
      <div className="flex flex-wrap gap-1.5">
        {POSTING_DAY_ORDER.map((d) => {
          const active = activeDays.has(d)
          if (editor.editing) {
            return (
              <button
                key={d}
                type="button"
                onClick={() => toggleDay(d)}
                className={cn(
                  'inline-flex h-8 min-w-9 items-center justify-center rounded-full px-2.5 text-[12px] font-semibold transition-colors',
                  active
                    ? 'bg-foreground text-neutral-50 hover:bg-neutral-700'
                    : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200 hover:text-foreground'
                )}
              >
                {d}
              </button>
            )
          }
          return (
            <span
              key={d}
              className={cn(
                'inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-[12px] font-semibold tabular-nums',
                active
                  ? 'bg-foreground text-neutral-50'
                  : 'bg-neutral-100 text-neutral-300 line-through decoration-1'
              )}
            >
              {d}
            </span>
          )
        })}
      </div>
      <FieldError error={editor.error} />
    </div>
  )
}

function ChipsField({
  clientId,
  fieldKey,
  label,
  value,
  canEdit,
  placeholder,
}: {
  clientId: string
  fieldKey: FieldKey
  label: string
  value: string[]
  canEdit: boolean
  placeholder?: string
}) {
  const editor = useFieldEditor<string>({
    clientId,
    fieldKey,
    initial: value.join(', '),
    serialize: (v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean) as unknown as ClientUpdate[FieldKey],
  })

  return (
    <div className="flex flex-col gap-1.5">
      <FieldHeader
        label={label}
        canEdit={canEdit}
        editing={editor.editing}
        pending={editor.pending}
        isDirty={editor.isDirty}
        onEdit={editor.startEdit}
        onSave={editor.save}
        onCancel={editor.cancel}
      />
      {editor.editing ? (
        <>
          <input
            ref={focusAtEnd}
            value={editor.draft}
            onChange={(e) => editor.setDraft(e.target.value)}
            placeholder={placeholder}
            className="h-10 w-full rounded-xl border border-input bg-card px-3 text-[14px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                editor.save()
              } else if (e.key === 'Escape') {
                editor.cancel()
              }
            }}
          />
          <p className="text-[11px] text-muted-foreground">Comma-separated</p>
          <FieldError error={editor.error} />
        </>
      ) : value.length === 0 ? (
        <EmptyValue />
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {value.map((v) => (
            <span
              key={v}
              className="inline-flex h-7 items-center rounded-full bg-neutral-100 px-3 text-[13px] tabular-nums text-foreground"
            >
              {v}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function SelectField({
  clientId,
  fieldKey,
  label,
  value,
  canEdit,
  options,
}: {
  clientId: string
  fieldKey: FieldKey
  label: string
  value: string
  canEdit: boolean
  options: { value: string; label: string }[]
}) {
  const editor = useFieldEditor<string>({
    clientId,
    fieldKey,
    initial: value,
  })

  const selectedLabel = options.find((o) => o.value === value)?.label ?? value

  return (
    <div className="flex flex-col gap-1.5">
      <FieldHeader
        label={label}
        canEdit={canEdit}
        editing={editor.editing}
        pending={editor.pending}
        isDirty={editor.isDirty}
        onEdit={editor.startEdit}
        onSave={editor.save}
        onCancel={editor.cancel}
      />
      {editor.editing ? (
        <>
          <select
            autoFocus
            value={editor.draft}
            onChange={(e) => editor.setDraft(e.target.value)}
            className="h-10 w-full rounded-xl border border-input bg-card px-3 text-[14px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20"
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <FieldError error={editor.error} />
        </>
      ) : (
        <dd className="text-[15px] text-foreground">{selectedLabel}</dd>
      )}
    </div>
  )
}

function BooleanField({
  clientId,
  fieldKey,
  label,
  value,
  canEdit,
  description,
  onLabel = 'On',
  offLabel = 'Off',
}: {
  clientId: string
  fieldKey: FieldKey
  label: string
  value: boolean
  canEdit: boolean
  description?: React.ReactNode
  onLabel?: string
  offLabel?: string
}) {
  const editor = useFieldEditor<boolean>({
    clientId,
    fieldKey,
    initial: value,
  })

  return (
    <div className="flex flex-col gap-1.5">
      <FieldHeader
        label={label}
        canEdit={canEdit}
        editing={editor.editing}
        pending={editor.pending}
        isDirty={editor.isDirty}
        onEdit={editor.startEdit}
        onSave={editor.save}
        onCancel={editor.cancel}
      />
      {editor.editing ? (
        <>
          <label
            htmlFor={`${fieldKey}-edit`}
            className="flex items-start gap-3 cursor-pointer rounded-xl border border-input bg-card px-3.5 py-2.5"
          >
            <BrandCheckbox
              autoFocus
              id={`${fieldKey}-edit`}
              checked={editor.draft}
              onChange={(e) => editor.setDraft(e.target.checked)}
              className="mt-1"
            />
            <span className="flex flex-col gap-1 text-[14px] leading-relaxed">
              <span className="font-medium text-foreground">
                {editor.draft ? onLabel : offLabel}
              </span>
              {description && (
                <span className="text-[12px] text-muted-foreground">
                  {description}
                </span>
              )}
            </span>
          </label>
          <FieldError error={editor.error} />
        </>
      ) : (
        <div className="space-y-1">
          <dd className="flex items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 h-7 text-[12px] font-medium tabular-nums',
                value
                  ? 'bg-foreground text-neutral-50'
                  : 'bg-neutral-100 text-neutral-500',
              )}
            >
              <span
                className={cn(
                  'size-1.5 rounded-full',
                  value ? 'bg-neutral-50' : 'bg-neutral-500',
                )}
              />
              {value ? onLabel : offLabel}
            </span>
          </dd>
          {description && (
            <p className="text-[12px] text-muted-foreground">{description}</p>
          )}
        </div>
      )}
    </div>
  )
}

function UrlListField({
  clientId,
  label,
  urls,
  canEdit,
}: {
  clientId: string
  label: string
  urls: string[]
  canEdit: boolean
}) {
  const editor = useFieldEditor<string>({
    clientId,
    fieldKey: 'urls',
    initial: urls.join(', '),
    serialize: (v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean) as unknown as ClientUpdate['urls'],
  })

  return (
    <div className="space-y-2">
      <FieldHeader
        label={label}
        canEdit={canEdit}
        editing={editor.editing}
        pending={editor.pending}
        isDirty={editor.isDirty}
        onEdit={editor.startEdit}
        onSave={editor.save}
        onCancel={editor.cancel}
      />
      {editor.editing ? (
        <>
          <input
            ref={focusAtEnd}
            value={editor.draft}
            onChange={(e) => editor.setDraft(e.target.value)}
            placeholder="https://example.com, https://example.com/about"
            className="h-10 w-full rounded-xl border border-input bg-card px-3 text-[14px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                editor.save()
              } else if (e.key === 'Escape') {
                editor.cancel()
              }
            }}
          />
          <p className="text-[11px] text-muted-foreground">Comma-separated full URLs</p>
          <FieldError error={editor.error} />
        </>
      ) : urls.length === 0 ? (
        <EmptyValue />
      ) : (
        <div className="flex flex-wrap gap-2">
          {urls.map((url) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="max-w-full"
            >
              <StatusPill
                variant="plain"
                hoverable
                leadingIcon={<LinkIcon className="size-3.5 shrink-0 text-neutral-500" />}
                className="max-w-full"
              >
                <span className="truncate">{prettyUrl(url)}</span>
              </StatusPill>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

function LinkField({
  clientId,
  fieldKey,
  label,
  href,
  canEdit,
}: {
  clientId: string
  fieldKey: FieldKey
  label: string
  href: string | null | undefined
  canEdit: boolean
}) {
  const editor = useFieldEditor<string>({
    clientId,
    fieldKey,
    initial: href ?? '',
  })

  return (
    <div className="space-y-2">
      <FieldHeader
        label={label}
        canEdit={canEdit}
        editing={editor.editing}
        pending={editor.pending}
        isDirty={editor.isDirty}
        onEdit={editor.startEdit}
        onSave={editor.save}
        onCancel={editor.cancel}
      />
      {editor.editing ? (
        <>
          <input
            ref={focusAtEnd}
            type="url"
            value={editor.draft}
            onChange={(e) => editor.setDraft(e.target.value)}
            placeholder="https://drive.google.com/..."
            className="h-10 w-full rounded-xl border border-input bg-card px-3 text-[14px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                editor.save()
              } else if (e.key === 'Escape') {
                editor.cancel()
              }
            }}
          />
          <FieldError error={editor.error} />
        </>
      ) : href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[14px] text-foreground hover:text-neutral-500 transition-colors max-w-full break-words"
        >
          <span className="break-all">{prettyUrl(href)}</span>
          <ExternalLink className="size-3.5 shrink-0" />
        </a>
      ) : (
        <EmptyValue />
      )}
    </div>
  )
}

// ============================================================
// Display helpers
// ============================================================

function ScrollableContent({
  children,
  maxHeight,
  bare = false,
}: {
  children: React.ReactNode
  maxHeight: number
  bare?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [scrollState, setScrollState] = useState<'none' | 'top' | 'middle' | 'bottom'>('none')

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      const overflow = el.scrollHeight > el.clientHeight + 1
      if (!overflow) {
        setScrollState('none')
        return
      }
      const atTop = el.scrollTop <= 1
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 1
      if (atTop) setScrollState('top')
      else if (atBottom) setScrollState('bottom')
      else setScrollState('middle')
    }
    update()
    el.addEventListener('scroll', update)
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [children])

  const showTopFade = scrollState === 'middle' || scrollState === 'bottom'
  const showBottomFade = scrollState === 'top' || scrollState === 'middle'

  return (
    <div className="relative">
      <div
        ref={ref}
        style={{ maxHeight }}
        className={cn(
          'overflow-y-auto text-[14px] leading-relaxed text-foreground whitespace-pre-wrap break-words',
          bare ? '' : 'rounded-xl bg-neutral-100/60 px-4 py-3'
        )}
      >
        {children}
      </div>
      {showTopFade && !bare && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-4 rounded-t-xl bg-gradient-to-b from-neutral-100/95 to-transparent" />
      )}
      {showBottomFade && !bare && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-4 rounded-b-xl bg-gradient-to-t from-neutral-100/95 to-transparent" />
      )}
    </div>
  )
}

function EmptyValue() {
  return (
    <span aria-hidden="true" className="text-neutral-300">
      –
    </span>
  )
}

function prettyUrl(url: string): string {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`)
    return u.host + (u.pathname === '/' ? '' : u.pathname)
  } catch {
    return url
  }
}

const URL_RE = /(https?:\/\/[^\s]+|www\.[^\s]+)/g
const PHONE_RE = /(\(\d{3}\)\s?\d{3}-\d{4}|\d{3}-\d{3}-\d{4}|\(\d{3}\)\s?[A-Z]{3}-[A-Z0-9]{4})/g

function Linkified({ text }: { text: string }) {
  const tokens: { type: 'text' | 'url' | 'phone'; value: string }[] = []
  let cursor = 0
  const matches: { index: number; length: number; type: 'url' | 'phone'; value: string }[] = []

  for (const m of text.matchAll(URL_RE)) {
    if (m.index !== undefined) matches.push({ index: m.index, length: m[0].length, type: 'url', value: m[0] })
  }
  for (const m of text.matchAll(PHONE_RE)) {
    if (m.index !== undefined) matches.push({ index: m.index, length: m[0].length, type: 'phone', value: m[0] })
  }
  matches.sort((a, b) => a.index - b.index)

  for (const m of matches) {
    if (m.index < cursor) continue
    if (m.index > cursor) tokens.push({ type: 'text', value: text.slice(cursor, m.index) })
    tokens.push({ type: m.type, value: m.value })
    cursor = m.index + m.length
  }
  if (cursor < text.length) tokens.push({ type: 'text', value: text.slice(cursor) })

  return (
    <>
      {tokens.map((t, i) => {
        if (t.type === 'url') {
          const href = t.value.startsWith('http') ? t.value : `https://${t.value}`
          return (
            <a
              key={i}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline underline-offset-2 hover:text-neutral-500 break-all"
            >
              {t.value}
            </a>
          )
        }
        if (t.type === 'phone') {
          const tel = t.value.replace(/[^+\d]/g, '')
          return (
            <a
              key={i}
              href={`tel:${tel}`}
              className="text-foreground underline underline-offset-2 hover:text-neutral-500"
            >
              {t.value}
            </a>
          )
        }
        return <span key={i}>{t.value}</span>
      })}
    </>
  )
}
