'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateOrgBrandingAction } from './actions'

/**
 * White-label branding form for /settings/org (P2 #21). Admin-only surface
 * (the page gates on `admin.portal`; the action re-checks). Logo URL + accent
 * color; empty fields clear the branding back to the default Relay/FON look.
 */
export function OrgBrandingForm({
  brandLogoUrl,
  brandColor,
}: {
  brandLogoUrl: string | null
  brandColor: string | null
}) {
  const router = useRouter()
  const [logo, setLogo] = useState(brandLogoUrl ?? '')
  const [color, setColor] = useState(brandColor ?? '')
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)
    start(async () => {
      try {
        await updateOrgBrandingAction({ brandLogoUrl: logo, brandColor: color })
        setSaved(true)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save branding')
      }
    })
  }

  return (
    <form
      onSubmit={onSubmit}
      data-testid="org-branding-form"
      className="flex w-full max-w-md flex-col gap-4"
    >
      <div className="space-y-2">
        <Label htmlFor="brand-logo">Logo URL</Label>
        <Input
          id="brand-logo"
          type="text"
          inputMode="url"
          value={logo}
          onChange={(e) => setLogo(e.target.value)}
          placeholder="https://cdn.youragency.com/logo.png"
          disabled={pending}
        />
        <p className="text-xs text-muted-foreground">
          A hosted image URL. Leave blank to use the default wordmark.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="brand-color">Accent color</Label>
        <div className="flex items-center gap-2">
          <Input
            id="brand-color"
            type="text"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            placeholder="#0a84ff"
            disabled={pending}
          />
          {color ? (
            <span
              aria-hidden="true"
              data-testid="brand-color-swatch"
              className="size-8 shrink-0 rounded-md border border-border"
              style={{ backgroundColor: color }}
            />
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          A hex color like <code>#0a84ff</code>. Tints the review email button.
        </p>
      </div>

      {error && (
        <p role="alert" data-testid="org-branding-error" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {saved && !error && (
        <p data-testid="org-branding-saved" className="text-sm text-emerald-600">
          Saved.
        </p>
      )}

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save branding'}
        </Button>
      </div>
    </form>
  )
}
