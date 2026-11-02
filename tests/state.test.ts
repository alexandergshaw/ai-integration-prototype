import { describe, expect, it } from 'vitest'
import { initialState, reducer, requestFor, type State } from '../src/features/ai-decision/state'
import { suggestionSchema, type Suggestion } from '../shared/schemas'
import { challenge, refinement, rehearsal } from './fixtures'
import { demoExample, matchesExampleScenario, validateSuggestion } from '../shared/demoExamples'
import type { CoachAction } from '../shared/schemas'

const requestId = '11111111-1111-4111-8111-111111111111'
function receive(state: State, suggestion: Suggestion) {
  const started = reducer(state, { type: 'start', id: requestId, action: suggestion.action })
  return reducer(started, { type: 'received', id: crypto.randomUUID(), requestId, suggestion, model: 'gemini-2.5-flash', at: '2026-11-01T12:00:00Z' })
}
function decide(state: State, choice: 'accepted' | 'rejected') {
  return reducer(state, { type: 'decide', choice, at: '2026-11-01T12:01:00Z' })
}
const confirmedState = {
  ...initialState, step: 3 as const, challengeDecided: true,
  confirmedInterpretation: initialState.educatorInterpretation, confirmedInquiry: initialState.inquiryDraft,
}
const inquiryState = { ...initialState, step: 2 as const, challengeDecided: true,
  confirmedInterpretation: initialState.educatorInterpretation }
