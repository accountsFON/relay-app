import { describe, it, expect } from 'vitest'
import { RelayStep } from '@prisma/client'
import { nextActionForRelay } from '@/lib/relay-next-action'

const BASE = {
  clientId: 'client_1',
  batchId: 'batch_1',
  clientReviewEnabled: true,
  hasSubmittedReviewSession: false,
  reviewSessionId: null as string | null,
  assetsFolderUrl: null as string | null,
}

const PREVIEW = '/clients/client_1/batches/batch_1/preview'

describe('nextActionForRelay', () => {
  describe('in_design', () => {
    it('designer (actor) gets "Open client content" when assetsFolderUrl set', () => {
      const a = nextActionForRelay({
        ...BASE,
        step: RelayStep.in_design,
        subState: null,
        viewerRole: 'designer',
        isHolder: true,
        assetsFolderUrl: 'https://drive.example/folder',
      })
      expect(a.tone).toBe('action')
      expect(a.title).toMatch(/upload the designs/i)
      expect(a.button?.href).toBe('https://drive.example/folder')
    })

    it('designer (actor) gets no button when assetsFolderUrl missing', () => {
      const a = nextActionForRelay({
        ...BASE,
        step: RelayStep.in_design,
        subState: null,
        viewerRole: 'designer',
        isHolder: true,
      })
      expect(a.tone).toBe('action')
      expect(a.button).toBeUndefined()
    })

    it('AM (non-actor) waits', () => {
      const a = nextActionForRelay({
        ...BASE,
        step: RelayStep.in_design,
        subState: null,
        viewerRole: 'account_manager',
        isHolder: false,
      })
      expect(a.tone).toBe('waiting')
      expect(a.button).toBeUndefined()
    })
  })

  describe('am_review_design (default sub-state = AM reviews)', () => {
    it('AM (actor) gets "Review designs" -> preview', () => {
      const a = nextActionForRelay({
        ...BASE,
        step: RelayStep.am_review_design,
        subState: null,
        viewerRole: 'account_manager',
        isHolder: true,
      })
      expect(a.tone).toBe('action')
      expect(a.title).toMatch(/review the designs/i)
      expect(a.button?.href).toBe(PREVIEW)
    })

    it('admin follows the AM action', () => {
      const a = nextActionForRelay({
        ...BASE,
        step: RelayStep.am_review_design,
        subState: null,
        viewerRole: 'admin',
        isHolder: true,
      })
      expect(a.tone).toBe('action')
      expect(a.button?.href).toBe(PREVIEW)
    })

    it('designer (non-actor) waits', () => {
      const a = nextActionForRelay({
        ...BASE,
        step: RelayStep.am_review_design,
        subState: null,
        viewerRole: 'designer',
        isHolder: false,
      })
      expect(a.tone).toBe('waiting')
      expect(a.button).toBeUndefined()
    })
  })

  describe('am_review_design + awaiting_design_revisions (designer revises)', () => {
    it('designer (actor) gets "Open internal review" -> preview', () => {
      const a = nextActionForRelay({
        ...BASE,
        step: RelayStep.am_review_design,
        subState: 'awaiting_design_revisions',
        viewerRole: 'designer',
        isHolder: true,
      })
      expect(a.tone).toBe('action')
      expect(a.title).toMatch(/revise the designs/i)
      expect(a.button?.href).toBe(PREVIEW)
    })

    it('designer (actor) also exposes client content link when assetsFolderUrl set', () => {
      const a = nextActionForRelay({
        ...BASE,
        step: RelayStep.am_review_design,
        subState: 'awaiting_design_revisions',
        viewerRole: 'designer',
        isHolder: true,
        assetsFolderUrl: 'https://drive.example/folder',
      })
      expect(a.button?.href).toBe(PREVIEW)
      expect(a.secondaryButton?.href).toBe('https://drive.example/folder')
    })

    it('AM is the non-actor here and waits on design revisions, but can open the internal review', () => {
      const a = nextActionForRelay({
        ...BASE,
        step: RelayStep.am_review_design,
        subState: 'awaiting_design_revisions',
        viewerRole: 'account_manager',
        isHolder: false,
      })
      expect(a.tone).toBe('waiting')
      expect(a.title).toMatch(/waiting on design revisions/i)
      expect(a.button?.label).toMatch(/open internal review/i)
      expect(a.button?.href).toBe(PREVIEW)
    })
  })

  describe('client_review', () => {
    it('shows "View client feedback" only when a session was submitted', () => {
      const a = nextActionForRelay({
        ...BASE,
        step: RelayStep.client_review,
        subState: null,
        viewerRole: 'account_manager',
        isHolder: true,
        hasSubmittedReviewSession: true,
        reviewSessionId: 'session_9',
      })
      expect(a.button?.href).toBe(
        '/clients/client_1/batches/batch_1/review-sessions/session_9',
      )
    })

    it('has no button when no session was submitted', () => {
      const a = nextActionForRelay({
        ...BASE,
        step: RelayStep.client_review,
        subState: null,
        viewerRole: 'account_manager',
        isHolder: true,
        hasSubmittedReviewSession: false,
      })
      expect(a.button).toBeUndefined()
    })
  })

  describe('scheduling (and retired scheduling steps)', () => {
    for (const step of [
      RelayStep.scheduling,
      RelayStep.ready_to_schedule,
      RelayStep.final_qa_schedule,
    ]) {
      it(`${step} -> schedule action with no banner button (combined button is page-provided, P2 #30)`, () => {
        const a = nextActionForRelay({
          ...BASE,
          step,
          subState: null,
          viewerRole: 'account_manager',
          isHolder: true,
        })
        expect(a.tone).toBe('action')
        expect(a.button).toBeUndefined()
      })
    }
  })

  describe('completed', () => {
    it('is a done note with no button for any viewer', () => {
      const a = nextActionForRelay({
        ...BASE,
        step: RelayStep.completed,
        subState: null,
        viewerRole: 'client',
        isHolder: false,
      })
      expect(a.tone).toBe('done')
      expect(a.button).toBeUndefined()
    })
  })

  describe('on-page-only steps', () => {
    it('onboarding_gate (AM actor) has a title but no button', () => {
      const a = nextActionForRelay({
        ...BASE,
        step: RelayStep.onboarding_gate,
        subState: null,
        viewerRole: 'account_manager',
        isHolder: true,
      })
      expect(a.tone).toBe('action')
      expect(a.button).toBeUndefined()
    })

    it('copy (AM actor) has a title but no button', () => {
      const a = nextActionForRelay({
        ...BASE,
        step: RelayStep.copy,
        subState: null,
        viewerRole: 'account_manager',
        isHolder: true,
      })
      expect(a.tone).toBe('action')
      expect(a.button).toBeUndefined()
    })
  })
})
