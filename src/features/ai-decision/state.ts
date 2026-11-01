import type { Activity, CoachAction, CoachRequest, Suggestion } from '../../../shared/schemas'
import { sourceIds } from '../../../shared/evidence'

export type Decision = {
  id: string
  suggestion: Suggestion
  choice: 'awaiting decision' | 'accepted' | 'rejected' | 'not applied'
  at: string
  appliedToDraft: boolean
}
export type State = {
  educatorInterpretation: string
  inquiryDraft: string
  confirmedInquiry: string
  activityDraft: string
  confirmedActivity: string
  activityInquiry: string
  activityNeedsReview: boolean
  step: 1 | 2 | 3
  challengeDecided: boolean
  pending: { id: string; suggestion: Suggestion } | null
  request: { id: string; action: CoachAction } | null
  error: string
  decisions: Decision[]
}

export const initialState: State = {
  educatorInterpretation: 'Many students can select the correct product but may be relying on decimal-placement procedures instead of understanding place value.',
  inquiryDraft: 'How can we tell whether students understand why multiplying tenths produces hundredths?',
  confirmedInquiry: '', activityDraft: '', confirmedActivity: '', activityInquiry: '',
  activityNeedsReview: false, step: 1, challengeDecided: false,
  pending: null, request: null, error: '', decisions: [],
}

export function formatActivity(activity: Activity): string {
  return `${activity.name}\n\nObjective: ${activity.objective}\n\n${activity.steps.map((step) => `${step.minutes} min · ${step.instruction}`).join('\n')}\n\nRepresentation: ${activity.representation}\n\nFacilitator question: ${activity.facilitatorQuestion}\n\nAnticipated misconception: ${activity.anticipatedMisconception}\n\nPossible teacher response: ${activity.teacherResponse}\n\nImplementation check: ${activity.implementationCheck}`
}

export function requestFor(state: State, action: CoachAction, requestId: string): CoachRequest {
  const common = { sourceIds: [...sourceIds], requestId }
  switch (action) {
    case 'challenge': return { action, educatorInterpretation: state.educatorInterpretation, ...common }
    case 'refine_inquiry': return { action, inquiryDraft: state.inquiryDraft, ...common }
    case 'suggest_activity': return { action, confirmedInquiry: state.confirmedInquiry, ...common }
  }
}

type Event =
  | { type: 'edit'; field: 'educatorInterpretation' | 'inquiryDraft' | 'activityDraft'; value: string }
  | { type: 'step'; step: State['step'] }
  | { type: 'start'; id: string; action: CoachAction }
  | { type: 'received'; requestId: string; id: string; suggestion: Suggestion; at: string }
  | { type: 'error'; requestId: string; message: string }
  | { type: 'cancel' }
  | { type: 'decide'; choice: 'accepted' | 'rejected'; at: string }
  | { type: 'confirmInquiry' }
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
      ...discardPending(state), [event.field]: event.value, request: null, error: '',
      ...(event.field === 'activityDraft' ? { confirmedActivity: '' } : {}),
    }
    case 'step':
      if (event.step === 2 && !state.challengeDecided) return state
      if (event.step === 3 && (!state.confirmedInquiry || state.inquiryDraft.trim() !== state.confirmedInquiry)) return state
      return { ...discardPending(state), step: event.step, request: null, error: '' }
    case 'start':
      if (event.action === 'suggest_activity' && (!state.confirmedInquiry ||
        state.inquiryDraft.trim() !== state.confirmedInquiry)) return state
      return { ...discardPending(state), request: { id: event.id, action: event.action }, error: '' }
    case 'received':
      if (state.request?.id !== event.requestId || state.request.action !== event.suggestion.action) return state
      return {
        ...state, request: null, pending: { id: event.id, suggestion: event.suggestion },
        decisions: [...state.decisions, {
          id: event.id, suggestion: event.suggestion, at: event.at,
          choice: 'awaiting decision', appliedToDraft: false,
        }],
      }
    case 'error':
      return state.request?.id === event.requestId ? { ...state, request: null, error: event.message } : state
    case 'cancel': return { ...state, request: null, error: 'Request cancelled. Your work is unchanged.' }
    case 'decide': {
      if (!state.pending) return state
      const { id, suggestion } = state.pending
      let next = { ...state, pending: null, error: '' }
      if (suggestion.action === 'challenge') next = { ...next, challengeDecided: true, step: 2 }
      if (event.choice === 'accepted') {
        if (suggestion.action === 'suggest_activity') {
          next = {
            ...next, activityDraft: formatActivity(suggestion.activity), confirmedActivity: '',
            activityInquiry: state.confirmedInquiry, activityNeedsReview: false,
          }
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
    case 'confirmInquiry': {
      const inquiry = state.inquiryDraft.trim()
      if (!inquiry || state.request || state.pending) return state
      const needsReview = !!state.activityDraft && state.activityInquiry !== inquiry
      return {
        ...state, confirmedInquiry: inquiry, inquiryDraft: inquiry, step: 3,
        activityNeedsReview: needsReview,
        ...(needsReview ? { confirmedActivity: '' } : {}),
      }
    }
    case 'reviewActivity':
      return {
        ...state, activityNeedsReview: false, confirmedActivity: '',
        activityInquiry: state.confirmedInquiry,
      }
    case 'confirmActivity':
      if (!state.activityDraft.trim() || state.activityNeedsReview ||
        state.inquiryDraft.trim() !== state.confirmedInquiry || !state.confirmedInquiry) return state
      return { ...state, confirmedActivity: state.activityDraft, activityInquiry: state.confirmedInquiry }
  }
}
