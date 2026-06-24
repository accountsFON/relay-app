'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { DiffModal } from '@/components/preview/diff-modal'
import type { DiffSegment } from '@/lib/text-diff'

/**
 * Fix with AI trigger button. Lives inside the pin popover for post-level
 * and caption-text threads in internal (AM) mode. Hidden on image-pinned
 * threads (no image regen in v1) and in review (magic-link) mode (cost +
 * abuse vector, design doc § Non-goals).
 *
 * Click flow:
 *   1. POST /api/posts/[postId]/fix-with-ai with { threadId }
 *   2. Response carries { proposedCaption, diff, tokenUsage }
 *   3. DiffModal opens; AM accepts / edits-then-accepts / rejects
 *   4. On accept, POST /api/posts/[postId]/fix-with-ai/accept commits the
 *      new caption + auto-resolves the originating thread; the modal calls
 *      `onAccepted` so the host shell can refresh
 *
 * Spec: design doc § Fix with AI; plan Task 3.1.
 */

export type FixWithAIButtonProps = {
  postId: string
  /** Omit for a per-post fix (aggregates all the post's feedback). */
  threadId?: string
  /** Pin kind when triggered from a pin; omit for per-post. */
  pinKind?: 'post' | 'image' | 'caption'
  mode: 'internal' | 'review'
  onAccepted?: () => void
  /**
   * Originating caption shown in the modal next to the diff. Optional , the
   * diff itself carries the full rewrite; we surface the original purely as
   * a header reference. When omitted, the modal renders the diff alone.
   */
  originalCaption?: string
  /** Button label. Defaults to "Fix with AI". */
  label?: string
}

type Proposal = {
  proposedCaption: string
  diff: DiffSegment[]
  tokenUsage?: { in: number; out: number; costUsd: number }
}

export function FixWithAIButton({
  postId,
  threadId,
  pinKind,
  mode,
  onAccepted,
  originalCaption,
  label = 'Fix with AI',
}: FixWithAIButtonProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [proposal, setProposal] = useState<Proposal | null>(null)

  // Hidden in review mode, hidden on image pins. Render nothing.
  if (mode !== 'internal') return null
  if (pinKind === 'image') return null

  async function handleClick() {
    if (loading) return
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(`/api/posts/${postId}/fix-with-ai`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(threadId ? { threadId } : {}),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        setError(text || `Request failed (${res.status})`)
        return
      }
      const data = (await res.json()) as Proposal
      setProposal(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fix with AI failed')
    } finally {
      setLoading(false)
    }
  }

  function handleClose() {
    setProposal(null)
  }

  function handleAccepted() {
    setProposal(null)
    onAccepted?.()
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        data-testid="fix-with-ai-button"
        onClick={handleClick}
        disabled={loading}
      >
        {loading ? 'Thinking...' : label}
      </Button>
      {error ? (
        <p
          role="alert"
          data-testid="fix-with-ai-error"
          className="text-[12px] text-destructive"
        >
          {error}
        </p>
      ) : null}
      {proposal ? (
        <DiffModal
          postId={postId}
          threadId={threadId}
          originalCaption={originalCaption}
          proposedCaption={proposal.proposedCaption}
          diff={proposal.diff}
          tokenUsage={proposal.tokenUsage}
          onAccepted={handleAccepted}
          onClose={handleClose}
        />
      ) : null}
    </>
  )
}
