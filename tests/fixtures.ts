import type { Suggestion } from '../shared/schemas'

const common = {
  rationale: 'Compare explanations with the area model to investigate how students connect tenths to hundredths.',
  limitations: 'Fictional illustrative responses do not establish prevalence or causality. The two rubric groups have unknown overlap.',
  sourceIds: ['assessment-2026-10-28', 'work-C'],
}
export const challenge: Suggestion = {
  action: 'challenge',
  alternativeHypothesis: 'Students may understand the product visually but need support expressing that reasoning.',
  probingQuestion: 'What does a student explanation of the overlapping hundredths reveal?',
  suggestedInquiry: 'How do students connect overlapping tenths to twelve hundredths?',
  ...common,
}
export const refinement: Suggestion = {
  action: 'refine_inquiry',
  suggestedInquiry: 'What evidence in students’ area-model explanations distinguishes place-value reasoning from a decimal-placement rule?',
  ...common,
}
export const rehearsal: Suggestion = {
  action: 'suggest_activity',
  activity: {
    name: 'Rehearse an area-model explanation',
    objective: 'Connect three tenths of four tenths to twelve hundredths.',
    steps: [
      { minutes: 3, instruction: 'Individually shade three columns and four rows of a 10 × 10 grid.' },
      { minutes: 7, instruction: 'In pairs, rehearse explaining why twelve overlapping cells are hundredths.' },
      { minutes: 5, instruction: 'Compare conceptual and procedural explanations and rehearse a probing question.' },
    ],
    representation: '0.3 × 0.4 = 0.12; three tenths of four tenths; 12 overlapping hundredths on a 10 × 10 area model.',
    facilitatorQuestion: 'Why is each overlapping cell a hundredth of the whole?',
    anticipatedMisconception: 'Treating twelve cells as twelve tenths.',
    teacherResponse: 'Ask students to identify the whole and count its hundred equal cells.',
    implementationCheck: 'Ask a partner to explain the unit of each overlapping cell without a decimal rule.',
  },
  ...common,
}
