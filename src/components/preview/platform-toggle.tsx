'use client'

import { cn } from '@/lib/utils'

export type Platform = 'instagram' | 'facebook'

export type PlatformToggleProps = {
  platform: Platform
  onChange: (platform: Platform) => void
  className?: string
}

/**
 * Pill toggle that switches the preview between Instagram and Facebook
 * chrome. Controlled component, parent owns the state.
 *
 * Keyboard accessibility: implemented as a radiogroup with two button
 * radios. Tab focuses the active option, Space or Enter activates the
 * focused option, ArrowLeft/ArrowRight roves between options (per WAI-ARIA
 * radio pattern).
 */
export function PlatformToggle({
  platform,
  onChange,
  className,
}: PlatformToggleProps) {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, target: Platform) => {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault()
      onChange(target)
      return
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      onChange(target === 'instagram' ? 'facebook' : 'instagram')
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label="Preview platform"
      className={cn(
        'inline-flex items-center rounded-full bg-cream-warm p-1 text-[13px] font-medium',
        className,
      )}
    >
      <PlatformOption
        value="instagram"
        label="Instagram"
        active={platform === 'instagram'}
        onSelect={() => onChange('instagram')}
        onKeyDown={(e) => handleKeyDown(e, 'instagram')}
      />
      <PlatformOption
        value="facebook"
        label="Facebook"
        active={platform === 'facebook'}
        onSelect={() => onChange('facebook')}
        onKeyDown={(e) => handleKeyDown(e, 'facebook')}
      />
    </div>
  )
}

function PlatformOption({
  value,
  label,
  active,
  onSelect,
  onKeyDown,
}: {
  value: Platform
  label: string
  active: boolean
  onSelect: () => void
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      tabIndex={active ? 0 : -1}
      data-platform={value}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      className={cn(
        'rounded-full px-4 py-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30',
        active
          ? 'bg-card text-foreground shadow-sm'
          : 'text-ink-50 hover:text-foreground',
      )}
    >
      {label}
    </button>
  )
}
