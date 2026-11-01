import { describe, expect, it } from 'vitest'
import { initialState, reducer, requestFor, type State } from '../src/features/ai-decision/state'
import { suggestionSchema, type Suggestion } from '../shared/schemas'
import { challenge, refinement, rehearsal } from './fixtures'
import { demoExample, validateSuggestion } from '../shared/demoExamples'
import type { CoachAction } from '../shared/schemas'

const requestId = '11111111-1111-4111-8111-111111111111'
function receive(state: State, suggestion: Suggestion) {
  const started = reducer(state, { type: 'start', id: requestId, action: suggestion.action })
  return reducer(started, { type: 'received', id: crypto.randomUUID(), requestId, suggestion, at: '2026-11-01T12:00:00Z' })
}
function decide(state: State, choice: 'accepted' | 'rejected') {
  return reducer(state, { type: 'decide', choice, at: '2026-11-01T12:01:00Z' })
}
const confirmedState = {
  ...initialState, step: 3 as const, challengeDecided: true,
  confirmedInterpretation: initialState.educatorInterpretation, confirmedInquiry: initialState.inquiryDraft,
}

describe('All six educator decisions', () => {
  it('accepts challenge into an editable interpretation draft without confirming it', () => {
    const next = decide(receive(initialState, challenge), 'accepted')
    expect(next.educatorInterpretation).toBe(challenge.action === 'challenge' && challenge.revisedInterpretation)
    expect(next.confirmedInterpretation).toBe('')
    expect(next.confirmedInquiry).toBe('')
    expect(next.step).toBe(1)
    expect(reducer(next, { type: 'confirmInterpretation' }).confirmedInterpretation).toBe(next.educatorInterpretation)
  })
  it('rejects challenge without changing educator work or blocking progress', () => {
    const next = decide(receive(initialState, challenge), 'rejected')
    expect(next.inquiryDraft).toBe(initialState.inquiryDraft)
    expect(next.educatorInterpretation).toBe(initialState.educatorInterpretation)
    expect(next.step).toBe(1)
    const progressed = reducer(next, { type: 'confirmInterpretation' })
    expect(requestFor(progressed, 'refine_inquiry', requestId)).toEqual({
      action: 'refine_inquiry', confirmedInterpretation: initialState.educatorInterpretation,
      inquiryDraft: initialState.inquiryDraft,
      requestId, sourceIds: ['assessment-2026-10-28', 'work-A', 'work-B', 'work-C'],
    })
  })
  it('accepts refinement into draft without automatic confirmation', () => {
    const confirmed = reducer(initialState, { type: 'confirmInterpretation' })
    const next = decide(receive(confirmed, refinement), 'accepted')
    expect(next.inquiryDraft).toBe(refinement.action === 'refine_inquiry' && refinement.suggestedInquiry)
    expect(next.confirmedInquiry).toBe('')
    expect(reducer(next, { type: 'confirmInquiry' }).confirmedInquiry).toBe(next.inquiryDraft)
  })
  it('rejects refinement and keeps prior draft and confirmation', () => {
    const state = { ...confirmedState, inquiryDraft: 'My educator-edited question' }
    const next = decide(receive(state, refinement), 'rejected')
    expect(next.inquiryDraft).toBe(state.inquiryDraft)
    expect(next.confirmedInquiry).toBe(state.confirmedInquiry)
  })
  it('accepts one 15-minute activity into an editable, unconfirmed draft', () => {
    const next = decide(receive(confirmedState, rehearsal), 'accepted')
    expect(next.activityDraft).toContain('3 min')
    expect(next.activityDraft).toContain('7 min')
    expect(next.activityDraft).toContain('5 min')
    expect(next.confirmedActivity).toBe('')
    expect(reducer(next, { type: 'confirmActivity' }).confirmedActivity).toBe(next.activityDraft)
  })
  it('rejects activity and retains educator-authored activity', () => {
    const state = { ...confirmedState, activityDraft: 'My own rehearsal', confirmedActivity: 'My own rehearsal' }
    const next = decide(receive(state, rehearsal), 'rejected')
    expect(next.activityDraft).toBe(state.activityDraft)
    expect(next.confirmedActivity).toBe(state.confirmedActivity)
    expect(next.decisions[0].appliedToDraft).toBe(false)
  })
})

