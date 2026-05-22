type StarburstProps = { size?: number; color?: string; points?: number; className?: string }

export function Starburst({ size = 32, color = 'currentColor', points = 12, className }: StarburstProps) {
  const cx = 16, cy = 16
  const outer = 15, inner = 6
  const path = Array.from({ length: points * 2 }, (_, i) => {
    const angle = (Math.PI / points) * i - Math.PI / 2
    const r = i % 2 === 0 ? outer : inner
    return `${cx + Math.cos(angle) * r},${cy + Math.sin(angle) * r}`
  }).join(' ')
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden="true">
      <polygon points={path} fill={color} />
    </svg>
  )
}
