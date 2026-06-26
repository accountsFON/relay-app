/**
 * Phase 3 item 18: chip on the batch detail action row that opens the
 * client's content folder. Visibility is gated on the design steps and on
 * the presence of a per client assets folder URL.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RelayStep } from '@prisma/client'
import { OpenClientContentButton } from '@/components/batch/open-client-content-button'

const FOLDER_URL = 'https://drive.google.com/drive/folders/abc123'

describe('OpenClientContentButton', () => {
  it('renders on in_design with a working external link', () => {
    render(
      <OpenClientContentButton
        currentStep={RelayStep.in_design}
        assetsFolderUrl={FOLDER_URL}
      />,
    )
    const link = screen.getByRole('link', { name: /open client content/i })
    expect(link).toHaveAttribute('href', FOLDER_URL)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('renders on am_review_design (Design Review, incl. the revision sub-state)', () => {
    render(
      <OpenClientContentButton
        currentStep={RelayStep.am_review_design}
        assetsFolderUrl={FOLDER_URL}
      />,
    )
    expect(
      screen.getByRole('link', { name: /open client content/i }),
    ).toBeInTheDocument()
  })

  it('does not render on steps outside the design phase', () => {
    const offSteps: RelayStep[] = [
      RelayStep.copy,
      RelayStep.designs_completed,
      RelayStep.design_revisions,
      RelayStep.sent_to_client,
      RelayStep.completed,
    ]
    for (const step of offSteps) {
      const { unmount } = render(
        <OpenClientContentButton
          currentStep={step}
          assetsFolderUrl={FOLDER_URL}
        />,
      )
      expect(
        screen.queryByRole('link', { name: /open client content/i }),
      ).not.toBeInTheDocument()
      unmount()
    }
  })

  it('does not render when assetsFolderUrl is null, even on in_design', () => {
    render(
      <OpenClientContentButton
        currentStep={RelayStep.in_design}
        assetsFolderUrl={null}
      />,
    )
    expect(
      screen.queryByRole('link', { name: /open client content/i }),
    ).not.toBeInTheDocument()
  })

  it('does not render when assetsFolderUrl is an empty string', () => {
    render(
      <OpenClientContentButton
        currentStep={RelayStep.in_design}
        assetsFolderUrl=""
      />,
    )
    expect(
      screen.queryByRole('link', { name: /open client content/i }),
    ).not.toBeInTheDocument()
  })
})
