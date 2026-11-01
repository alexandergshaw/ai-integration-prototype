import type { Activity, CoachAction, CoachRequest, Suggestion } from '../../../shared/schemas'
import { sourceIds } from '../../../shared/evidence'
import { demoExample } from '../../../shared/demoExamples'

export type Origin = 'gemini' | 'demo'
type SuggestionRecord = { id: string; suggestion: Suggestion; origin: Origin }
type FailedRequest = { id: string; action: CoachAction; snapshot: CoachRequest; step: State['step'] }

export type Decision = {
  id: string
  suggestion: Suggestion
  choice: 'awaiting decision' | 'accepted' | 'rejected' | 'not applied'
  at: string
  appliedToDraft: boolean
  origin: Origin
}
export type State = {
  educatorInterpretation: string
  confirmedInterpretation: string
  inquiryDraft: string
  confirmedInquiry: string
  activityDraft: string
  confirmedActivity: string
  activityInquiry: string
  activityNeedsReview: boolean
  step: 1 | 2 | 3
  challengeDecided: boolean
  pending: SuggestionRecord | null
  request: FailedRequest | null
  fallback: FailedRequest | null
  draftSources: Partial<Record<'educatorInterpretation' | 'inquiryDraft' | 'activityDraft', SuggestionRecord>>
  error: string
  decisions: Decision[]
}

export const initialState: State = {
  educatorInterpretation: 'Many students can select the correct product but may be relying on decimal-placement procedures instead of understanding place value.',
  confirmedInterpretation: '',
  inquiryDraft: 'How can we tell whether students understand why multiplying tenths produces hundredths?',
  confirmedInquiry: '', activityDraft: '', confirmedActivity: '', activityInquiry: '',
  activityNeedsReview: false, step: 1, challengeDecided: false,
  pending: null, request: null, fallback: null, draftSources: {}, error: '', decisions: [],
}

export function formatActivity(activity: Activity): string {
  return `${activity.name}\n\nObjective: ${activity.objective}\n\n${activity.steps.map((step) => `${step.minutes} min · ${step.instruction}`).join('\n')}\n\nRepresentation: ${activity.representation}\n\nDiscussion prompts:\n${activity.discussionPrompts.map((prompt) => `- ${prompt}`).join('\n')}\n\nAnticipated misconception: ${activity.anticipatedMisconception}\n\nWhat teachers practice: ${activity.teachersPractice}\n\nStudent evidence to examine afterward: ${activity.studentEvidence}`
}

export function requestFor(state: State, action: CoachAction, requestId: string): CoachRequest {
  const common = { sourceIds: [...sourceIds], requestId }
  switch (action) {
    case 'challenge': return { action, educatorInterpretation: state.educatorInterpretation, ...common }
    case 'refine_inquiry': return {
      action, confirmedInterpretation: state.confirmedInterpretation, inquiryDraft: state.inquiryDraft, ...common,
    }
    case 'suggest_activity': return { action, confirmedInquiry: state.confirmedInquiry, ...common }
  }
}

type Event =
  | { type: 'edit'; field: 'educatorInterpretation' | 'inquiryDraft' | 'activityDraft'; value: string }
  | { type: 'step'; step: State['step'] }
  | { type: 'start'; id: string; action: CoachAction }
  | { type: 'received'; requestId: string; id: string; suggestion: Suggestion; at: string }
  | { type: 'error'; requestId: string; message: string; eligible?: boolean }
  | { type: 'demo'; failedRequestId: string; id: string; at: string }
  | { type: 'cancel' }
  | { type: 'decide'; choice: 'accepted' | 'rejected'; at: string }
  | { type: 'confirmInterpretation' }
  | { type: 'confirmInquiry' }
  | { type: 'continueWithoutChallenge' }
  | { type: 'confirmActivity' }
  | { type: 'reviewActivity' }
  | { type: 'reset' }

function discardPending(state: State): State {
  return {
    ...state, pending: null,
    decisions: state.decisions.map((decision) =>
      decision.id === state.pending?.id ? { ...decision, choice: 'not applied' } : decision),
  }
}

