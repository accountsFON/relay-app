import { Skeleton } from '@/components/ui/skeleton'

/**
 * Generic loading skeleton for any page rendered inside the (app) shell.
 * Next.js automatically swaps this in while a server component is being
 * rendered. More specific loading.tsx files can be added at child route
 * segments (e.g. clients/[id]/loading.tsx) when the page-specific shape
 * gives a better feel; this generic skeleton is the safety net.
 *
 * Shape: page title + subtitle + three content blocks. Generic enough to
 * not feel wrong on any page, specific enough that the user sees the
 * page is loading rather than the whole shell being blank.
 */
export default function AppLoading() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-8 space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
    </div>
  )
}
