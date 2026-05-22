import Link from 'next/link'
import { Link2, FolderOpen, ExternalLink, Palette } from 'lucide-react'
import { SimpleTooltip } from '@/components/relay/relay-tooltips'
import { resolveCanvaUrl } from '@/lib/canva'

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function ClientQuickAccess({
  urls,
  assetsFolderUrl,
  canvaUrl,
}: {
  urls: string[]
  assetsFolderUrl: string | null | undefined
  canvaUrl?: string | null | undefined
}) {
  // Canva chip always renders via the resolveCanvaUrl fallback, so the
  // card always has at least one affordance and is never null.
  const canvaHref = resolveCanvaUrl(canvaUrl)

  return (
    <section
      aria-label="Client quick access"
      className="rounded-2xl bg-card p-4 sm:p-5 sticky top-0 z-20 backdrop-blur supports-[backdrop-filter]:bg-card/95"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
        {urls.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground shrink-0">
              Links
            </span>
            {urls.map((url) => (
              <Link
                key={url}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full bg-cream-warm px-3 py-1 text-[12px] text-foreground hover:bg-cream-80 transition-colors max-w-full"
              >
                <Link2 className="size-3 shrink-0 text-muted-foreground" />
                <span className="truncate">{hostnameOf(url)}</span>
              </Link>
            ))}
          </div>
        )}

        {assetsFolderUrl && (
          <div className="flex items-center gap-2 sm:ml-auto sm:pl-5 sm:border-l sm:border-cream-80 min-w-0">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground shrink-0">
              Assets
            </span>
            <Link
              href={assetsFolderUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-cream-warm px-3 py-1 text-[12px] text-foreground hover:bg-cream-80 transition-colors max-w-full"
            >
              <FolderOpen className="size-3 shrink-0 text-muted-foreground" />
              <span className="truncate">Open folder</span>
              <ExternalLink className="size-3 shrink-0 opacity-60" />
            </Link>
          </div>
        )}

        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground shrink-0">
            Canva
          </span>
          <SimpleTooltip
            content={
              canvaUrl
                ? "Open the client's Canva folder in a new tab"
                : 'No per-client Canva folder set, opens the shared agency folder. Set a per-client URL on the profile.'
            }
          >
            <Link
              href={canvaHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-cream-warm px-3 py-1 text-[12px] text-foreground hover:bg-cream-80 transition-colors max-w-full"
            >
              <Palette className="size-3 shrink-0 text-muted-foreground" />
              <span className="truncate">Open in Canva</span>
              <ExternalLink className="size-3 shrink-0 opacity-60" />
            </Link>
          </SimpleTooltip>
        </div>
      </div>
    </section>
  )
}
