type HalfMoonProps = { size?: number; color?: string; className?: string }

export function HalfMoon({ size = 32, color = 'currentColor', className }: HalfMoonProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path d="M16 2 A 14 14 0 0 1 16 30 Z" fill={color} />
    </svg>
  )
}
