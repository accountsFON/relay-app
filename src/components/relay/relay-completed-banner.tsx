/**
 * Sticky strip shown at the top of a completed (locked) relay. Mirrors
 * ArchivedBanner's cream/ink styling but has no Restore action — a completed
 * relay is permanently locked (see 2026-07-01-lock-completed-relay-design.md).
 */
export function RelayCompletedBanner({ completedAt }: { completedAt: Date | null }) {
  return (
    <div className="sticky top-0 z-20 bg-neutral-100 border-b border-neutral-900/20 px-4 py-2 flex items-center justify-between">
      <div className="text-sm text-foreground">
        This relay is completed
        {completedAt && (
          <>
            {' '}on{' '}
            <time dateTime={completedAt.toISOString()}>{completedAt.toLocaleDateString()}</time>
          </>
        )}
        {' '}and locked. Posts can no longer be edited.
      </div>
    </div>
  );
}
