'use client'

import { useState, useTransition } from 'react'
import { PageSection } from '@/components/ui/page-section'
import { BrandCheckbox } from '@/components/ui/brand-checkbox'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  setClientOnboardingItemAction,
  completeClientOnboardingAction,
  type OnboardingItem,
} from '@/app/(app)/clients/actions'

type ItemState = { account: boolean; designFolder: boolean; assets: boolean }

const ITEMS: { key: OnboardingItem; label: string }[] = [
  { key: 'account', label: 'Account details filled out' },
  { key: 'designFolder', label: 'Visual / design folder created' },
  { key: 'assets', label: 'Assets received from client' },
]

export function ClientOnboardingChecklist({
  clientId,
  initial,
}: {
  clientId: string
  initial: ItemState
}) {
  const [checked, setChecked] = useState<ItemState>(initial)
  const [pending, startTransition] = useTransition()

  const allChecked = checked.account && checked.designFolder && checked.assets

  function toggle(key: OnboardingItem, next: boolean) {
    setChecked((c) => ({ ...c, [key]: next }))
    startTransition(async () => {
      await setClientOnboardingItemAction(clientId, key, next)
    })
  }

  function complete() {
    startTransition(async () => {
      await completeClientOnboardingAction(clientId)
    })
  }

  return (
    <PageSection title="Onboard this client">
      <p className="text-sm text-muted-foreground -mt-2 mb-4">
        Confirm setup before generating content. This is a one time step; the
        Generate content button unlocks once all three are checked and confirmed.
      </p>
      <ul className="space-y-3">
        {ITEMS.map(({ key, label }) => (
          <li key={key} className="flex items-start gap-3">
            <BrandCheckbox
              id={`onboarding-${key}`}
              checked={checked[key]}
              onChange={(e) => toggle(key, e.target.checked)}
              className="mt-0.5"
            />
            <Label htmlFor={`onboarding-${key}`}>{label}</Label>
          </li>
        ))}
      </ul>
      <div className="mt-5">
        <Button variant="accent" disabled={!allChecked || pending} onClick={complete}>
          Complete onboarding
        </Button>
      </div>
    </PageSection>
  )
}
