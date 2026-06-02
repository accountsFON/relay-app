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
}

/**
 * Mobile only floating chat button that toggles the client thread in a
 * bottom sheet. Trigger is fixed bottom right and hidden at lg+, where
 * the thread sits in the desktop right rail.
 */
export function MobileThreadFab({
  clientId,
  events,
  mentionTargets = [],
  hideComposer = false,
  className,
}: MobileThreadFabProps) {
  const [open, setOpen] = useState(false)

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger
        data-slot="mobile-thread-fab-trigger"
        aria-label="Open client thread"
        className={cn(
          'fixed bottom-4 right-4 z-40 lg:hidden',
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
            'fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col rounded-t-2xl border border-border bg-white text-popover-foreground shadow-lg outline-none',
            'data-open:animate-in data-open:slide-in-from-bottom-full',
            'data-closed:animate-out data-closed:slide-out-to-bottom-full',
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
          <div className="flex-1 overflow-y-auto p-4">
            <ActivityThread
              clientId={clientId}
              events={events}
              mentionTargets={mentionTargets}
              hideComposer={hideComposer}
              composerPosition="top"
            />
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
