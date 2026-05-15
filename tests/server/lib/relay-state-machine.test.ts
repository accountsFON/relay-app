import { describe, it, expect } from 'vitest'
import { RelayStep, RelayRole } from '@prisma/client'
import {
  HOLDER_ROLE,
  LEGAL_TRANSITIONS,
  holderRoleForStep,
  isChecklistComplete,
  legalNextSteps,
  legalSendBackTargets,
  validateTransition,
} from '@/server/lib/relay-state-machine'

describe('validateTransition', () => {
  it('allows every transition declared in LEGAL_TRANSITIONS', () => {
    for (const t of LEGAL_TRANSITIONS) {
      const result = validateTransition(t.from, t.to)
      expect(result.ok, `${t.from} → ${t.to}`).toBe(true)
      expect(result.direction).toBe(t.direction)
    }
  })

  it('rejects illegal jumps', () => {
    expect(validateTransition(RelayStep.copy, RelayStep.sent_to_client).ok).toBe(false)
    expect(validateTransition(RelayStep.am_qa_pre_client, RelayStep.copy).ok).toBe(false)
    expect(validateTransition(RelayStep.client_decision, RelayStep.copy).ok).toBe(false)
    expect(
      validateTransition(RelayStep.final_qa_schedule, RelayStep.copy).ok,
    ).toBe(false)
  })

  it('forbids self-transitions', () => {
    expect(validateTransition(RelayStep.copy, RelayStep.copy).ok).toBe(false)
  })

  it('rejects step 8 send-back to copy (must go to designer)', () => {
    expect(
      validateTransition(RelayStep.am_qa_pre_client, RelayStep.copy).ok,
    ).toBe(false)
    expect(
      validateTransition(RelayStep.am_qa_pre_client, RelayStep.design_revisions).ok,
    ).toBe(true)
  })
})

describe('legalSendBackTargets', () => {
  it('returns design_revisions for am_review_design', () => {
    expect(legalSendBackTargets(RelayStep.am_review_design)).toEqual([
      RelayStep.design_revisions,
    ])
  })

  it('returns design_revisions only for am_qa_pre_client', () => {
    expect(legalSendBackTargets(RelayStep.am_qa_pre_client)).toEqual([
      RelayStep.design_revisions,
    ])
  })

  it('returns empty only for onboarding_gate (no predecessor)', () => {
    expect(legalSendBackTargets(RelayStep.onboarding_gate)).toEqual([])
  })
})

describe('legalNextSteps', () => {
  it('lists both router options from client_decision', () => {
    const next = legalNextSteps(RelayStep.client_decision).map((t) => t.to)
    expect(next).toContain(RelayStep.ready_to_schedule)
    expect(next).toContain(RelayStep.implementing_revisions)
  })

  it('lists both router options from revisions_complete', () => {
    const next = legalNextSteps(RelayStep.revisions_complete).map((t) => t.to)
    expect(next).toContain(RelayStep.sent_to_client)
    expect(next).toContain(RelayStep.final_qa_schedule)
  })
})

describe('holderRoleForStep', () => {
  it('maps every RelayStep to a RelayRole', () => {
    for (const step of Object.values(RelayStep)) {
      const role = holderRoleForStep(step as RelayStep)
      expect(Object.values(RelayRole)).toContain(role)
    }
  })

  it('puts admin on onboarding_gate', () => {
    expect(HOLDER_ROLE[RelayStep.onboarding_gate]).toBe(RelayRole.admin)
  })

  it('puts client on sent_to_client and client_decision', () => {
    expect(HOLDER_ROLE[RelayStep.sent_to_client]).toBe(RelayRole.client)
    expect(HOLDER_ROLE[RelayStep.client_decision]).toBe(RelayRole.client)
  })

  it('puts AM on the orchestration steps', () => {
    expect(HOLDER_ROLE[RelayStep.copy]).toBe(RelayRole.am)
    expect(HOLDER_ROLE[RelayStep.am_review_design]).toBe(RelayRole.am)
    expect(HOLDER_ROLE[RelayStep.am_qa_pre_client]).toBe(RelayRole.am)
    expect(HOLDER_ROLE[RelayStep.implementing_revisions]).toBe(RelayRole.am)
    expect(HOLDER_ROLE[RelayStep.final_qa_schedule]).toBe(RelayRole.am)
  })

  it('puts designer on the design legs', () => {
    expect(HOLDER_ROLE[RelayStep.in_design]).toBe(RelayRole.designer)
    expect(HOLDER_ROLE[RelayStep.designs_completed]).toBe(RelayRole.designer)
    expect(HOLDER_ROLE[RelayStep.design_revisions]).toBe(RelayRole.designer)
  })
})

