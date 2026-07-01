import { describe, it, expect, vi } from 'vitest'
import { RelayStep, RelayRole } from '@prisma/client'
import {
  HOLDER_ROLE,
  LEGAL_TRANSITIONS,
  LEGAL_TRANSITIONS_NO_REVIEW,
  checklistRowsForStep,
  reseedChecklistForStep,
  holderRoleForStep,
  isChecklistComplete,
  legalNextSteps,
  legalSendBackTargets,
  transitionsFor,
  validateTransition,
} from '@/server/lib/relay-state-machine'
import { SEND_REVIEW_LINK_LABEL } from '@/lib/relay-checklists'

describe('validateTransition', () => {
  it('allows every transition declared in LEGAL_TRANSITIONS', () => {
    for (const t of LEGAL_TRANSITIONS) {
      const result = validateTransition(t.from, t.to, true)
      expect(result.ok, `${t.from} -> ${t.to}`).toBe(true)
      expect(result.direction).toBe(t.direction)
    }
  })

  it('rejects illegal jumps', () => {
    expect(validateTransition(RelayStep.copy, RelayStep.sent_to_client, true).ok).toBe(false)
    expect(validateTransition(RelayStep.am_qa_pre_client, RelayStep.copy, true).ok).toBe(false)
    expect(validateTransition(RelayStep.client_decision, RelayStep.copy, true).ok).toBe(false)
    expect(
      validateTransition(RelayStep.final_qa_schedule, RelayStep.copy, true).ok,
    ).toBe(false)
  })

  it('forbids self-transitions', () => {
    expect(validateTransition(RelayStep.copy, RelayStep.copy, true).ok).toBe(false)
  })

  it('rejects step 8 send-back to copy; sends back to am_review_design (merge design steps: was design_revisions)', () => {
    expect(
      validateTransition(RelayStep.am_qa_pre_client, RelayStep.copy, true).ok,
    ).toBe(false)
    // design_revisions is retired; QA send-back now lands on Design Review.
    expect(
      validateTransition(RelayStep.am_qa_pre_client, RelayStep.design_revisions, true).ok,
    ).toBe(false)
    expect(
      validateTransition(RelayStep.am_qa_pre_client, RelayStep.am_review_design, true).ok,
    ).toBe(true)
  })
})

describe('merge design steps: design_revisions retired from live tables', () => {
  it('design_revisions appears in NO LEGAL_TRANSITIONS entry as from or to', () => {
    for (const t of LEGAL_TRANSITIONS) {
      expect(t.from, `from ${t.from}`).not.toBe(RelayStep.design_revisions)
      expect(t.to, `to ${t.to}`).not.toBe(RelayStep.design_revisions)
    }
  })

  it('design_revisions appears in NO LEGAL_TRANSITIONS_NO_REVIEW entry as from or to', () => {
    for (const t of LEGAL_TRANSITIONS_NO_REVIEW) {
      expect(t.from, `from ${t.from}`).not.toBe(RelayStep.design_revisions)
      expect(t.to, `to ${t.to}`).not.toBe(RelayStep.design_revisions)
    }
  })

  it('legalNextSteps(am_review_design, true) returns only forward to am_qa_pre_client', () => {
    expect(legalNextSteps(RelayStep.am_review_design, true)).toEqual([
      { from: RelayStep.am_review_design, to: RelayStep.am_qa_pre_client, direction: 'forward' },
    ])
  })

  it('legalNextSteps(am_review_design, false) returns only forward to am_qa_pre_client', () => {
    expect(legalNextSteps(RelayStep.am_review_design, false)).toEqual([
      { from: RelayStep.am_review_design, to: RelayStep.am_qa_pre_client, direction: 'forward' },
    ])
  })

  it('legalSendBackTargets(am_review_design) is empty in both tracks', () => {
    expect(legalSendBackTargets(RelayStep.am_review_design, true)).toEqual([])
    expect(legalSendBackTargets(RelayStep.am_review_design, false)).toEqual([])
  })

  it('both tables still contain in_design -> am_review_design and am_review_design -> am_qa_pre_client', () => {
    for (const table of [LEGAL_TRANSITIONS, LEGAL_TRANSITIONS_NO_REVIEW]) {
      expect(
        table.some(
          (t) => t.from === RelayStep.in_design && t.to === RelayStep.am_review_design && t.direction === 'forward',
        ),
      ).toBe(true)
      expect(
        table.some(
          (t) =>
            t.from === RelayStep.am_review_design &&
            t.to === RelayStep.am_qa_pre_client &&
            t.direction === 'forward',
        ),
      ).toBe(true)
    }
  })
})