describe('Confirmation and stale-response boundaries', () => {
  it('permits educator-only progress without inventing an AI decision', () => {
    const next = reducer(initialState, { type: 'continueWithoutChallenge' })
    expect(next.step).toBe(2)
    expect(next.confirmedInterpretation).toBe(initialState.educatorInterpretation)
    expect(next.inquiryDraft).toBe(initialState.inquiryDraft)
    expect(next.decisions).toEqual([])
    expect(next.confirmedInquiry).toBe('')
  })

  describe('Manual demo fallback transitions', () => {
    function failed(state = initialState, action: CoachAction = 'challenge', eligible = true) {
      return reducer(reducer(state, { type: 'start', id: requestId, action }), {
        type: 'error', requestId, message: 'Gemini unavailable.', eligible,
      })
    }
    function useDemo(state: State) {
      return reducer(state, { type: 'demo', failedRequestId: requestId, id: crypto.randomUUID(), at: '2026-11-01T12:00:00Z' })
    }
    it.each(['challenge', 'refine_inquiry', 'suggest_activity'] as const)('validates and selects the %s fixture without changing drafts', (action) => {
      const state = failed(confirmedState, action)
      const next = useDemo(state)
      expect(suggestionSchema.safeParse(demoExample(action)).success).toBe(true)
      expect(next.pending?.suggestion).toEqual(demoExample(action))
      expect(next.pending?.origin).toBe('demo')
      expect(next.fallback).toBeNull()
      expect(next.error).toBe('Gemini unavailable.')
      expect(next.educatorInterpretation).toBe(state.educatorInterpretation)
      expect(next.inquiryDraft).toBe(state.inquiryDraft)
      expect(next.activityDraft).toBe(state.activityDraft)
      const rejected = decide(next, 'rejected')
      expect(rejected.decisions[0]).toMatchObject({ origin: 'demo', choice: 'rejected', appliedToDraft: false })
      expect(rejected.activityDraft).toBe(state.activityDraft)
      expect(rejected.inquiryDraft).toBe(state.inquiryDraft)
      expect(rejected.educatorInterpretation).toBe(state.educatorInterpretation)
    })
    it('uses the exact activity math, fifteen minutes, two prompts and unique allowlisted sources', () => {
      const example = demoExample('suggest_activity')
      if (example.action !== 'suggest_activity') throw new Error('Wrong example')
      expect(example.activity.steps.reduce((sum, step) => sum + step.minutes, 0)).toBe(15)
      expect(example.activity.discussionPrompts).toHaveLength(2)
      expect(example.activity.representation).toBe('0.3 × 0.4 = 0.12; three tenths of four tenths; 12 overlapping hundredths on a 10 × 10 area model.')
      for (const action of ['challenge', 'refine_inquiry', 'suggest_activity'] as const) {
        const fixture = demoExample(action)
        expect(validateSuggestion(fixture, action)).toEqual(fixture)
        expect(new Set(fixture.sourceIds).size).toBe(fixture.sourceIds.length)
        expect(() => validateSuggestion({ ...fixture, sourceIds: ['work-A', 'work-A'] }, action)).toThrow()
        expect(() => validateSuggestion({ ...fixture, sourceIds: ['invented'] }, action)).toThrow()
      }
    })
    it('requires eligibility, ignores double-clicks and late success/error, and uses unique suggestion IDs', () => {
      expect(useDemo(initialState)).toBe(initialState)
      expect(useDemo(failed(initialState, 'challenge', false)).pending).toBeNull()
      const state = useDemo(failed())
      expect(useDemo(state)).toBe(state)
      expect(state.decisions).toHaveLength(1)
      expect(reducer(state, { type: 'received', requestId, id: crypto.randomUUID(), suggestion: challenge, at: '' })).toBe(state)
      expect(reducer(state, { type: 'error', requestId, message: 'Late failure', eligible: true })).toBe(state)
      const next = useDemo(failed(decide(state, 'rejected')))
      expect(next.pending?.id).not.toBe(state.pending?.id)
    })
    it('preserves accepted-draft provenance through edits and confirmation, with separate alignment review', () => {
      let state = decide(useDemo(failed(confirmedState, 'suggest_activity')), 'accepted')
      expect(state.confirmedActivity).toBe('')
      expect(state.activityNeedsReview).toBe(true)
      expect(state.activityInquiry).toBe('')
      expect(state.draftSources.activityDraft).toMatchObject({ origin: 'demo', id: state.decisions[0].id })
      state = reducer(state, { type: 'edit', field: 'activityDraft', value: `${state.activityDraft}\nEducator adjustment` })
      expect(state.draftSources.activityDraft?.origin).toBe('demo')
      expect(reducer(state, { type: 'confirmActivity' }).confirmedActivity).toBe('')
      state = reducer(state, { type: 'reviewActivity' })
      state = reducer(state, { type: 'confirmActivity' })
      expect(state.confirmedActivity).toBe(state.activityDraft)
      expect(state.decisions[0]).toMatchObject({ origin: 'demo', choice: 'accepted' })
      state = reducer(state, { type: 'edit', field: 'inquiryDraft', value: 'How do learners identify the whole?' })
      state = reducer(state, { type: 'confirmInquiry' })
      expect(state.activityNeedsReview).toBe(true)
      expect(state.confirmedActivity).toBe('')
    })
    it.each(['edit', 'step', 'start', 'cancel', 'confirmInterpretation', 'reset'] as const)('invalidates eligibility on %s', (type) => {
      const state = failed()
      const next = type === 'edit' ? reducer(state, { type, field: 'educatorInterpretation', value: 'New text' }) :
        type === 'step' ? reducer(state, { type, step: 1 }) :
          type === 'start' ? reducer(state, { type, id: crypto.randomUUID(), action: 'challenge' }) :
            reducer(state, { type })
      expect(next.fallback).toBeNull()
      expect(useDemo(next).pending).toBeNull()
    })
    it('invalidates eligibility when confirmed inquiry or alignment context changes', () => {
      const state = failed(confirmedState, 'suggest_activity')
      expect(reducer(state, { type: 'confirmInquiry' }).fallback).toBeNull()
      expect(reducer(state, { type: 'reviewActivity' }).fallback).toBeNull()
      const stale = { ...state, confirmedInquiry: 'A different confirmed inquiry' }
      expect(useDemo(stale)).toBe(stale)
    })
    it('does not make successful requests eligible and records live provenance separately', () => {
      const state = receive(initialState, challenge)
      expect(state.fallback).toBeNull()
      expect(state.pending?.origin).toBe('gemini')
      expect(state.decisions[0].origin).toBe('gemini')
    })
  })
  it('requires confirmed inquiry for activity requests', () => {
    expect(reducer(initialState, { type: 'start', id: requestId, action: 'suggest_activity' })).toEqual(initialState)
  })
  it('requires a confirmed interpretation before refining a PLC question', () => {
    expect(requestFor(initialState, 'refine_inquiry', requestId)).toMatchObject({
      confirmedInterpretation: '',
    })
    expect(reducer(initialState, { type: 'step', step: 2 })).toEqual(initialState)
    expect(reducer(initialState, { type: 'start', id: requestId, action: 'refine_inquiry' })).toEqual(initialState)
  })
  it('uses confirmed inquiry only, without rejected suggestions or interpretations', () => {
    expect(requestFor(confirmedState, 'suggest_activity', requestId)).toEqual({
      action: 'suggest_activity', confirmedInquiry: initialState.inquiryDraft,
      sourceIds: ['assessment-2026-10-28', 'work-A', 'work-B', 'work-C'], requestId,
    })
  })
  it('marks accepted activity Needs review when confirmed inquiry changes', () => {
    let state = decide(receive(confirmedState, rehearsal), 'accepted')
    state = reducer(state, { type: 'confirmActivity' })
    state = reducer(state, { type: 'edit', field: 'inquiryDraft', value: 'What do students think one cell represents?' })
    expect(state.activityNeedsReview).toBe(false)
    state = reducer(state, { type: 'confirmInquiry' })
    expect(state.activityNeedsReview).toBe(true)
    expect(state.confirmedActivity).toBe('')
    expect(reducer(state, { type: 'confirmActivity' }).confirmedActivity).toBe('')
    state = reducer(state, { type: 'reviewActivity' })
    expect(reducer(state, { type: 'confirmActivity' }).confirmedActivity).toBe(state.activityDraft)
  })
  it('invalidates inquiry and activity alignment when a changed interpretation is confirmed', () => {
    const state = {
      ...confirmedState, activityDraft: 'A prior rehearsal', confirmedActivity: 'A prior rehearsal',
    }
    const edited = reducer(state, { type: 'edit', field: 'educatorInterpretation', value: 'A revised educator interpretation.' })
    expect(edited.confirmedInquiry).toBe(state.confirmedInquiry)
    const confirmed = reducer(edited, { type: 'confirmInterpretation' })
    expect(confirmed.confirmedInterpretation).toBe('A revised educator interpretation.')
    expect(confirmed.confirmedInquiry).toBe('')
    expect(confirmed.activityNeedsReview).toBe(true)
    expect(confirmed.confirmedActivity).toBe('')
  })
  it('does not invalidate activity when the same inquiry is confirmed', () => {
    const accepted = decide(receive(confirmedState, rehearsal), 'accepted')
    expect(reducer(accepted, { type: 'confirmInquiry' }).activityNeedsReview).toBe(false)
  })
  it('editing input discards pending suggestion and ignores late responses', () => {
    let state = receive(initialState, challenge)
    state = reducer(state, { type: 'edit', field: 'educatorInterpretation', value: 'A different hypothesis' })
    expect(state.pending).toBeNull()
    expect(state.decisions[0].choice).toBe('not applied')
    expect(reducer(state, { type: 'received', requestId, id: crypto.randomUUID(), suggestion: challenge, at: '' })).toEqual(state)
  })
  it('editing activity clears confirmation and reset clears session state', () => {
    const confirmed = reducer(decide(receive(confirmedState, rehearsal), 'accepted'), { type: 'confirmActivity' })
    expect(reducer(confirmed, { type: 'edit', field: 'activityDraft', value: 'Adjusted' }).confirmedActivity).toBe('')
    expect(reducer(confirmed, { type: 'reset' })).toEqual(initialState)
  })
  it('rejects an invalid rehearsal duration at shared validation boundary', () => {
    if (rehearsal.action !== 'suggest_activity') throw new Error('Wrong test fixture')
    expect(suggestionSchema.safeParse({ ...rehearsal, activity: { ...rehearsal.activity, steps: [{ minutes: 5, instruction: 'A' }, { minutes: 4, instruction: 'B' }] } }).success).toBe(false)
  })
})
