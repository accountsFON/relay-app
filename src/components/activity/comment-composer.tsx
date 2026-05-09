/**
 * CommentComposer — plain textarea + @mention autocomplete.
 *
 * Spec: projects/relay-app/2026-05-09-activity-thread-plan.md § CommentComposer
 *       projects/relay-app/2026-05-09-relay-workflow-design.md § Phase 2
 *
 * Behavior (V1):
 * - On `@`, dropdown of org members filtered by typed prefix.
 * - On submit, calls postCommentAction. Optimistic append + router.refresh()
 *   to pick up server truth and any racing events.
 * - Send button enabled when body is non-empty.
 *
 * Phase: shell now. Phase 2 wires:
 *   - postCommentAction (Caleb-owned, calls Rails recordActivity helper)
 *   - mention parsing on `@firstname.lastname`
 *   - autocomplete dropdown
 *
 * Schema dep: postCommentAction (Caleb owns), recordActivity helper (Rails owns).
 */
'use client'

import { useState, useTransition } from 'react'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

export interface CommentComposerProps {
  clientId: string
  mentionTargets?: { id: string; handle: string; name: string }[]
  className?: string
}

export function CommentComposer({
  clientId,
  mentionTargets = [],
  className,
}: CommentComposerProps) {
  const [body, setBody] = useState('')
  const [isPending, startTransition] = useTransition()

  const canSubmit = body.trim().length > 0 && !isPending

  function submit() {
    if (!canSubmit) return
    startTransition(async () => {
      // TODO Phase 2: parse @handles -> userIds via mentionTargets, then:
      // await postCommentAction({ clientId, body, mentionedUserIds })
      // router.refresh()
      console.log('TODO: postCommentAction', { clientId, body, mentionTargets })
      setBody('')
    })
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      className={cn('flex flex-col gap-2 rounded-md border border-border bg-background p-2', className)}
      data-component="comment-composer"
    >
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Type a message... @ to mention"
        rows={2}
        className="resize-none border-0 focus-visible:ring-0 shadow-none p-2"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault()
            submit()
          }
        }}
      />
      {/* TODO Phase 2: @mention autocomplete dropdown anchored to textarea */}
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">
          ⌘↵ to send · @ to mention
        </p>
        <Button type="submit" size="xs" disabled={!canSubmit}>
          <Send />
          Send
        </Button>
      </div>
    </form>
  )
}
