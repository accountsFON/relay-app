'use client'

import { useSyncExternalStore } from 'react'

type NavigatorUAData = Navigator & {
  userAgentData?: { platform?: string }
}

function detectIsMac(): boolean {
  if (typeof navigator === 'undefined') return true
  const nav = navigator as NavigatorUAData
  const platform = nav.userAgentData?.platform || nav.platform || ''
  return /mac/i.test(platform)
}

// Platform never changes during a session, so there is nothing to subscribe to.
function subscribe(): () => void {
  return () => {}
}

/**
 * Inline, platform-aware keyboard combo for "submit a comment": renders `⌘↵`
 * on macOS and `Ctrl+↵` on Windows/Linux. Meant to sit inside a hint line,
 * e.g. `<p>… <SubmitCombo /> to send</p>`.
 *
 * Uses `useSyncExternalStore` so the server + initial hydration render the Mac
 * default (`getServerSnapshot` → true) and the client swaps to the real
 * platform without a hydration mismatch. Mac users never see a change; a
 * Windows/Linux user sees `Ctrl+↵`.
 */
export function SubmitCombo() {
  const isMac = useSyncExternalStore(subscribe, detectIsMac, () => true)
  return <>{isMac ? '⌘↵' : 'Ctrl+↵'}</>
}
