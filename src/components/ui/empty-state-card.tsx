/**
 * EmptyStateCard — pastel tinted card with a centered decoration shape and
 * a one line label. Use on kanban empty columns, /inbox zero state, /clients
 * zero state, /search no results, /library if empty. Phase 2.5D.4.
 *
 * Spec: projects/relay-app/2026-05-22-brand-implementation-plan.md
 *       § Task 2.5D.4.
 *
 * Tint drives the wash color and the default fill of the shape. Pass
 * `shapeColor` separately if you want the shape to read in a different hue
 * than the wash (rarely needed; default is to match).
 *
 * Maps are kept static so Tailwind's content scan picks the class names up
 * at build time. No dynamic `bg-${tint}-100` lookups.
 */
import { cn } from '@/lib/utils'
import { Asterisk } from '@/components/decorations/asterisk'
import { Starburst } from '@/components/decorations/starburst'
import { Blob } from '@/components/decorations/blob'

type Tint = 'blue' | 'yellow' | 'coral'
type Shape = 'asterisk' | 'starburst' | 'blob'

const tintBgMap: Record<Tint, string> = {
  blue: 'bg-blue-100',
  yellow: 'bg-yellow-100',
  coral: 'bg-coral-100',
}

const tintFillMap: Record<Tint, string> = {
  blue: 'var(--color-blue-500)',
  yellow: 'var(--color-yellow-500)',
  coral: 'var(--color-coral-500)',
}

const tintDotMap: Record<Tint, string> = {
  blue: 'bg-blue-500',
  yellow: 'bg-yellow-500',
  coral: 'bg-coral-500',
}

const shapeComponentMap: Record<Shape, typeof Asterisk> = {
  asterisk: Asterisk,
  starburst: Starburst,
  blob: Blob,
}

export type EmptyStateCardProps = {
  tint: Tint
  shape: Shape
  shapeColor?: Tint
  label: string
  className?: string
}

export function EmptyStateCard({
  tint,
  shape,
  shapeColor,
  label,
  className,
}: EmptyStateCardProps) {
  const ShapeComp = shapeComponentMap[shape]
  const resolvedShapeColor = shapeColor ?? tint
  const fillColor = tintFillMap[resolvedShapeColor]
  return (
    <div
      className={cn(
        'rounded-xl p-8 flex flex-col items-center justify-center text-center',
        tintBgMap[tint],
        className,
      )}
    >
      <div className="relative mb-2">
        <ShapeComp size={48} color={fillColor} />
        <span
          className={cn(
            'absolute -right-2 top-1 w-2 h-2 rounded-full',
            tintDotMap[resolvedShapeColor],
          )}
        />
      </div>
      <span className="text-xs text-neutral-500">{label}</span>
    </div>
  )
}