export function reducer(state: State, event: Event): State {
  switch (event.type) {
    case 'reset': return { ...initialState }
    case 'edit': return {
      ...discardPending(state), [event.field]: event.value, request: null, fallback: null, error: '',
      ...(event.field === 'activityDraft' ? { confirmedActivity: '' } : {}),
      ...(event.field === 'educatorInterpretation' ? { challengeDecided: false, step: 1 as const } : {}),
    }
    case 'step':
      if (event.step === 2 && (!state.challengeDecided ||
        !state.confirmedInterpretation || state.educatorInterpretation.trim() !== state.confirmedInterpretation)) return state
      if (event.step === 3 && (!state.confirmedInterpretation ||
        state.educatorInterpretation.trim() !== state.confirmedInterpretation ||
        !state.confirmedInquiry || state.inquiryDraft.trim() !== state.confirmedInquiry)) return state
      return { ...discardPending(state), step: event.step, request: null, fallback: null, error: '' }
    case 'start':
      if (event.action === 'refine_inquiry' && (!state.confirmedInterpretation ||
        state.educatorInterpretation.trim() !== state.confirmedInterpretation)) return state
      if (event.action === 'suggest_activity' && (!state.confirmedInterpretation ||
        state.educatorInterpretation.trim() !== state.confirmedInterpretation ||
        !state.confirmedInquiry ||
        state.inquiryDraft.trim() !== state.confirmedInquiry)) return state
      return { ...discardPending(state), request: {
        id: event.id, action: event.action, snapshot: requestFor(state, event.action, event.id), step: state.step,
      }, fallback: null, error: '' }
    case 'received':
      if (state.request?.id !== event.requestId || state.request.action !== event.suggestion.action) return state
      return {
        ...state, request: null, fallback: null, pending: { id: event.id, suggestion: event.suggestion, origin: 'gemini' },
        decisions: [...state.decisions, {
          id: event.id, suggestion: event.suggestion, at: event.at,
          choice: 'awaiting decision', appliedToDraft: false, origin: 'gemini',
        }],
      }
    case 'error':
      return state.request?.id === event.requestId ? {
        ...state, request: null, error: event.message, fallback: event.eligible ? state.request : null,
      } : state
    case 'demo': {
      const failed = state.fallback
      if (!failed || failed.id !== event.failedRequestId || state.request || state.pending ||
        failed.step !== state.step ||
        JSON.stringify(failed.snapshot) !== JSON.stringify(requestFor(state, failed.action, failed.id))) return state
      let suggestion: Suggestion
      try {
        suggestion = demoExample(failed.action)
      } catch {
        return { ...state, fallback: null, error: 'The demo example failed validation. Your work is unchanged; continue with your draft.' }
      }
      const record: SuggestionRecord = { id: event.id, suggestion, origin: 'demo' }
      return {
        ...state, fallback: null, request: null, pending: record,
        decisions: [...state.decisions, { ...record, at: event.at, choice: 'awaiting decision', appliedToDraft: false }],
      }
    }
    case 'cancel': return { ...state, request: null, fallback: null, error: 'Request cancelled. Your work is unchanged.' }
    case 'continueWithoutChallenge':
      return reducer(state, { type: 'confirmInterpretation' })
    case 'decide': {
      if (!state.pending) return state
      const { id, suggestion } = state.pending
      let next = { ...state, pending: null, error: '' }
      if (suggestion.action === 'challenge') next = { ...next, challengeDecided: true }
      if (event.choice === 'accepted') {
        const field = suggestion.action === 'challenge' ? 'educatorInterpretation' :
          suggestion.action === 'refine_inquiry' ? 'inquiryDraft' : 'activityDraft'
        next = { ...next, draftSources: { ...state.draftSources, [field]: state.pending } }
        if (suggestion.action === 'suggest_activity') {
          next = {
            ...next, activityDraft: formatActivity(suggestion.activity), confirmedActivity: '',
            activityInquiry: state.pending.origin === 'demo' ? '' : state.confirmedInquiry,
            activityNeedsReview: state.pending.origin === 'demo',
          }
        } else if (suggestion.action === 'challenge') {
          next = { ...next, educatorInterpretation: suggestion.revisedInterpretation }
        } else {
          next = { ...next, inquiryDraft: suggestion.suggestedInquiry }
        }
      }
      return {
        ...next,
        decisions: state.decisions.map((decision) => decision.id === id
          ? { ...decision, choice: event.choice, at: event.at, appliedToDraft: event.choice === 'accepted' }
          : decision),
      }
    }
    case 'confirmInterpretation': {
      const interpretation = state.educatorInterpretation.trim()
      if (!interpretation || state.request || state.pending) return state
      const changed = !!state.confirmedInterpretation && interpretation !== state.confirmedInterpretation
      return {
        ...state, confirmedInterpretation: interpretation, challengeDecided: true, step: 2, error: '', fallback: null,
        ...(changed ? {
          confirmedInquiry: '', activityNeedsReview: !!state.activityDraft, confirmedActivity: '',
        } : {}),
      }
    }
    case 'confirmInquiry': {
      const inquiry = state.inquiryDraft.trim()
      if (!inquiry || state.request || state.pending || !state.confirmedInterpretation ||
        state.educatorInterpretation.trim() !== state.confirmedInterpretation) return state
      const needsReview = !!state.activityDraft && (state.activityNeedsReview || state.activityInquiry !== inquiry)
      return {
        ...state, confirmedInquiry: inquiry, inquiryDraft: inquiry, step: 3, fallback: null, error: '',
        activityNeedsReview: needsReview,
        ...(needsReview ? { confirmedActivity: '' } : {}),
      }
    }
    case 'reviewActivity':
      return {
        ...state, activityNeedsReview: false, confirmedActivity: '', fallback: null,
        activityInquiry: state.confirmedInquiry,
      }
    case 'confirmActivity':
      if (!state.activityDraft.trim() || state.activityNeedsReview || !state.confirmedInterpretation ||
        state.educatorInterpretation.trim() !== state.confirmedInterpretation ||
        state.inquiryDraft.trim() !== state.confirmedInquiry || !state.confirmedInquiry) return state
      return { ...state, confirmedActivity: state.activityDraft, activityInquiry: state.confirmedInquiry, fallback: null }
  }
}
