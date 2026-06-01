'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Switch } from '@/components/ui/switch';

interface Props {
  /** Optional count to display next to the label */
  countArchived?: number;
}

/**
 * ShowArchivedToggle: toggles `?archived=1` in the URL.
 *
 * URL-based state because:
 * - Survives refresh / shareable links
 * - Server components can read the param to decide whether to include archived
 *   entities in queries (e.g. via `withArchived()`)
 * - No client-side state to sync
 */
export function ShowArchivedToggle({ countArchived }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const checked = sp.get('archived') === '1';

  function onCheckedChange(next: boolean) {
    const params = new URLSearchParams(sp.toString());
    if (next) params.set('archived', '1');
    else params.delete('archived');
    const qs = params.toString();
    // scroll:false keeps the user's scroll position when only the filter
    // changes. Without it Next.js scrolls to top on every URL update.
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label="Show archived" />
      <span>Show archived</span>
      {typeof countArchived === 'number' && countArchived > 0 && (
        <span className="text-xs text-muted-foreground/80">({countArchived})</span>
      )}
    </label>
  );
}
