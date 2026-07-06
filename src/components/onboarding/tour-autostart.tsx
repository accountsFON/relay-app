'use client'

import { useEffect } from 'react'
import { useTourController } from '@/components/onboarding/tour-provider'

/**
 * Fires a specific tour on mount if it has not been seen. Rendered where the
 * tour should start (e.g. the designer workspace, which only renders after the
 * onboarding gate is cleared), so the tour sequences after the gate without
 * relying on the route auto-fire (which does not re-run on same-route
 * revalidation). Renders nothing.
 */
export function TourAutostart({ tourId }: { tourId: string }) {
  const { startIfUnseen } = useTourController()
  useEffect(() => {
    startIfUnseen(tourId)
  }, [startIfUnseen, tourId])
  return null
}
