/**
 * ActivityThread — vertical timeline mixing auto-events and human comments.
 *
 * Spec: projects/relay-app/2026-05-09-activity-thread-plan.md § ActivityThread component
 *       projects/relay-app/2026-05-09-relay-workflow-design.md § Phase 1b
 *
 * Behavior (V1):
 * - Server component. First 50 events rendered SSR, ordered newest-first.
 * - Composer (CommentComposer) sits below.
 * - Pagination ("Load older") in Phase 5.
 *
 * Phase: shell now. Phase 1b validates the render path with manually-inserted
 *        events. Phase 2 wires the composer.
 *
 * Schema dep: ActivityEvent (Rails-owned). For now, accepts pre-loaded
 *             ActivityEventView[] from caller so this is testable in isolation.
 */
import { CommentComposer } from './comment-composer'
import { EventRenderer } from './event-renderer'
import type { ActivityEventView } from './_placeholder-types'

export interface ActivityThreadProps {
  clientId: string
  /** Pre-loaded events. Empty array renders the empty state. */
  events: ActivityEventView[]
  /** Members of the current org for @mention autocomplete. */
  mentionTargets?: { id: string; handle: string; name: string }[]
  /** Hide the composer (e.g., on inbox preview). */
  hideComposer?: boolean
}

export function ActivityThread({
  clientId,
  events,
  mentionTargets = [],
  hideComposer = false,
}: ActivityThreadProps) {
  return (
    <div className="flex flex-col gap-3" data-component="activity-thread">
      {events.length === 0 ? (
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
      )}

      {/* TODO Phase 5: <button>Load older</button> with pagination */}

      {!hideComposer && (
        <CommentComposer clientId={clientId} mentionTargets={mentionTargets} />
      )}
    </div>
  )
}
