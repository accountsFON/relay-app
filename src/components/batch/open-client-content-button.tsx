import Link from 'next/link'
import { RelayStep } from '@prisma/client'
import { FolderOpen, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  currentStep: RelayStep
  assetsFolderUrl: string | null | undefined
}

/**
 * OpenClientContentButton: chip on the batch detail action row that opens
 * the client's content folder (Google Drive) in a new tab.
 *
 * Visibility gate, Phase 3 item 18:
 *   - Renders only when `currentStep` is `in_design` or `design_revisions`.
 *     These are the steps where a designer is the natural holder; the chip
 *     is harmless on other steps but the step gate keeps the row tidy.
 *   - Hides entirely when `assetsFolderUrl` is null or empty. The folder is
 *     optional per client; a dead button is worse than a missing one.
 *
 * Matches the visual contract of the sibling "Open in Canva" chip.
 */
export function OpenClientContentButton({ currentStep, assetsFolderUrl }: Props) {
  if (!assetsFolderUrl) return null
  if (
    currentStep !== RelayStep.in_design &&
    currentStep !== RelayStep.design_revisions
  ) {
    return null
  }
  return (
    <Button
      variant="secondary"
      size="sm"
      render={
        <Link
          href={assetsFolderUrl}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="open-client-content-link"
        />
      }
    >
      <FolderOpen className="text-muted-foreground" />
      <span>Open client content</span>
      <ExternalLink className="opacity-60" />
    </Button>
  )
}
