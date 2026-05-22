type BlobProps = { size?: number; color?: string; className?: string }

export function Blob({ size = 64, color = 'currentColor', className }: BlobProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true">
      <path
        d="M48 8C56 8 60 18 58 28C56 38 60 50 50 56C40 62 24 58 16 50C8 42 4 28 10 18C16 8 30 4 40 6Z"
        fill={color}
      />
    </svg>
  )
}
