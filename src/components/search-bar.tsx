'use client'

import { useState, useEffect, useRef, type FormEvent, type KeyboardEvent } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Global search bar for the app header.
 * - Desktop: always-visible input. Pressing `/` (when not typing) focuses it.
 * - Mobile: collapsed icon trigger that opens the input on click.
 * - Submit pushes to /search?q=...
 */
export function SearchBar() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const seedFromUrl = pathname === '/search' ? params.get('q') ?? '' : ''
  const [value, setValue] = useState(seedFromUrl)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Keep the input in sync if the URL changes externally.
  useEffect(() => {
    setValue(pathname === '/search' ? params.get('q') ?? '' : '')
  }, [pathname, params])

  // `/` keyboard shortcut to focus.
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key !== '/') return
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return
      }
      e.preventDefault()
      inputRef.current?.focus()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const q = value.trim()
    if (!q) return
    router.push(`/search?q=${encodeURIComponent(q)}`)
  }

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setValue('')
      inputRef.current?.blur()
    }
  }

  return (
    <form
      role="search"
      onSubmit={handleSubmit}
      className={cn(
        'group relative flex w-full max-w-md items-center gap-2',
        'h-10 rounded-full border border-border bg-white px-4',
        'focus-within:border-border-strong focus-within:ring-2 focus-within:ring-blue-100',
      )}
    >
      <Search className="h-4 w-4 shrink-0 text-neutral-500" />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKey}
        placeholder="Search relays, clients, steps..."
        aria-label="Search clients, posts, runs, and comments"
        className="flex-1 bg-transparent text-sm text-foreground placeholder:text-neutral-500 outline-none"
      />
      <kbd
        aria-hidden="true"
        className="pointer-events-none hidden rounded border border-border bg-neutral-50 px-1.5 py-0.5 font-mono text-[10px] text-neutral-500 md:inline-flex"
      >
        /
      </kbd>
    </form>
  )
}
