import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { SubmitCombo } from '@/components/ui/submit-combo'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/**
 * SubmitCombo renders the platform-appropriate keyboard combo for submitting a
 * comment: the ⌘ symbol on macOS, "Ctrl" elsewhere. It corrects to the real
 * platform on mount (after a Mac-symbol default so SSR hydration matches).
 */
describe('SubmitCombo', () => {
  function stubPlatform(platform: string, uaDataPlatform?: string) {
    vi.stubGlobal('navigator', {
      platform,
      ...(uaDataPlatform !== undefined
        ? { userAgentData: { platform: uaDataPlatform } }
        : {}),
    })
  }

  it('renders the ⌘ combo on macOS', () => {
    stubPlatform('MacIntel')
    render(<SubmitCombo />)
    expect(screen.getByText('⌘↵')).toBeInTheDocument()
  })

  it('renders the Ctrl combo on Windows', () => {
    stubPlatform('Win32')
    render(<SubmitCombo />)
    expect(screen.getByText('Ctrl+↵')).toBeInTheDocument()
  })

  it('renders the Ctrl combo on Linux', () => {
    stubPlatform('Linux x86_64')
    render(<SubmitCombo />)
    expect(screen.getByText('Ctrl+↵')).toBeInTheDocument()
  })

  it('prefers userAgentData.platform over the deprecated navigator.platform', () => {
    // Chromium reports the real OS in userAgentData even when navigator.platform
    // is a legacy value.
    stubPlatform('MacIntel', 'Windows')
    render(<SubmitCombo />)
    expect(screen.getByText('Ctrl+↵')).toBeInTheDocument()
  })
})
