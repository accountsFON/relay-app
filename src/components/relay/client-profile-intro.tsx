'use client'

import { useState } from 'react'
import { Lightbulb, X } from 'lucide-react'

const SEEN_KEY = 'relay:client-profile-intro-seen-v1'

/** Read the per-device "seen" flag. Runs once, in the lazy state initializer. */
function computeInitialVisible(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return !window.localStorage.getItem(SEEN_KEY)
  } catch {
    // localStorage unavailable (private mode) — show it rather than hide.
    return true
  }
}

/**
 * One-time explainer shown at the top of the read-only client profile modal
 * (the onboarding gates' "Review client profile"). Teaches what the profile is
 * and why to read it, the first time a user opens it.
 *
 * Persistence is a per-device localStorage flag, not cross-device server state:
 * this is a lightweight onboarding hint, so once-per-browser is enough and it
 * needs no server round trip or prop threading through the gates. The flag is
 * read in the lazy state initializer (no effect), which is safe because this
 * only mounts inside an already-open client-side Dialog, never during SSR.
 * Renders nothing once dismissed.
 */
export function ClientProfileIntro({ clientName }: { clientName: string }) {
  const [visible, setVisible] = useState<boolean>(computeInitialVisible)

  function dismiss() {
    try {
      window.localStorage.setItem(SEEN_KEY, '1')
    } catch {
      // Ignore write failures; hiding it for this view is enough.
    }
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div
      data-testid="client-profile-intro"
      className="mb-4 flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4"
    >
      <Lightbulb aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">Start with the profile</p>
        <p className="mt-1 text-sm text-muted-foreground">
          This is {clientName}&rsquo;s brand profile: their voice, audience, and the do&rsquo;s and
          don&rsquo;ts Relay writes from. Give it a read before you start, it is what keeps the
          content on brand.
        </p>
        <button
          type="button"
          data-testid="client-profile-intro-dismiss"
          onClick={dismiss}
          className="mt-3 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          Got it
        </button>
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={dismiss}
        className="-mr-1 -mt-1 shrink-0 rounded-full p-1.5 text-muted-foreground hover:bg-neutral-100 hover:text-foreground"
      >
        <X aria-hidden className="size-4" />
      </button>
    </div>
  )
}
