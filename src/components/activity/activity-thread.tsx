/**
 * ActivityThread, vertical timeline mixing auto-events and human comments.
 *
 * Spec: projects/relay-app/2026-05-09-activity-thread-plan.md § ActivityThread component
 *       projects/relay-app/2026-05-09-relay-workflow-design.md § Phase 1b
 *
 * Behavior (V1):
 * - Server component. First 50 events rendered SSR, ordered newest first.
 * - Composer (CommentComposer) defaults to the top so it stays visible inside
 *   the sticky right rail. Pass composerPosition="bottom" to flip back to the
 *   original layout if needed.
 * - Pagination ("Load older") in Phase 5.
 *
 * Schema dep: ActivityEvent (Rails-owned). For now, accepts pre-loaded
 *             ActivityEventView[] from caller so this is testable in isolation.
 */
import { CommentComposer } from './comment-composer'
import { EventRenderer } from './event-renderer'
import type { ActivityEventView } from './types'
import type { MentionTarget } from '@/lib/mentions'

export interface ActivityThreadProps {
  clientId: string
  /** Pre-loaded events. Empty array renders the empty state. */
  events: ActivityEventView[]
  /** Members of the current org for @mention autocomplete. */
  mentionTargets?: MentionTarget[]
  /** Hide the composer (e.g., on inbox preview). */
  hideComposer?: boolean
  /** Where the composer sits relative to the event list. Defaults to top. */
  composerPosition?: 'top' | 'bottom'
}

export function ActivityThread({
  clientId,
  events,
  mentionTargets = [],
  hideComposer = false,
  composerPosition = 'top',
}: ActivityThreadProps) {
  const composer = !hideComposer ? (
    <CommentComposer clientId={clientId} mentionTargets={mentionTargets} />
  ) : null

  const list =
    events.length === 0 ? (
      <p className="rounded-md bg-muted/40 px-3 py-6 text-center text-[13px] text-muted-foreground">
        No activity yet.
      </p>
    ) : (
      <ol className="space-y-1">
        {events.map((event) => (
          <li key={event.id}>
            <EventRenderer event={event} />
          </li>
        ))}
      </ol>
    )

  return (
    <div className="flex flex-col gap-3" data-component="activity-thread">
      {composerPosition === 'top' && composer}
      {list}
      {/* TODO Phase 5: <button>Load older</button> with pagination */}
      {composerPosition === 'bottom' && composer}
    </div>
  )
}
