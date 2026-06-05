import type { ReactNode } from 'react'
import { AppChrome } from '@/components/app-chrome'

export default async function AppLayout({ children }: { children: ReactNode }) {
  return <AppChrome gateFirstTimers>{children}</AppChrome>
}
