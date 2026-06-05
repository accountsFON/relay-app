/**
 * ActivityThread, vertical timeline mixing auto-events and human comments,
 * laid out as a chat: a scrollable message area (oldest -> newest) that fills
 * its parent's height, with the CommentComposer pinned at the bottom so the
 * text box is always visible while messages scroll.
 *
 * Spec: projects/relay-app/2026-05-09-activity-thread-plan.md § ActivityThread component
 *       projects/relay-app/2026-06-04-chat-sticky-composer-design.md
 *
 * Behavior (V2):
 * - Server component. Receives events newest-first (as loaded upstream) and
 *   renders them oldest-first so the newest sits at the bottom by the composer.
 * - ChatScrollArea auto-scrolls to the newest on mount and when a new event
 *   arrives (keyed on the newest event id).
 * - Composer pinned at the bottom (shrink-0). Hidden for read-only viewers.
 * - The parent provides a bounded height; this component fills it (h-full).
 * - Pagination ("Load older") in Phase 5.
 */
import { CommentComposer } from './comment-composer'
import { ChatScrollArea } from './chat-scroll-area'
import { EventRenderer } from './event-renderer'
import type { ActivityEventView } from './types'
import type { MentionTarget } from '@/lib/mentions'

export interface ActivityThreadProps {
  clientId: string
  /** Pre-loaded events, newest-first. Empty array renders the empty state. */
  events: ActivityEventView[]
  /** Members of the current org for @mention autocomplete. */
  mentionTargets?: MentionTarget[]
  /** Hide the composer (e.g., on inbox preview or for read-only viewers). */
  hideComposer?: boolean
}

export function ActivityThread({
  clientId,
  events,
  mentionTargets = [],
  hideComposer = false,
}: ActivityThreadProps) {
  // Events arrive newest-first; render oldest -> newest so the newest message
  // sits at the bottom, next to the composer (classic chat ordering).
  const ordered = [...events].reverse()
  // scrollKey changes whenever the newest event changes; ChatScrollArea uses it
  // to pin to the bottom on load and after a send brings a new event in.
  const scrollKey = events.length > 0 ? events[0].id : 'empty'

  const composer = !hideComposer ? (
    <CommentComposer
      clientId={clientId}
      mentionTargets={mentionTargets}
      className="shrink-0"
    />
  ) : null

  const list =
    ordered.length === 0 ? (
      <p className="rounded-md bg-muted/40 px-3 py-6 text-center text-[13px] text-muted-foreground">
        No activity yet.
      </p>
    ) : (
      <ol className="space-y-1">
        {ordered.map((event) => (
          <li key={event.id} data-event-id={event.id}>
            <EventRenderer event={event} />
          </li>
        ))}
      </ol>
    )

  return (
    <div className="flex h-full min-h-0 flex-col gap-3" data-component="activity-thread">
      <ChatScrollArea scrollKey={scrollKey} className="min-h-0 flex-1">
        {list}
      </ChatScrollArea>
      {/* TODO Phase 5: <button>Load older</button> with pagination */}
      {composer}
    </div>
  )
}