describe('isChecklistComplete', () => {
  it('returns true for empty list', () => {
    expect(isChecklistComplete([])).toBe(true)
  })

  it('returns true when all required items checked', () => {
    expect(
      isChecklistComplete([
        { required: true, checked: true },
        { required: true, checked: true },
      ]),
    ).toBe(true)
  })

  it('returns false when any required item unchecked', () => {
    expect(
      isChecklistComplete([
        { required: true, checked: true },
        { required: true, checked: false },
      ]),
    ).toBe(false)
  })

  it('ignores optional items', () => {
    expect(
      isChecklistComplete([
        { required: true, checked: true },
        { required: false, checked: false },
      ]),
    ).toBe(true)
  })
})

describe('completed terminal step', () => {
  it('allows forward transition from final_qa_schedule to completed', () => {
    const result = validateTransition(
      RelayStep.final_qa_schedule,
      RelayStep.completed,
    )
    expect(result.ok).toBe(true)
    expect(result.direction).toBe('forward')
  })

  it('rejects forward jumps out of completed; only send_back to final_qa_schedule is legal', () => {
    expect(validateTransition(RelayStep.completed, RelayStep.copy).ok).toBe(false)
    expect(validateTransition(RelayStep.completed, RelayStep.in_design).ok).toBe(false)
    expect(validateTransition(RelayStep.completed, RelayStep.final_qa_schedule).ok).toBe(true)
  })

  it('exposes completed as a legal next step from final_qa_schedule', () => {
    const next = legalNextSteps(RelayStep.final_qa_schedule)
    expect(next).toContainEqual({
      from: RelayStep.final_qa_schedule,
      to: RelayStep.completed,
      direction: 'forward',
    })
  })

  it('returns one send-back next step from completed (the un-finish path)', () => {
    const next = legalNextSteps(RelayStep.completed)
    expect(next).toEqual([
      {
        from: RelayStep.completed,
        to: RelayStep.final_qa_schedule,
        direction: 'send_back',
      },
    ])
  })

  it('returns final_qa_schedule as send-back target from completed (un-finish)', () => {
    expect(legalSendBackTargets(RelayStep.completed)).toEqual([
      RelayStep.final_qa_schedule,
    ])
  })

  it('HOLDER_ROLE has am role for completed step', () => {
    expect(HOLDER_ROLE[RelayStep.completed]).toBe(RelayRole.am)
  })

  it('holderRoleForStep returns am for completed', () => {
    expect(holderRoleForStep(RelayStep.completed)).toBe(RelayRole.am)
  })
})

describe('go back on every step', () => {
  it('every RelayStep except onboarding_gate has at least one legal send-back target', () => {
    for (const step of Object.values(RelayStep)) {
      if (step === RelayStep.onboarding_gate) {
        expect(legalSendBackTargets(step as RelayStep)).toEqual([])
        continue
      }
      const targets = legalSendBackTargets(step as RelayStep)
      expect(
        targets.length,
        `${step} should have at least one back target`,
      ).toBeGreaterThanOrEqual(1)
    }
  })

  it('copy can go back to onboarding_gate', () => {
    expect(legalSendBackTargets(RelayStep.copy)).toEqual([
      RelayStep.onboarding_gate,
    ])
  })

  it('in_design can go back to copy', () => {
    expect(legalSendBackTargets(RelayStep.in_design)).toEqual([RelayStep.copy])
  })

  it('design_revisions can go back to am_qa_pre_client (am_review_design is already the forward path)', () => {
    expect(legalSendBackTargets(RelayStep.design_revisions)).toEqual([
      RelayStep.am_qa_pre_client,
    ])
  })

  it('sent_to_client can go back to both am_qa_pre_client and revisions_complete', () => {
    const targets = legalSendBackTargets(RelayStep.sent_to_client)
    expect(targets).toContain(RelayStep.am_qa_pre_client)
    expect(targets).toContain(RelayStep.revisions_complete)
  })

  it('client_decision can go back to sent_to_client', () => {
    expect(legalSendBackTargets(RelayStep.client_decision)).toEqual([
      RelayStep.sent_to_client,
    ])
  })

  it('ready_to_schedule can go back to client_decision', () => {
    expect(legalSendBackTargets(RelayStep.ready_to_schedule)).toEqual([
      RelayStep.client_decision,
    ])
  })

  it('implementing_revisions can go back to client_decision', () => {
    expect(legalSendBackTargets(RelayStep.implementing_revisions)).toEqual([
      RelayStep.client_decision,
    ])
  })

  it('revisions_complete can go back to implementing_revisions', () => {
    expect(legalSendBackTargets(RelayStep.revisions_complete)).toEqual([
      RelayStep.implementing_revisions,
    ])
  })

  it('final_qa_schedule can go back to both ready_to_schedule and revisions_complete', () => {
    const targets = legalSendBackTargets(RelayStep.final_qa_schedule)
    expect(targets).toContain(RelayStep.ready_to_schedule)
    expect(targets).toContain(RelayStep.revisions_complete)
  })
})
