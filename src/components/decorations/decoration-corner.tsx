import { Asterisk } from './asterisk'
import { Sparkle } from './sparkle'

/**
 * Subtle brand decoration anchored to the bottom-right of every signed-in
 * surface. Mounted once in AppShell. Pointer events disabled so it never
 * intercepts UI; hidden on mobile to keep the small viewport uncluttered.
 *
 * Three small shapes pulled from the brand kit: an asterisk (logo motif),
 * a sparkle (small accent), and a faint yellow dot. Keeps the corner alive
 * without competing with content.
 */
export function DecorationCorner() {
  return (
    <div
      className="pointer-events-none fixed bottom-6 right-6 z-0 hidden md:block"
      aria-hidden="true"
    >
      <div className="relative h-16 w-16 opacity-70">
        <Asterisk
          size={48}
          color="var(--color-yellow-500)"
          className="absolute right-0 bottom-0"
        />
        <Sparkle
          size={14}
          color="var(--color-coral-500)"
          className="absolute right-12 bottom-9"
        />
        <span
          className="absolute right-2 bottom-12 block h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: 'var(--color-blue-500)' }}
        />
      </div>
    </div>
  )
}
