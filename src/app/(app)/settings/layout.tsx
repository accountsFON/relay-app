import type { ReactNode } from 'react'
import { SettingsTabs } from '@/components/settings/settings-tabs'

export default function SettingsLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <div>
      <SettingsTabs />
      {children}
    </div>
  )
}
