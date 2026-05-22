import { Asterisk } from './asterisk'
import { Starburst } from './starburst'
import { Blob } from './blob'

export type HeroDecorationColors = {
  blob?: string
  asterisk?: string
  starburst?: string
  dot?: string
}

type HeroDecorationProps = {
  className?: string
  /** Scale factor applied to the entire cluster. Defaults to 1. */
  size?: number
  /**
   * Per-shape color overrides. Pass CSS color strings (`var(--color-yellow-500)`,
   * hex, `currentColor`, etc.). Defaults match the brand kit hero band:
   * coral blob, yellow asterisk, blue starburst, blue dot.
   */
  colors?: HeroDecorationColors
}

const DEFAULT_COLORS: Required<HeroDecorationColors> = {
  blob: 'var(--color-coral-500)',
  asterisk: 'var(--color-yellow-500)',
  starburst: 'var(--color-blue-500)',
  dot: 'var(--color-blue-500)',
}

/**
 * Cluster of decorative shapes used on the hero band and (via overrides) any
 * other surface that wants the brand decoration vocabulary. The shapes scale
 * together via the `size` prop and pull color from CSS vars by default so the
 * palette stays in sync with `globals.css`.
 */
export function HeroDecoration({
  className,
  size = 1,
  colors,
}: HeroDecorationProps) {
  const c = { ...DEFAULT_COLORS, ...colors }
  return (
    <div
      className={className ?? 'relative w-[160px] h-[100px]'}
      style={size === 1 ? undefined : { transform: `scale(${size})`, transformOrigin: 'top left' }}
    >
      <Blob className="absolute right-0 top-0" color={c.blob} size={90} />
      <Asterisk className="absolute left-0 top-2" color={c.asterisk} size={44} />
      <Starburst className="absolute left-16 top-10" color={c.starburst} size={28} points={12} />
      <div
        className="absolute left-20 top-2 w-2 h-2 rounded-full"
        style={{ backgroundColor: c.dot }}
        aria-hidden="true"
      />
    </div>
  )
}
