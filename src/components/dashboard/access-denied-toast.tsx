'use client'
import { useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'

/** Fires a toast once when the dashboard is reached via redirectAccessDenied
 *  (`?denied=1`), then strips the param so a refresh does not re-fire it. */
export function AccessDeniedToast() {
  const router = useRouter()
  const params = useSearchParams()
  const fired = useRef(false)
  useEffect(() => {
    if (params.get('denied') === '1' && !fired.current) {
      fired.current = true
      toast.error('You do not have access to that.')
      router.replace('/dashboard')
    }
  }, [params, router])
  return null
}
