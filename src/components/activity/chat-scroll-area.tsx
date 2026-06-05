'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface ChatScrollAreaProps {
  /**
   * Changes when the newest message changes (e.g. the newest event id). The
   * area scrolls to the bottom on mount and whenever this value changes, so a
   * genuinely new message (initial load, or one brought in by router.refresh()
   * after a send) pins the view to the newest. A plain re-render that does not
   * change this value does not force-scroll.
   */
  scrollKey: string | number
  className?: string
  children: ReactNode
}

/**
 * Scrollable message region for the chat (ActivityThread). Owns the
 * scroll-to-newest behavior so the composer can sit pinned below it. v1 has no
 * "only if the user is near the bottom" smartness; it force-scrolls only when
 * scrollKey changes.
 */
export function ChatScrollArea({ scrollKey, className, children }: ChatScrollAreaProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [scrollKey])

  return (
    <div ref={ref} data-component="chat-scroll-area" className={cn('overflow-y-auto', className)}>
      {children}
    </div>
  )
}
