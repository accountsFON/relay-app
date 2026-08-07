import { describe, it, expect } from 'vitest'
import { RelayStep } from '@prisma/client'
import { designerGateApplies } from '@/lib/designer-gate'

describe('designerGateApplies', () => {
  it('applies for a designer at a gate step on a live relay', () => {
    expect(designerGateApplies('designer', null, RelayStep.in_design)).toBe(true)
    expect(designerGateApplies('designer', null, RelayStep.implementing_revisions)).toBe(true)
  })

  it('skips archived relays even at a gate step (deletedAt set)', () => {
    expect(designerGateApplies('designer', new Date(), RelayStep.in_design)).toBe(false)
  })

  it('does not apply for non-designer roles', () => {
    expect(designerGateApplies('account_manager', null, RelayStep.in_design)).toBe(false)
    expect(designerGateApplies('admin', null, RelayStep.in_design)).toBe(false)
    expect(designerGateApplies('client', null, RelayStep.in_design)).toBe(false)
  })

  it('does not apply at non-gate steps', () => {
    expect(designerGateApplies('designer', null, RelayStep.copy)).toBe(false)
    expect(designerGateApplies('designer', null, RelayStep.scheduling)).toBe(false)
    expect(designerGateApplies('designer', null, RelayStep.completed)).toBe(false)
  })
})
