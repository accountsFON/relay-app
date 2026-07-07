import Link from 'next/link'
import { ArrowRight, CheckCircle2, Clock, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { NextAction, NextActionButton } from '@/lib/relay-next-action'

interface Props {
  action: NextAction
  /**
   * Batch id used as the `data-action-board` anchor target so a notification
   * deep link (`#action-{batchId}`) scrolls here (P1 #19). Omitted -> no anchor.
   */
  anchorId?: string
}

/** A href that points off-domain (NectrCRM, client content folder). */
function isExternal(href: string): boolean {
  return href.startsWith('http://') || href.startsWith('https://')
}

const TONE_CARD: Record<NextAction['tone'], string> = {
  action: 'border-border bg-card',
  waiting: 'border-border bg-neutral-100/40',
  done: 'border-emerald-500/30 bg-emerald-500/5',
}

function ActionLink({
  button,
  variant,
}: {
  button: NextActionButton
  variant: 'default' | 'secondary'
}) {
  const external = isExternal(button.href)
  return (
    <Button
      variant={variant}
      size="sm"
      render={
        <Link
          href={button.href}
          {...(external
            ? { target: '_blank', rel: 'noopener noreferrer' }
            : {})}
        />
      }
    >
      <span>{button.label}</span>
      {external ? (
        <ExternalLink className="opacity-60" />
      ) : (
        <ArrowRight className="opacity-60" />
      )}
    </Button>
  )
}

/**
 * NextActionBoard: the role-aware "what to do next" banner on the relay detail
 * page. Renders a pure NextAction (from `nextActionForRelay`) as a tone-colored
 * card with the title, optional guidance line, and up to two off-page buttons.
 *
 * Internal hrefs render as a plain Next <Link>; external hrefs (NectrCRM, the
 * client content folder) open in a new tab. `tone:'done'` carries no button;
 * `tone:'waiting'` usually carries none, but may expose an off-page button
 * (e.g. the AM watching design revisions can open the internal review).
 */
export function NextActionBoard({ action, anchorId }: Props) {
  return (
    <div
      data-testid="next-action-board"
      data-action-board={anchorId}
      data-tone={action.tone}
      className={cn(
        'scroll-mt-20 rounded-lg border',
        TONE_CARD[action.tone],
      )}
    >
      <div className="flex items-start gap-3 p-4">
        {action.tone === 'done' ? (
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
        ) : action.tone === 'waiting' ? (
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        ) : (
          <ArrowRight className="mt-0.5 h-5 w-5 shrink-0 text-foreground" />
        )}
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <h2 className="text-[15px] font-semibold text-foreground">
              {action.title}
            </h2>
            {action.detail && (
              <p className="mt-1 text-[13px] text-muted-foreground">
                {action.detail}
              </p>
            )}
          </div>
          {(action.button || action.secondaryButton) && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {action.button && (
                <ActionLink button={action.button} variant="default" />
              )}
              {action.secondaryButton && (
                <ActionLink
                  button={action.secondaryButton}
                  variant="secondary"
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
