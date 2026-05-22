type PinwheelProps = { size?: number; color?: string; className?: string }

export function Pinwheel({ size = 32, color = 'currentColor', className }: PinwheelProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden="true">
      {[0, 90, 180, 270].map((deg) => (
        <path key={deg} d="M16 16 L 16 2 Q 22 8 16 16" fill={color} transform={`rotate(${deg} 16 16)`} />
      ))}
    </svg>
  )
}
