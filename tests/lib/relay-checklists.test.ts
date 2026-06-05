import { describe, it, expect } from 'vitest'
import { RelayStep } from '@prisma/client'
import { CHECKLIST_SEED } from '@/lib/relay-checklists'

describe('CHECKLIST_SEED implementing_revisions', () => {
  it('is a single required "Revisions complete" item', () => {
    const seed = CHECKLIST_SEED[RelayStep.implementing_revisions]
    expect(seed).toEqual([{ label: 'Revisions complete' }])
  })
})
