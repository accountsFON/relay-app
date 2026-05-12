'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { listInFlightRuns, type InFlightRun } from '@/server/actions/in-flight-runs'

type InFlightContextValue = {
  runs: InFlightRun[]
  isLoading: boolean
  error: Error | null
  refresh: () => Promise<void>
}

const InFlightContext = createContext<InFlightContextValue | null>(null)

export function InFlightRunsProvider({ children }: { children: React.ReactNode }) {
  const [runs, setRuns] = useState<InFlightRun[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const refresh = useCallback(async () => {
    setIsLoading(true)
    try {
      setRuns(await listInFlightRuns())
      setError(null)
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err))
      setError(e)
      console.error('listInFlightRuns failed:', e)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Initial fetch on mount.
  useEffect(() => {
    refresh()
  }, [refresh])

  // Polling: 2s when runs.length > 0, idle when 0.
  useEffect(() => {
    if (runs.length === 0) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }
    // guard against React 19 strict-mode double-mount
    if (intervalRef.current) return
    intervalRef.current = setInterval(refresh, 2000)
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [runs.length, refresh])

  // Tab refocus catch-up.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        refresh()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [refresh])

  return (
    <InFlightContext.Provider value={{ runs, isLoading, error, refresh }}>
      {children}
    </InFlightContext.Provider>
  )
}

export function useInFlightRuns(): InFlightContextValue {
  const ctx = useContext(InFlightContext)
  if (!ctx) {
    throw new Error('useInFlightRuns must be used inside InFlightRunsProvider')
  }
  return ctx
}
