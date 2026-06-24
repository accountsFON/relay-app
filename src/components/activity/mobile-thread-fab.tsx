'use client'

import { useState } from 'react'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { MessageCircle, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ActivityThread } from './activity-thread'
import type { ActivityEventView } from './types'
import type { MentionTarget } from '@/lib/mentions'

interface MobileThreadFabProps {
  clientId: string
  events: ActivityEventView[]
  mentionTargets?: MentionTarget[]
  hideComposer?: boolean
  className?: string
  /**
   * Show the floating button at lg+ too. Default false: on pages with a
   * desktop right rail (batch + client detail) the FAB stays mobile only.
   * The review session detail page has no desktop rail, so it sets this true
   * to make the chat a toggle popup on every screen size.
   */
  showOnDesktop?: boolean
}

/**
 * Floating chat button that toggles the client thread in a bottom sheet.
 * By default it's mobile only (hidden at lg+, where the thread sits in a
 * desktop right rail). Set `showOnDesktop` on surfaces with no desktop rail
 * so the chat is a toggle popup at every screen size.
 */
export function MobileThreadFab({
  clientId,
  events,
  mentionTargets = [],
  hideComposer = false,
  className,
  showOnDesktop = false,
}: MobileThreadFabProps) {
  const [open, setOpen] = useState(false)

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger
        data-slot="mobile-thread-fab-trigger"
        aria-label="Open client thread"
        className={cn(
          'fixed bottom-[26px] right-[26px] z-40',
          !showOnDesktop && 'lg:hidden',
          'flex h-12 w-12 items-center justify-center rounded-full',
          'bg-foreground text-background shadow-lg',
          'hover:bg-foreground/90 active:bg-foreground/80',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          className,
        )}
      >
        <MessageCircle className="h-5 w-5" />
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          data-slot="mobile-thread-fab-overlay"
          className={cn(
            'fixed inset-0 z-50 bg-black/30 supports-backdrop-filter:backdrop-blur-xs',
            'data-open:animate-in data-open:fade-in-0',
            'data-closed:animate-out data-closed:fade-out-0',
          )}
        />
        <DialogPrimitive.Popup
          data-slot="mobile-thread-fab-content"
          className={cn(
            // Definite height (not just max-h): the inner ActivityThread is
            // h-full, and a max-height alone leaves the height chain
            // unresolved, so the message list grows to its natural length and
            // shoves the pinned composer below the sheet. A definite h-[85dvh]
            // + overflow-hidden bounds the list so it scrolls internally and
            // the composer stays visible. pb-[safe-area] clears the phone home
            // indicator.
            'fixed inset-x-0 bottom-0 z-50 flex h-[85dvh] flex-col overflow-hidden rounded-t-2xl border border-border bg-white pb-[env(safe-area-inset-bottom)] text-popover-foreground shadow-lg outline-none',
            // Desktop (lg+): a right-side drawer (full height, pinned to the
            // right edge) instead of the mobile bottom sheet.
            'lg:inset-x-auto lg:inset-y-0 lg:left-auto lg:right-0 lg:h-dvh lg:w-[420px] lg:max-w-[92vw] lg:rounded-none lg:rounded-l-2xl lg:border-r-0 lg:pb-0',
            // Animations: slide up from the bottom on mobile, in from the right
            // on desktop (reset the Y translate at lg so it's a clean X slide).
            'data-open:animate-in data-open:slide-in-from-bottom-full',
            'data-closed:animate-out data-closed:slide-out-to-bottom-full',
            'lg:data-open:slide-in-from-right-full lg:data-closed:slide-out-to-right-full',
            'lg:data-open:[--tw-enter-translate-y:0px] lg:data-closed:[--tw-exit-translate-y:0px]',
          )}
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <DialogPrimitive.Title className="font-heading text-base font-medium">
              Client thread
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              data-slot="mobile-thread-fab-close"
              aria-label="Close client thread"
              className="rounded-full p-1.5 text-muted-foreground hover:bg-neutral-200 hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Description className="sr-only">
            Comments and activity for this client.
          </DialogPrimitive.Description>
          <div className="min-h-0 flex-1 p-4">
            <ActivityThread
              clientId={clientId}
              events={events}
              mentionTargets={mentionTargets}
              hideComposer={hideComposer}
            />
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
