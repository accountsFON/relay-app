type SparkleProps = { size?: number; color?: string; className?: string }

export function Sparkle({ size = 16, color = 'currentColor', className }: SparkleProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={className} aria-hidden="true">
      <path d="M8 0L9.5 6.5L16 8L9.5 9.5L8 16L6.5 9.5L0 8L6.5 6.5Z" fill={color} />
    </svg>
  )
}
