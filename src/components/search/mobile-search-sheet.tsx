'use client'

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { useRouter } from 'next/navigation'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Mobile search affordance.
 *
 * Renders a search icon button in the mobile header. Tapping it opens a
 * panel that slides up from the bottom of the viewport, auto-focuses the
 * input, and submits to /search?q=... on Enter, matching the desktop
 * SearchBar behavior.
 *
 * Visible on small breakpoints only; hidden at md+ where the desktop
 * SearchBar is in use.
 */
export function MobileSearchSheet({ className }: { className?: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Auto-focus the input when the sheet opens. base-ui restores focus on
  // close, so we only need to push focus on open.
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => {
      inputRef.current?.focus()
    }, 30)
    return () => clearTimeout(t)
  }, [open])

  // Reset the query whenever the sheet closes so reopening is a fresh slate.
  useEffect(() => {
    if (!open) setValue('')
  }, [open])

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const q = value.trim()
    if (!q) return
    setOpen(false)
    router.push(`/search?q=${encodeURIComponent(q)}`)
  }

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger
        data-slot="mobile-search-trigger"
        className={cn(
          'rounded-full bg-card p-1.5 text-muted-foreground hover:text-foreground hover:bg-neutral-200',
          className,
        )}
        aria-label="Search"
      >
        <Search className="h-4 w-4" />
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          data-slot="mobile-search-overlay"
          className={cn(
            'fixed inset-0 z-50 bg-black/30 supports-backdrop-filter:backdrop-blur-xs',
            'data-open:animate-in data-open:fade-in-0',
            'data-closed:animate-out data-closed:fade-out-0',
          )}
        />
        <DialogPrimitive.Popup
          data-slot="mobile-search-content"
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col gap-4 rounded-t-2xl border border-border bg-white p-4 text-sm text-popover-foreground shadow-lg outline-none',
            'data-open:animate-in data-open:slide-in-from-bottom-full',
            'data-closed:animate-out data-closed:slide-out-to-bottom-full',
          )}
        >
          <div className="flex items-center justify-between">
            <DialogPrimitive.Title className="font-heading text-base font-medium">
              Search
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              data-slot="mobile-search-close"
              className="rounded-full p-1.5 text-muted-foreground hover:bg-neutral-200 hover:text-foreground"
              aria-label="Close search"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Description className="sr-only">
            Search clients, posts, runs, and comments.
          </DialogPrimitive.Description>

          <form
            role="search"
            onSubmit={handleSubmit}
            className={cn(
              'flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2',
              'focus-within:ring-3 focus-within:ring-ring/30',
            )}
          >
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              type="search"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Search clients, posts, runs..."
              aria-label="Search clients, posts, runs, and comments"
              className="w-full bg-transparent text-[14px] text-foreground placeholder:text-muted-foreground outline-none"
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </form>

          <p className="text-[12px] text-muted-foreground">
            Hit enter to see all matches.
          </p>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
