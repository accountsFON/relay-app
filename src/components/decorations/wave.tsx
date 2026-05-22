type WaveProps = { size?: number; color?: string; className?: string }

export function Wave({ size = 48, color = 'currentColor', className }: WaveProps) {
  return (
    <svg width={size} height={size * 0.25} viewBox="0 0 48 12" className={className} aria-hidden="true">
      <path d="M0 6 Q 6 0 12 6 T 24 6 T 36 6 T 48 6 V 12 H 0 Z" fill={color} />
    </svg>
  )
}
