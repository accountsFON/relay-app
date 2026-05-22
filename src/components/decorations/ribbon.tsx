type RibbonProps = { size?: number; color?: string; className?: string }

export function Ribbon({ size = 48, color = 'currentColor', className }: RibbonProps) {
  return (
    <svg width={size} height={size * 0.4} viewBox="0 0 48 20" className={className} aria-hidden="true">
      <path d="M0 10 Q 12 2 24 10 T 48 10 V 14 Q 36 6 24 14 T 0 14 Z" fill={color} />
    </svg>
  )
}
