'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { completeOnboarding } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * Client wrapper for the onboarding submit. It calls the completeOnboarding
 * server action (which does the DB writes) and then performs a FULL document
 * navigation to the destination the action returns.
 *
 * Why not let the server action redirect()? A server-action redirect delivered
 * the first page (/welcome) as a soft navigation that never attached client
 * interactivity: every button was dead and the launch-pad tour never fired
 * until a manual reload. A full-document navigation always hydrates cleanly (a
 * plain refresh, itself a full load, was the user's proven workaround). The
 * action still throws redirect() for the pre-write guard bounces (/invite-only,
 * existing user -> /dashboard); only the success landing is handed back here.
 */
export function OnboardingForm({
  isInvite,
  creationEnabled,
  inviteTicket,
}: {
  isInvite: boolean
  creationEnabled: boolean
  inviteTicket: string
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    setError('')
    startTransition(async () => {
      try {
        const result = await completeOnboarding(formData)
        if (result?.redirectTo) {
          // Full document load -> clean SSR + hydration on the landing page.
          window.location.assign(result.redirectTo)
        }
      } catch (err) {
        // A guard-bounce redirect() is handled by Next and never lands here;
        // a genuine failure does.
        setError(
          err instanceof Error ? err.message : 'Something went wrong. Try again.',
        )
      }
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <input type="hidden" name="inviteTicket" value={inviteTicket} />
      <div className="space-y-2">
        <Label htmlFor="displayName">Your name</Label>
        <Input
          id="displayName"
          name="displayName"
          type="text"
          required
          placeholder="e.g. Julio Aleman"
        />
      </div>
      {!isInvite && creationEnabled && (
        <div className="space-y-2">
          <Label htmlFor="agencyName">Agency name</Label>
          <Input
            id="agencyName"
            name="agencyName"
            type="text"
            required
            placeholder="e.g. Acme Marketing"
          />
        </div>
      )}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? 'Getting started...' : 'Get started'}
      </Button>
    </form>
  )
}
