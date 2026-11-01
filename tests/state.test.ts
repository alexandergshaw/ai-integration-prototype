import { describe, expect, it } from 'vitest'
import { initialState, reducer, requestFor, type State } from '../src/features/ai-decision/state'
import { suggestionSchema, type Suggestion } from '../shared/schemas'
import { challenge, refinement, rehearsal } from './fixtures'

const requestId = '11111111-1111-4111-8111-111111111111'
function receive(state: State, suggestion: Suggestion) {
  const started = reducer(state, { type: 'start', id: requestId, action: suggestion.action })
  return reducer(started, { type: 'received', id: crypto.randomUUID(), requestId, suggestion, at: '2026-11-01T12:00:00Z' })
}
function decide(state: State, choice: 'accepted' | 'rejected') {
  return reducer(state, { type: 'decide', choice, at: '2026-11-01T12:01:00Z' })
}
const confirmedState = { ...initialState, step: 3 as const, challengeDecided: true, confirmedInquiry: initialState.inquiryDraft }

describe('All six educator decisions', () => {
  it('accepts challenge only into inquiry draft, preserving interpretation', () => {
    const next = decide(receive(initialState, challenge), 'accepted')
    expect(next.inquiryDraft).toBe(challenge.action === 'challenge' && challenge.suggestedInquiry)
    expect(next.educatorInterpretation).toBe(initialState.educatorInterpretation)
    expect(next.confirmedInquiry).toBe('')
    expect(next.step).toBe(2)
  })
  it('rejects challenge without changing educator work or blocking progress', () => {
    const next = decide(receive(initialState, challenge), 'rejected')
    expect(next.inquiryDraft).toBe(initialState.inquiryDraft)
    expect(next.educatorInterpretation).toBe(initialState.educatorInterpretation)
    expect(next.step).toBe(2)
    expect(requestFor(next, 'refine_inquiry', requestId)).toEqual({
      action: 'refine_inquiry', inquiryDraft: initialState.inquiryDraft,
      requestId, sourceIds: ['assessment-2026-10-28', 'work-A', 'work-B', 'work-C'],
    })
  })
  it('accepts refinement into draft without automatic confirmation', () => {
    const next = decide(receive(initialState, refinement), 'accepted')
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
  it('requires confirmed inquiry for activity requests', () => {
    expect(reducer(initialState, { type: 'start', id: requestId, action: 'suggest_activity' })).toEqual(initialState)
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
