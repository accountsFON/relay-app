type AsteriskProps = { size?: number; color?: string; className?: string }

export function Asterisk({ size = 32, color = 'currentColor', className }: AsteriskProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden="true">
      {[0, 45, 90, 135].map((deg) => (
        <rect key={deg} x="14" y="2" width="4" height="28" rx="1.5" fill={color} transform={`rotate(${deg} 16 16)`} />
      ))}
    </svg>
  )
}
