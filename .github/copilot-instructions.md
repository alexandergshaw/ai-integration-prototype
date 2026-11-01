# InquiryLoop contribution boundaries

- Maintain one AI Coaching Workspace, not a complete PLC application.
- Use only fictional, de-identified Grade 5 decimal-multiplication fixtures. Keep source IDs, dates, scope, rubric context, and visibility explicit. Never infer overlap between the two assessment metrics or assert causality.
- Keep AI suggestion, educator draft, and educator confirmed states separate. Accept copies into an editable draft; Reject preserves educator work and permits progress. Confirm is an independent action. Changed confirmed inquiry invalidates activity alignment.
- AI runs only on explicit requests; never fabricate live responses or replay rejected suggestions as request context.
- Keep provider SDK, credentials, authorization, authoritative evidence reconstruction, and input/output validation server-side. Never use private `VITE_*` variables, log educator input, or add persistent data/analytics.
- Verify version-matched SDK signatures before changing provider integration. Enforce bounded request size, output budgets, timeouts, and allowlisted citations.
- Preserve responsive, semantic, keyboard-accessible navy/teal UI and mobile evidence disclosure.
- Run `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` in cloud CI. Mock the external provider in tests; do not require credentials.
- Explain deployment and review exclusively through GitHub.com and Vercel.com. Do not ask the user to install software, run local commands, or share credentials in GitHub.
