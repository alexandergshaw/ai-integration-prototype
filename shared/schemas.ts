import { z } from 'zod'

const text = z.string().trim().min(1).max(2000)
const references = z.array(z.string().min(1).max(80)).min(1).max(3)
const common = {
  rationale: z.string().min(1).max(1200),
  limitations: z.string().min(1).max(1200),
  sourceIds: references,
}

export const challengeSchema = z.object({
  action: z.literal('challenge'),
  evidenceConsideration: z.string().min(1).max(1200),
  alternativeHypothesis: z.string().min(1).max(1200),
  probingQuestion: text,
  revisedInterpretation: text,
  ...common,
}).strict()

export const refineSchema = z.object({
  action: z.literal('refine_inquiry'),
  suggestedInquiry: text,
  ...common,
}).strict()

export const activitySchema = z.object({
  action: z.literal('suggest_activity'),
  activity: z.object({
    name: z.string().min(1).max(160),
    objective: z.string().min(1).max(600),
    steps: z.array(z.object({
      minutes: z.number().int().min(1).max(15),
      instruction: z.string().min(1).max(600),
    }).strict()).min(2).max(6),
    representation: z.literal('0.3 × 0.4 = 0.12; three tenths of four tenths; 12 overlapping hundredths on a 10 × 10 area model.'),
    discussionPrompts: z.array(z.string().min(1).max(600)).length(2),
    anticipatedMisconception: z.string().min(1).max(600),
    teachersPractice: z.string().min(1).max(600),
    studentEvidence: z.string().min(1).max(600),
  }).strict(),
  ...common,
}).strict()

export const suggestionSchema = z.discriminatedUnion('action', [
  challengeSchema, refineSchema, activitySchema,
]).superRefine((suggestion, context) => {
  if (suggestion.action === 'suggest_activity' &&
    suggestion.activity.steps.reduce((sum, step) => sum + step.minutes, 0) !== 15) {
    context.addIssue({ code: 'custom', message: 'Rehearsal segments must total 15 minutes.' })
  }
})

const requestCommon = {
  sourceIds: z.array(z.string().min(1).max(80)).min(1).max(4),
  requestId: z.uuid(),
}
export const coachRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('challenge'), educatorInterpretation: text, ...requestCommon }).strict(),
  z.object({
    action: z.literal('refine_inquiry'), confirmedInterpretation: text, inquiryDraft: text, ...requestCommon,
  }).strict(),
  z.object({ action: z.literal('suggest_activity'), confirmedInquiry: text, ...requestCommon }).strict(),
])
export type CoachRequest = z.infer<typeof coachRequestSchema>
export type Suggestion = z.infer<typeof suggestionSchema>
export type CoachAction = Suggestion['action']
export type Activity = z.infer<typeof activitySchema>['activity']

export const coachResponseSchema = z.object({
  id: z.uuid(), requestId: z.uuid(), suggestion: suggestionSchema,
}).strict()