describe('legalSendBackTargets', () => {
  it('returns empty for am_review_design (merge design steps: design_revisions retired)', () => {
    expect(legalSendBackTargets(RelayStep.am_review_design, true)).toEqual([])
  })

  it('returns am_review_design only for am_qa_pre_client (merge design steps: was design_revisions)', () => {
    expect(legalSendBackTargets(RelayStep.am_qa_pre_client, true)).toEqual([
      RelayStep.am_review_design,
    ])
  })

  it('returns empty only for onboarding_gate (no predecessor)', () => {
    expect(legalSendBackTargets(RelayStep.onboarding_gate, true)).toEqual([])
  })
})

describe('legalNextSteps', () => {
  it('lists both router options from client_review (pipeline rework: was client_decision)', () => {
    // client_decision is retired; client_review is the merged step.
    const next = legalNextSteps(RelayStep.client_review, true).map((t) => t.to)
    expect(next).toContain(RelayStep.scheduling)
    expect(next).toContain(RelayStep.implementing_revisions)
  })

  it('revisions_complete has no outgoing edges (retired routing step)', () => {
    // revisions_complete enum is retained for historical rows but the
    // workspace redesign (2026-06-05) removed all edges through it.
    const next = legalNextSteps(RelayStep.revisions_complete, true)
    expect(next).toEqual([])
  })
})

