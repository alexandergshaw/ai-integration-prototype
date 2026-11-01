import { suggestionSchema, type CoachAction, type Suggestion } from './schemas'
import { sourceIds } from './evidence'

export const demoScenario: Record<CoachAction, string> = {
  challenge: 'Prepared for an interpretation that correct products may reflect decimal-placement procedures rather than place-value reasoning.',
  refine_inquiry: 'Prepared for an inquiry into how explanations reveal why multiplying tenths produces hundredths, without selecting an intervention.',
  suggest_activity: 'Prepared for an inquiry comparing area-model explanations with decimal-placement rules. Review alignment with your confirmed inquiry before confirming.',
}

const common = {
  rationale: 'Comparing explanations with a labeled area model offers a way to investigate how tenths relate to hundredths, rather than assuming a correct product establishes understanding.',
  limitations: 'These fictional October 28, 2026 responses are illustrative, not prevalence or causal evidence. The two assessment rubric metrics have unknown group overlap. This example has not demonstrated instructional effectiveness.',
  sourceIds: ['assessment-2026-10-28', 'work-A', 'work-C'],
}

const examples: Record<CoachAction, Suggestion> = {
  challenge: {
    action: 'challenge',
    evidenceConsideration: 'The four-classroom assessment reports 68/96 correct products and 29/96 adequate conceptual explanations on separate hypothetical rubrics; group overlap is unknown. Work A names hundredths conceptually, while work C describes moving the decimal.',
    alternativeHypothesis: 'One tentative alternative is that some learners could reason with a visual model but not express that reasoning in writing. The supplied responses do not establish this explanation.',
    probingQuestion: 'When a learner explains a 10 by 10 model of 0.3 times 0.4, how do they identify the unit of each overlapping cell?',
    revisedInterpretation: 'The separate rubric metrics invite investigation of place-value explanations, but do not identify which learners both calculated and explained correctly. Work C alone does not establish whether the learner understands hundredths; work A illustrates one conceptual explanation.',
    ...common,
  },
  refine_inquiry: {
    action: 'refine_inquiry',
    suggestedInquiry: 'What evidence in students\' explanations of a 10 by 10 area model distinguishes reasoning about hundredths from reliance on a decimal-placement rule for 0.3 times 0.4?',
    ...common,
  },
  suggest_activity: {
    action: 'suggest_activity',
    activity: {
      name: 'Rehearse making hundredths visible',
      objective: 'Practice eliciting an explanation of why three tenths of four tenths is twelve hundredths, without treating procedural wording as proof of a misconception.',
      steps: [
        { minutes: 3, instruction: 'Individually label a whole 10 by 10 grid, shade four rows as four tenths, and mark three tenths of that region using three columns. Label the overlap.' },
        { minutes: 7, instruction: 'In pairs, alternate teacher and learner roles. Rehearse connecting each dimension to tenths and each overlapping cell to one hundredth. Use the two discussion prompts and ask the partner to explain the unit.' },
        { minutes: 5, instruction: 'Compare the illustrative explanations in work A and work C. Rehearse a neutral follow-up that could reveal reasoning behind procedural wording; identify evidence to examine afterward.' },
      ],
      representation: '0.3 × 0.4 = 0.12; three tenths of four tenths; 12 overlapping hundredths on a 10 × 10 area model.',
      discussionPrompts: [
        'Why does each overlapping cell represent one hundredth of the whole rather than one tenth?',
        'How do the dimensions and overlap explain why three tenths of four tenths is 0.12?',
      ],
      anticipatedMisconception: 'A learner might name twelve overlapping cells as twelve tenths without considering the whole; this is a possibility to probe, not a diagnosis of the group.',
      teachersPractice: 'Name the whole, connect the two dimensions to tenths, and ask for an explanation of the overlap without supplying the learner\'s reasoning.',
      studentEvidence: 'Afterward, examine labeled grids and explanations identifying the whole, each dimension, and the unit of the overlap. Compare reasoning, not just correct products; do not infer effectiveness from this rehearsal.',
    },
    ...common,
  },
}

export function validateSuggestion(value: unknown, action: CoachAction, allowedIds: readonly string[] = sourceIds): Suggestion {
  const suggestion = suggestionSchema.parse(value)
  if (suggestion.action !== action || new Set(suggestion.sourceIds).size !== suggestion.sourceIds.length ||
    suggestion.sourceIds.some((id) => !allowedIds.includes(id))) {
    throw new Error('The suggestion or its citations could not be verified. Your work is unchanged.')
  }
  return suggestion
}

export function demoExample(action: CoachAction): Suggestion {
  return validateSuggestion(examples[action], action)
}
