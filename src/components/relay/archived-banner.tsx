'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { SimpleTooltip } from '@/components/relay/relay-tooltips';

interface Props {
  entityType: 'Client' | 'Relay' | 'Post' | 'Run';
  archivedAt: Date;
  archivedBy?: string | null;
  /** Server action wrapper supplied by the caller — knows which entity to restore */
  onRestore: () => Promise<void>;
}

/**
 * ArchivedBanner — sticky amber strip shown at the top of a read-only archived
 * entity view.
 *
 * The `onRestore` callback is supplied by the caller (the page component), which
 * knows which entity-specific server action to invoke. This component only handles
 * the UI and pending state.
 */
export function ArchivedBanner({ entityType, archivedAt, archivedBy, onRestore }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleRestore() {
    startTransition(async () => {
      await onRestore();
      router.refresh();
    });
  }

  return (
    <div className="sticky top-0 z-20 bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between">
      <div className="text-sm text-amber-900">
        This {entityType.toLowerCase()} was archived on{' '}
        <time dateTime={archivedAt.toISOString()}>{archivedAt.toLocaleDateString()}</time>
        {archivedBy && <> by {archivedBy}</>}. Read-only view.
      </div>
      <SimpleTooltip content={`Restore this ${entityType.toLowerCase()} to active.`}>
        <Button variant="outline" size="sm" onClick={handleRestore} disabled={pending}>
          {pending ? 'Restoring…' : 'Restore'}
        </Button>
      </SimpleTooltip>
    </div>
  );
}