describe('holderRoleForStep', () => {
  it('maps every RelayStep to a RelayRole', () => {
    for (const step of Object.values(RelayStep)) {
      const role = holderRoleForStep(step as RelayStep)
      expect(Object.values(RelayRole)).toContain(role)
    }
  })

  it('puts am on onboarding_gate (pipeline rework: was admin)', () => {
    expect(HOLDER_ROLE[RelayStep.onboarding_gate]).toBe(RelayRole.am)
  })

  it('puts client on sent_to_client, client_decision (retired), and client_review (new)', () => {
    // sent_to_client and client_decision are retired but kept for historical rows.
    expect(HOLDER_ROLE[RelayStep.sent_to_client]).toBe(RelayRole.client)
    expect(HOLDER_ROLE[RelayStep.client_decision]).toBe(RelayRole.client)
    // client_review is the new merged live step.
    expect(HOLDER_ROLE[RelayStep.client_review]).toBe(RelayRole.client)
  })

  it('puts AM on the orchestration steps', () => {
    expect(HOLDER_ROLE[RelayStep.copy]).toBe(RelayRole.am)
    expect(HOLDER_ROLE[RelayStep.am_review_design]).toBe(RelayRole.am)
    expect(HOLDER_ROLE[RelayStep.am_qa_pre_client]).toBe(RelayRole.am)
    expect(HOLDER_ROLE[RelayStep.implementing_revisions]).toBe(RelayRole.am)
    // final_qa_schedule is retired; scheduling is the new live merged step.
    expect(HOLDER_ROLE[RelayStep.final_qa_schedule]).toBe(RelayRole.am)
    expect(HOLDER_ROLE[RelayStep.scheduling]).toBe(RelayRole.am)
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
  it('allows forward transition from scheduling to completed (pipeline rework: was final_qa_schedule)', () => {
    const result = validateTransition(
      RelayStep.scheduling,
      RelayStep.completed,
      true,
    )
    expect(result.ok).toBe(true)
    expect(result.direction).toBe('forward')
  })

  it('rejects forward jumps out of completed; only send_back to scheduling is legal (pipeline rework)', () => {
    expect(validateTransition(RelayStep.completed, RelayStep.copy, true).ok).toBe(false)
    expect(validateTransition(RelayStep.completed, RelayStep.in_design, true).ok).toBe(false)
    // scheduling is the new live merged step (was final_qa_schedule)
    expect(validateTransition(RelayStep.completed, RelayStep.scheduling, true).ok).toBe(true)
  })

  it('exposes completed as a legal next step from scheduling (pipeline rework: was final_qa_schedule)', () => {
    const next = legalNextSteps(RelayStep.scheduling, true)
    expect(next).toContainEqual({
      from: RelayStep.scheduling,
      to: RelayStep.completed,
      direction: 'forward',
    })
  })

  it('returns one send-back next step from completed (the un-finish path) (pipeline rework)', () => {
    const next = legalNextSteps(RelayStep.completed, true)
    expect(next).toEqual([
      {
        from: RelayStep.completed,
        to: RelayStep.scheduling,
        direction: 'send_back',
      },
    ])
  })

  it('returns scheduling as send-back target from completed (un-finish) (pipeline rework)', () => {
    expect(legalSendBackTargets(RelayStep.completed, true)).toEqual([
      RelayStep.scheduling,
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
  it('every live RelayStep except onboarding_gate has at least one legal send-back target', () => {
    // Pipeline rework: retired steps kept for historical rows only (no live edges).
    const noEdgesSteps = new Set<RelayStep>([
      RelayStep.onboarding_gate,
      RelayStep.designs_completed,
      RelayStep.revisions_complete,
      // Retired by pipeline rework (2026-06-22) — no live edges in either table:
      RelayStep.sent_to_client,
      RelayStep.client_decision,
      RelayStep.ready_to_schedule,
      RelayStep.final_qa_schedule,
      // design_revisions is fully retired (merge design steps): no live edges.
      RelayStep.design_revisions,
      // am_review_design lost its only send_back target (design_revisions) in the
      // merge; "Request changes" is now an in-step action, not a transition.
      RelayStep.am_review_design,
      // implementing_revisions has two forward edges only (re-review + schedule); no send_back.
      // The re-review path uses direction: 'forward' to client_review (not 'revision').
      RelayStep.implementing_revisions,
    ])
    for (const step of Object.values(RelayStep)) {
      if (noEdgesSteps.has(step as RelayStep)) {
        expect(legalSendBackTargets(step as RelayStep, true)).toEqual([])
        continue
      }
      const targets = legalSendBackTargets(step as RelayStep, true)
      expect(
        targets.length,
        `${step} should have at least one back target`,
      ).toBeGreaterThanOrEqual(1)
    }
  })

  it('copy can go back to onboarding_gate', () => {
    expect(legalSendBackTargets(RelayStep.copy, true)).toEqual([
      RelayStep.onboarding_gate,
    ])
  })

  it('in_design can go back to copy', () => {
    expect(legalSendBackTargets(RelayStep.in_design, true)).toEqual([RelayStep.copy])
  })

  it('design_revisions has no send_back edges (merge design steps: fully retired)', () => {
    // The merge removed the only outgoing edge (forward to am_review_design).
    expect(legalSendBackTargets(RelayStep.design_revisions, true)).toEqual([])
  })

  it('client_review can go back to am_qa_pre_client (pipeline rework: was sent_to_client -> am_qa_pre_client)', () => {
    const targets = legalSendBackTargets(RelayStep.client_review, true)
    expect(targets).toContain(RelayStep.am_qa_pre_client)
    expect(targets).not.toContain(RelayStep.revisions_complete)
    expect(targets).toHaveLength(1)
  })

  it('sent_to_client has no live edges (retired step, kept for historical rows)', () => {
    // Pipeline rework: sent_to_client is retired; client_review is the merged step.
    expect(legalSendBackTargets(RelayStep.sent_to_client, true)).toEqual([])
  })

  it('client_decision has no live edges (retired step, kept for historical rows)', () => {
    // Pipeline rework: client_decision is retired; client_review is the merged step.
    expect(legalSendBackTargets(RelayStep.client_decision, true)).toEqual([])
  })

  it('ready_to_schedule has no live edges (retired step, kept for historical rows)', () => {
    // Pipeline rework: ready_to_schedule is retired; scheduling is the merged step.
    expect(legalSendBackTargets(RelayStep.ready_to_schedule, true)).toEqual([])
  })

  it('implementing_revisions has no send_back edges (pipeline rework: re-review uses forward to client_review)', () => {
    // Both outgoing edges use direction: 'forward', not 'revision' or 'send_back'.
    // legalSendBackTargets filters for send_back only, so it returns [].
    expect(legalSendBackTargets(RelayStep.implementing_revisions, true)).toEqual([])
    // client_review IS reachable via the forward-direction re-review edge:
    const next = legalNextSteps(RelayStep.implementing_revisions, true).map((t) => t.to)
    expect(next).toContain(RelayStep.client_review)
  })

  it('revisions_complete has no send-back targets (retired routing step)', () => {
    // Workspace redesign (2026-06-05): revisions_complete is retained for
    // historical rows but has no live edges in either direction.
    expect(legalSendBackTargets(RelayStep.revisions_complete, true)).toEqual([])
  })

  it('scheduling can go back to am_qa_pre_client (pipeline rework: was final_qa_schedule -> ready_to_schedule)', () => {
    const targets = legalSendBackTargets(RelayStep.scheduling, true)
    expect(targets).toContain(RelayStep.am_qa_pre_client)
    expect(targets).not.toContain(RelayStep.revisions_complete)
    expect(targets).toHaveLength(1)
  })

  it('final_qa_schedule has no live edges (retired step, kept for historical rows)', () => {
    // Pipeline rework: final_qa_schedule is retired; scheduling is the merged step.
    expect(legalSendBackTargets(RelayStep.final_qa_schedule, true)).toEqual([])
  })
})

describe('state machine, no review flow', () => {
  it('LEGAL_TRANSITIONS_NO_REVIEW never references the retired client steps or client_review as from or to', () => {
    // Pipeline rework: sent_to_client, client_decision, implementing_revisions,
    // revisions_complete are not in the no-review track.
    // client_review is the with-review-only merged step and must not appear either.
    const skipped = new Set<RelayStep>([
      RelayStep.sent_to_client,
      RelayStep.client_decision,
      RelayStep.implementing_revisions,
      RelayStep.revisions_complete,
      RelayStep.client_review,
    ])
    for (const t of LEGAL_TRANSITIONS_NO_REVIEW) {
      expect(skipped.has(t.to)).toBe(false)
      expect(skipped.has(t.from)).toBe(false)
    }
  })

  it('am_qa_pre_client forward lands on scheduling when review is off (pipeline rework: was ready_to_schedule)', () => {
    const result = validateTransition(
      RelayStep.am_qa_pre_client,
      RelayStep.scheduling,
      false,
    )
    expect(result.ok).toBe(true)
    expect(result.direction).toBe('forward')
  })

  it('am_qa_pre_client cannot transition to sent_to_client when review is off', () => {
    const result = validateTransition(
      RelayStep.am_qa_pre_client,
      RelayStep.sent_to_client,
      false,
    )
    expect(result.ok).toBe(false)
  })

  it('scheduling send-back lands on am_qa_pre_client when review is off (pipeline rework: was ready_to_schedule)', () => {
    const result = validateTransition(
      RelayStep.scheduling,
      RelayStep.am_qa_pre_client,
      false,
    )
    expect(result.ok).toBe(true)
    expect(result.direction).toBe('send_back')
  })

  it('legalNextSteps(am_qa_pre_client, false) returns exactly scheduling + am_review_design (merge design steps: was design_revisions)', () => {
    const next = legalNextSteps(RelayStep.am_qa_pre_client, false)
    const summary = next.map((t) => `${t.to}:${t.direction}`).sort()
    expect(summary).toEqual([
      `${RelayStep.am_review_design}:send_back`,
      `${RelayStep.scheduling}:forward`,
    ].sort())
  })

  it('legalSendBackTargets(scheduling, false) returns am_qa_pre_client only (pipeline rework)', () => {
    expect(legalSendBackTargets(RelayStep.scheduling, false)).toEqual([
      RelayStep.am_qa_pre_client,
    ])
  })

  it('transitionsFor returns FULL when on, NO_REVIEW when off', () => {
    expect(transitionsFor(true)).toBe(LEGAL_TRANSITIONS)
    expect(transitionsFor(false)).toBe(LEGAL_TRANSITIONS_NO_REVIEW)
  })
})

describe('implementing_revisions transitions (pipeline rework)', () => {
  it('offers two forward targets: client_review (re-review) and scheduling (pipeline rework)', () => {
    const fwd = legalNextSteps(RelayStep.implementing_revisions, true)
      .filter((t) => t.direction === 'forward')
      .map((t) => t.to)
      .sort()
    expect(fwd).toEqual([RelayStep.client_review, RelayStep.scheduling].sort())
  })
  it('allows forward to scheduling (pipeline rework: was sent_to_client and final_qa_schedule)', () => {
    expect(validateTransition(RelayStep.implementing_revisions, RelayStep.scheduling, true).ok).toBe(true)
  })
  it('allows forward edge to client_review so passBaton can run the re-review round (pipeline rework)', () => {
    const r = validateTransition(RelayStep.implementing_revisions, RelayStep.client_review, true)
    expect(r.ok).toBe(true)
    expect(r.direction).toBe('forward')
  })
  it('no longer routes to copy / design_revisions / revisions_complete / sent_to_client / final_qa_schedule', () => {
    for (const to of [
      RelayStep.copy,
      RelayStep.design_revisions,
      RelayStep.revisions_complete,
      RelayStep.sent_to_client,
      RelayStep.final_qa_schedule,
    ]) {
      expect(validateTransition(RelayStep.implementing_revisions, to, true).ok).toBe(false)
    }
  })
  it('no longer has a send-back edge to client_decision (retired, pipeline rework)', () => {
    // client_decision is retired; the re-review path is now revision -> client_review.
    expect(validateTransition(RelayStep.implementing_revisions, RelayStep.client_decision, true).ok).toBe(false)
  })
})

describe('checklistRowsForStep — send review link item', () => {
  it('appends a required Send review link item on am_qa_pre_client when client review is on', () => {
    const rows = checklistRowsForStep('batch-1', RelayStep.am_qa_pre_client, true)
    const sendItem = rows.find((r) => r.label === SEND_REVIEW_LINK_LABEL)
    expect(sendItem).toEqual({
      batchId: 'batch-1',
      step: RelayStep.am_qa_pre_client,
      label: SEND_REVIEW_LINK_LABEL,
      required: true,
      checked: false,
    })
    expect(rows.length).toBe(4)
  })

  it('marks the Send review link item checked when sendLinkChecked is true', () => {
    const rows = checklistRowsForStep('batch-1', RelayStep.am_qa_pre_client, true, true)
    const sendItem = rows.find((r) => r.label === SEND_REVIEW_LINK_LABEL)
    expect(sendItem?.checked).toBe(true)
  })

  it('omits the Send review link item on am_qa_pre_client when client review is off', () => {
    const rows = checklistRowsForStep('batch-1', RelayStep.am_qa_pre_client, false)
    expect(rows.some((r) => r.label === SEND_REVIEW_LINK_LABEL)).toBe(false)
    expect(rows.length).toBe(3)
  })

  it('never adds the item on am_review_design, even when client review is on', () => {
    const rows = checklistRowsForStep('batch-1', RelayStep.am_review_design, true)
    expect(rows.some((r) => r.label === SEND_REVIEW_LINK_LABEL)).toBe(false)
    expect(rows.length).toBe(5)
  })
})

describe('reseedChecklistForStep — send-link auto-check', () => {
  function makeTx(activeLink: boolean) {
    return {
      checklistItem: {
        deleteMany: vi.fn().mockResolvedValue({}),
        createMany: vi.fn().mockResolvedValue({}),
      },
      magicLink: {
        findFirst: vi.fn().mockResolvedValue(activeLink ? { id: 'ml1' } : null),
      },
    }
  }

  function sentRow(tx: ReturnType<typeof makeTx>) {
    const data = tx.checklistItem.createMany.mock.calls[0][0].data as {
      label: string
      checked: boolean
    }[]
    return data.find((r) => r.label === SEND_REVIEW_LINK_LABEL)
  }

  it('checks the Send review link item on Pre-Client QA when an active link exists', async () => {
    const tx = makeTx(true)
    await reseedChecklistForStep(tx as never, 'b1', RelayStep.am_qa_pre_client, true)
    expect(sentRow(tx)?.checked).toBe(true)
  })

  it('leaves the Send review link item unchecked when no active link exists', async () => {
    const tx = makeTx(false)
    await reseedChecklistForStep(tx as never, 'b1', RelayStep.am_qa_pre_client, true)
    expect(sentRow(tx)?.checked).toBe(false)
  })

  it('does not query magic links for non-QA steps', async () => {
    const tx = makeTx(false)
    await reseedChecklistForStep(tx as never, 'b1', RelayStep.am_review_design, true)
    expect(tx.magicLink.findFirst).not.toHaveBeenCalled()
  })
})

describe('state machine, full flow regression', () => {
  // NOTE: these two tests reference old edges (sent_to_client, client_decision,
  // ready_to_schedule) that are retired by the pipeline rework. They are updated
  // in the pipeline rework commit to point at the new edges.
  it('am_qa_pre_client forward lands on client_review when review is on (pipeline rework)', () => {
    const result = validateTransition(
      RelayStep.am_qa_pre_client,
      RelayStep.client_review,
      true,
    )
    expect(result.ok).toBe(true)
    expect(result.direction).toBe('forward')
  })

  it('client_review auto-advances to scheduling when review is on (pipeline rework)', () => {
    const result = validateTransition(
      RelayStep.client_review,
      RelayStep.scheduling,
      true,
    )
    expect(result.ok).toBe(true)
    expect(result.direction).toBe('auto')
  })
})

describe('pipeline rework: holders', () => {
  it('onboarding is AM-held', () => {
    expect(HOLDER_ROLE[RelayStep.onboarding_gate]).toBe(RelayRole.am)
  })
  it('client_review is client-held', () => {
    expect(HOLDER_ROLE[RelayStep.client_review]).toBe(RelayRole.client)
  })
  it('scheduling is AM-held', () => {
    expect(HOLDER_ROLE[RelayStep.scheduling]).toBe(RelayRole.am)
  })
})

describe('pipeline rework: with-review transitions', () => {
  it('QA advances to client_review', () => {
    expect(validateTransition(RelayStep.am_qa_pre_client, RelayStep.client_review, true).ok).toBe(true)
  })
  it('client_review advances to scheduling (auto)', () => {
    const r = validateTransition(RelayStep.client_review, RelayStep.scheduling, true)
    expect(r.ok).toBe(true)
    expect(r.direction).toBe('auto')
  })
  it('client_review advances to post revision (auto)', () => {
    expect(validateTransition(RelayStep.client_review, RelayStep.implementing_revisions, true).ok).toBe(true)
  })
  it('post revision can re-review (to client_review) or finish (to scheduling)', () => {
    const next = legalNextSteps(RelayStep.implementing_revisions, true).map((t) => t.to)
    expect(next).toContain(RelayStep.client_review)
    expect(next).toContain(RelayStep.scheduling)
  })
  it('post revision has two forward edges (re-review + schedule), both forward so passBaton accepts them', () => {
    const fwd = legalNextSteps(RelayStep.implementing_revisions, true)
      .filter((t) => t.direction === 'forward')
      .map((t) => t.to)
    expect(fwd).toContain(RelayStep.client_review)
    expect(fwd).toContain(RelayStep.scheduling)
  })
  it('scheduling completes', () => {
    expect(validateTransition(RelayStep.scheduling, RelayStep.completed, true).ok).toBe(true)
  })
  it('design_revisions re-check loop is removed (merge design steps: retired)', () => {
    expect(validateTransition(RelayStep.design_revisions, RelayStep.am_review_design, true).ok).toBe(false)
  })
  it('old sent_to_client is no longer a forward target from QA', () => {
    const allTos = legalNextSteps(RelayStep.am_qa_pre_client, true).map((t) => t.to)
    expect(allTos).not.toContain(RelayStep.sent_to_client)
  })
})

describe('pipeline rework: no-review transitions', () => {
  it('QA (Final QA) advances straight to scheduling', () => {
    expect(validateTransition(RelayStep.am_qa_pre_client, RelayStep.scheduling, false).ok).toBe(true)
  })
  it('no client_review in the no-review track', () => {
    expect(validateTransition(RelayStep.am_qa_pre_client, RelayStep.client_review, false).ok).toBe(false)
  })
  it('scheduling completes', () => {
    expect(validateTransition(RelayStep.scheduling, RelayStep.completed, false).ok).toBe(true)
  })
})
