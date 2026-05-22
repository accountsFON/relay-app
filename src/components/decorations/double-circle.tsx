type DoubleCircleProps = { size?: number; color?: string; className?: string }

export function DoubleCircle({ size = 32, color = 'currentColor', className }: DoubleCircleProps) {
  return (
    <svg width={size} height={size * 0.6} viewBox="0 0 32 20" className={className} aria-hidden="true">
      <circle cx="10" cy="10" r="8" fill={color} />
      <circle cx="22" cy="10" r="8" fill={color} />
    </svg>
  )
}
