/**
 * Whether a content run should be hidden from the client page's run list
 * because its generated content no longer exists to view.
 *
 * A run is hidden only when it is `complete` AND has zero posts. `_count.posts`
 * counts every post row that still exists (live OR archived), dropping to zero
 * only when the posts have been permanently purged — so this hides:
 *   - runs whose batch was purged (content gone for good), and
 *   - completed runs that generated nothing,
 * while keeping runs whose batch was merely archived (posts still exist, the
 * run resolves to the archived batch).
 *
 * Non-complete runs are never hidden: `failed` runs explain a failure and offer
 * a re-run, and `queued` / `running` runs legitimately have no posts yet.
 */
export function isEmptyCompletedRun(run: {
  status: string
  _count: { posts: number }
}): boolean {
  return run.status === 'complete' && run._count.posts === 0
}