const activityState = { ...confirmedState }

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
    function useCurrentGuide(state: State) {
      return reducer(state, { type: 'demo', failedRequestId: state.fallback!.id, id: crypto.randomUUID(), at: '2026-11-01T12:00:00Z' })
    }
    it.each(['challenge', 'refine_inquiry', 'suggest_activity'] as const)('validates and selects the %s fixture without changing drafts', (action) => {
      const state = failed(action === 'challenge' ? initialState : action === 'refine_inquiry' ? inquiryState : activityState, action)
      const next = useDemo(state)
      expect(suggestionSchema.safeParse(demoExample(action)).success).toBe(true)
      expect(next.pending?.suggestion).toEqual(demoExample(action))
      expect(next.pending?.origin).toBe('demo')
      expect(next.fallback).toBeNull()
      expect(next.error).toBe('')
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
      expect(reducer(state, { type: 'received', requestId, id: crypto.randomUUID(), suggestion: challenge, model: 'gemini-2.5-flash', at: '' })).toBe(state)
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
    it.each(['edit', 'step', 'start', 'cancel', 'confirmInterpretation', 'reset'] as const)('keeps guided support current on %s', (type) => {
      const state = failed()
      const next = type === 'edit' ? reducer(state, { type, field: 'educatorInterpretation', value: 'New text' }) :
        type === 'step' ? reducer(state, { type, step: 1 }) :
          type === 'start' ? reducer(state, { type, id: crypto.randomUUID(), action: 'challenge' }) :
            reducer(state, { type })
      if (type === 'start') {
        expect(next.guide).toBe(true)
        expect(next.fallback).toBeNull()
      } else if (type === 'reset') {
        expect(next.guide).toBe(false)
        expect(next.fallback).toBeNull()
      } else if (type === 'cancel') {
        expect(next.guide).toBe(true)
        expect(next.fallback?.snapshot).toEqual(requestFor(next, 'challenge', next.fallback?.id ?? ''))
      } else {
        expect(next.guide).toBe(true)
        expect(next.fallback?.snapshot).toEqual(requestFor(next, next.step === 1 ? 'challenge' : next.step === 2 ? 'refine_inquiry' : 'suggest_activity', next.fallback?.id ?? ''))
      }
      if (next.fallback) {
        expect(next.fallback.id).not.toBe(requestId)
        expect(useDemo(next).pending).toBeNull()
        expect(useCurrentGuide(next).pending).toBeTruthy()
      }
    })
    it('refreshes guide snapshots when confirmed inquiry or alignment context changes', () => {
      const state = failed(confirmedState, 'suggest_activity')
      const reconfirmed = reducer(state, { type: 'confirmInquiry' })
      expect(reconfirmed.fallback?.snapshot)
        .toEqual(requestFor(reconfirmed, 'suggest_activity', reconfirmed.fallback?.id ?? ''))
      const reviewed = reducer(state, { type: 'reviewActivity' })
      expect(reviewed.fallback?.snapshot)
        .toEqual(requestFor(reviewed, 'suggest_activity', reviewed.fallback?.id ?? ''))
      const stale = { ...state, confirmedInquiry: 'A different confirmed inquiry' }
      expect(useDemo(stale)).toBe(stale)
    })
    it('requires exact scenario metadata before example selection', () => {
      expect(matchesExampleScenario(initialState.scenario, ['assessment-2026-10-28', 'work-A', 'work-B', 'work-C'])).toBe(true)
      const mismatches = [
        { ...initialState.scenario!, grade: 4 },
        { ...initialState.scenario!, topic: 'decimal-addition' },
        { ...initialState.scenario!, sourceIds: ['assessment-2026-10-28', 'work-A', 'work-B'] },
      ]
      for (const scenario of mismatches) {
        const state = failed()
        expect(matchesExampleScenario(scenario, ['assessment-2026-10-28', 'work-A', 'work-B', 'work-C'])).toBe(false)
        const mismatchedState = { ...state, scenario }
        expect(useDemo(mismatchedState)).toBe(mismatchedState)
      }
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
    expect(reducer(state, { type: 'received', requestId, id: crypto.randomUUID(), suggestion: challenge, model: 'gemini-2.5-flash', at: '' })).toEqual(state)
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

describe('Reversible AI interpretation', () => {
  if (challenge.action !== 'challenge') throw new Error('Wrong test fixture')
  const aiText = challenge.revisedInterpretation

  it('preserves the original interpretation and selects the AI version on first acceptance', () => {
    const accepted = decide(receive(initialState, challenge), 'accepted')
    expect(accepted.interpretationSource).toBe('ai')
    expect(accepted.originalInterpretation).toBe(initialState.educatorInterpretation)
    expect(accepted.aiInterpretation).toBe(aiText)
    expect(accepted.educatorInterpretation).toBe(aiText)
  })

  it('restores the exact original without a new request and keeps the AI version available', () => {
    const accepted = decide(receive(initialState, challenge), 'accepted')
    const restored = reducer(accepted, { type: 'selectInterpretation', source: 'mine' })
    expect(restored.interpretationSource).toBe('mine')
    expect(restored.educatorInterpretation).toBe(initialState.educatorInterpretation)
    expect(restored.aiInterpretation).toBe(aiText)
    expect(restored.originalInterpretation).toBe(initialState.educatorInterpretation)
  })

  it('preserves both versions and AI edits across repeated switching', () => {
    const accepted = decide(receive(initialState, challenge), 'accepted')
    const editedAi = reducer(accepted, { type: 'edit', field: 'educatorInterpretation', value: 'AI draft, educator-edited.' })
    expect(editedAi.aiInterpretation).toBe('AI draft, educator-edited.')
    const toMine = reducer(editedAi, { type: 'selectInterpretation', source: 'mine' })
    expect(toMine.educatorInterpretation).toBe(initialState.educatorInterpretation)
    const backToAi = reducer(toMine, { type: 'selectInterpretation', source: 'ai' })
    expect(backToAi.educatorInterpretation).toBe('AI draft, educator-edited.')
    expect(backToAi.originalInterpretation).toBe(initialState.educatorInterpretation)
  })

  it('keeps the first original when a later suggestion is accepted and never auto-accepts a regeneration', () => {
    const accepted = decide(receive(initialState, challenge), 'accepted')
    const restored = reducer(accepted, { type: 'selectInterpretation', source: 'mine' })
    const regenerated = receive(restored, challenge)
    expect(regenerated.pending).not.toBeNull()
    expect(regenerated.interpretationSource).toBe('mine')
    expect(regenerated.educatorInterpretation).toBe(initialState.educatorInterpretation)
    const reaccepted = decide(regenerated, 'accepted')
    expect(reaccepted.originalInterpretation).toBe(initialState.educatorInterpretation)
    expect(reaccepted.interpretationSource).toBe('ai')
  })

  it('ignores interpretation switching before any AI version exists', () => {
    expect(reducer(initialState, { type: 'selectInterpretation', source: 'ai' })).toBe(initialState)
    expect(reducer(initialState, { type: 'selectInterpretation', source: 'mine' })).toBe(initialState)
  })
})
