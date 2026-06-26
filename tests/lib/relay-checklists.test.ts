import { describe, it, expect } from 'vitest'
import { RelayStep } from '@prisma/client'
import { CHECKLIST_SEED } from '@/lib/relay-checklists'

describe('pipeline rework: checklist seeds', () => {
  it('Copy Review has the three doc items', () => {
    expect(CHECKLIST_SEED[RelayStep.copy].map((i) => i.label)).toEqual([
      'Content has been reviewed for clarity, brand alignment, and messaging consistency',
      'CTAs and hashtags have been verified',
      'Copy edits have been finalized',
    ])
  })
  it('Initial Design has four items', () => {
    expect(CHECKLIST_SEED[RelayStep.in_design].length).toBe(4)
  })
  it('Design Review has five items', () => {
    expect(CHECKLIST_SEED[RelayStep.am_review_design].length).toBe(5)
  })
  it('Design Revision seed is retired (merge design steps: empty)', () => {
    expect(CHECKLIST_SEED[RelayStep.design_revisions].length).toBe(0)
  })
  it('QA has three items', () => {
    expect(CHECKLIST_SEED[RelayStep.am_qa_pre_client].length).toBe(3)
  })
  it('Scheduling has the three doc items', () => {
    expect(CHECKLIST_SEED[RelayStep.scheduling].map((i) => i.label)).toEqual([
      'All posts have been scheduled',
      'All posting dates have been double checked',
      'All caption and image pairings have been double checked',
    ])
  })
  it('Post Revision has one item', () => {
    expect(CHECKLIST_SEED[RelayStep.implementing_revisions].map((i) => i.label)).toEqual([
      'All client feedback has been addressed',
    ])
  })
  it('Onboarding and Client Review have no checklist', () => {
    expect(CHECKLIST_SEED[RelayStep.onboarding_gate]).toEqual([])
    expect(CHECKLIST_SEED[RelayStep.client_review]).toEqual([])
  })
  it('seed is total over RelayStep (every value present)', () => {
    for (const step of Object.values(RelayStep)) {
      expect(CHECKLIST_SEED[step]).toBeDefined()
    }
  })
})
