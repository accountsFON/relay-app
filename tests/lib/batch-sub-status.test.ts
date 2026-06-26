import { describe, it, expect } from 'vitest'
import { RelayStep } from '@prisma/client'
import {
  amKanbanColumn,
  clientKanbanColumn,
  deriveSubStatus,
  designerKanbanColumn,
} from '@/lib/batch-sub-status'

const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)

describe('deriveSubStatus', () => {
  it('reports days here', () => {
    const result = deriveSubStatus({
      currentStep: RelayStep.copy,
      currentSubState: 'generating',
      createdAt: yesterday,
    })
    expect(result.daysHere).toBeGreaterThanOrEqual(1)
  })

  it('reports a static label for implementing_revisions', () => {
    const result = deriveSubStatus({
      currentStep: RelayStep.implementing_revisions,
      currentSubState: null,
      createdAt: new Date(),
    })
    expect(result.label).toBe('Implementing revisions')
    expect(result.tone).toBe('progress')
  })

  it('reports "Awaiting design revisions" on am_review_design with that sub-state (merge design steps)', () => {
    const result = deriveSubStatus({
      currentStep: RelayStep.am_review_design,
      currentSubState: 'awaiting_design_revisions',
      createdAt: new Date(),
    })
    expect(result.label).toBe('Awaiting design revisions')
    expect(result.tone).toBe('attention')
  })

  it('reports "Ready for review" on am_review_design with no sub-state', () => {
    const result = deriveSubStatus({
      currentStep: RelayStep.am_review_design,
      currentSubState: null,
      createdAt: new Date(),
    })
    expect(result.label).toBe('Ready for review')
  })

  it('humanizes copy sub-states', () => {
    expect(
      deriveSubStatus({
        currentStep: RelayStep.copy,
        currentSubState: 'generating',
        createdAt: new Date(),
      }).label,
    ).toBe('Generating')
    expect(
      deriveSubStatus({
        currentStep: RelayStep.copy,
        currentSubState: 'drafted',
        createdAt: new Date(),
      }).label,
    ).toBe('Drafted')
  })
})

describe('amKanbanColumn', () => {
  it('groups all design legs into "Design"', () => {
    expect(amKanbanColumn(RelayStep.in_design)).toBe('Design')
    expect(amKanbanColumn(RelayStep.designs_completed)).toBe('Design')
    expect(amKanbanColumn(RelayStep.am_review_design)).toBe('Design')
    expect(amKanbanColumn(RelayStep.design_revisions)).toBe('Design')
  })

  it('groups client steps into "With Client"', () => {
    expect(amKanbanColumn(RelayStep.sent_to_client)).toBe('With Client')
    expect(amKanbanColumn(RelayStep.client_decision)).toBe('With Client')
  })

  it('hides onboarding_gate from AM view', () => {
    expect(amKanbanColumn(RelayStep.onboarding_gate)).toBeNull()
  })
})

describe('designerKanbanColumn', () => {
  it('only includes designer-held steps', () => {
    expect(designerKanbanColumn(RelayStep.in_design)).toBe('In Design')
    expect(designerKanbanColumn(RelayStep.designs_completed)).toBe('Awaiting QA')
    expect(designerKanbanColumn(RelayStep.design_revisions)).toBe('Revisions')
    expect(designerKanbanColumn(RelayStep.copy)).toBeNull()
    expect(designerKanbanColumn(RelayStep.client_decision)).toBeNull()
  })
})

describe('clientKanbanColumn', () => {
  it('puts client-held steps under "Awaiting Your Approval"', () => {
    expect(clientKanbanColumn(RelayStep.sent_to_client)).toBe(
      'Awaiting Your Approval',
    )
    expect(clientKanbanColumn(RelayStep.client_decision)).toBe(
      'Awaiting Your Approval',
    )
  })

  it('puts everything else under "In Production"', () => {
    expect(clientKanbanColumn(RelayStep.copy)).toBe('In Production')
    expect(clientKanbanColumn(RelayStep.in_design)).toBe('In Production')
    expect(clientKanbanColumn(RelayStep.final_qa_schedule)).toBe('In Production')
  })

  it('hides onboarding_gate from client view', () => {
    expect(clientKanbanColumn(RelayStep.onboarding_gate)).toBeNull()
  })
})
