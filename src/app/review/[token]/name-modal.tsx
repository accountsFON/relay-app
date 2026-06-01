'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { confirmReviewerIdentity } from './_actions'

export type NameModalProps = {
  token: string
  defaultName: string
  defaultEmail: string
}

/**
 * First-visit identity confirm. Pre-fills with the values the AM baked
 * into the MagicLink row, but both fields are editable, clients should
 * be able to correct a typo or use their real name if the AM only had
 * a placeholder.
 *
 * On submit we call the server action which sets a path-scoped cookie
 * and revalidates the path. router.refresh() pulls the new render
 * (without the modal) into view.
 *
 * Renders as a backdrop + centered card. No portal, the parent layout
 * is the only thing on the page at this point so z-index is not
 * contested.
 */
export function NameModal({ token, defaultName, defaultEmail }: NameModalProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState(defaultName)
  const [email, setEmail] = useState(defaultEmail)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('Please enter your name')
      return
    }
    startTransition(async () => {
      try {
        await confirmReviewerIdentity({
          token,
          name: trimmedName,
          email: email.trim() || undefined,
        })
        // The action revalidates the path; refresh pulls the new render
        // so the modal disappears and the feed becomes visible.
        router.refresh()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not confirm'
        setError(message)
      }
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="name-modal-title"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl bg-card p-6 shadow-2xl"
      >
        <h2
          id="name-modal-title"
          className="text-lg font-semibold text-foreground"
        >
          Confirm who you are
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your comments on this batch will show this name. You can edit it.
        </p>

        <label className="mt-5 block text-sm font-medium text-foreground" htmlFor="reviewer-name">
          Name
        </label>
        <input
          id="reviewer-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoFocus
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
        />

        <label className="mt-4 block text-sm font-medium text-foreground" htmlFor="reviewer-email">
          Email <span className="text-muted-foreground">(optional)</span>
        </label>
        <input
          id="reviewer-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
        />

        {error ? (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="mt-6 w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {pending ? 'Confirming...' : 'Continue'}
        </button>
      </form>
    </div>
  )
}
