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
        'group relative flex items-center',
        'h-8 w-56 rounded-full border border-border bg-card pl-3 pr-2',
        'focus-within:ring-3 focus-within:ring-ring/30',
      )}
    >
      <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKey}
        placeholder="Search…"
        aria-label="Search clients, posts, runs, and comments"
        className="w-full bg-transparent pl-2 pr-2 text-[13px] text-foreground placeholder:text-muted-foreground outline-none"
      />
      <kbd
        aria-hidden="true"
        className="pointer-events-none ml-auto hidden rounded border border-border px-1 text-[10px] text-muted-foreground md:inline-flex"
      >
        /
      </kbd>
    </form>
  )
}
