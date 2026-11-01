export const learningGoal = 'Explain 0.3 × 0.4 = 0.12 as three tenths of four tenths: 12 overlapping hundredths on a 10 × 10 area model.'

export const evidence = [
  {
    id: 'assessment-2026-10-28', date: '2026-10-28',
    scope: 'Four classrooms · 96 responses', visibility: 'demo',
    title: 'October 28 cool-down',
    text: '68/96 correct products (71%); 29/96 adequate conceptual explanations (30%). Separate hypothetical scoring-rubric metrics; overlap between groups is unknown.',
  },
  {
    id: 'work-A', date: '2026-10-28', scope: 'One illustrative response · October cool-down',
    visibility: 'demo', title: 'A · Conceptual explanation',
    text: 'Three tenths of four tenths makes twelve hundredths, or 0.12.',
  },
  {
    id: 'work-B', date: '2026-10-28', scope: 'One illustrative response · October cool-down',
    visibility: 'demo', title: 'B · Place-value error',
    text: 'Three times four is twelve, so 0.3 × 0.4 is 1.2.',
  },
  {
    id: 'work-C', date: '2026-10-28', scope: 'One illustrative response · October cool-down',
    visibility: 'demo', title: 'C · Procedural explanation',
    text: 'I moved the decimal two places to get 0.12.',
  },
] as const

export const sourceIds = evidence.map((source) => source.id)

export const workspaceScenario = {
  id: 'fictional-grade5-decimals-2026-10-28',
  grade: 5,
  topic: 'decimal-multiplication',
  sourceIds,
} as const
