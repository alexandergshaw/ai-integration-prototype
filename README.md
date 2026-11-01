# Inquiry

**AI challenges the reasoning; educators own the decision.**

A personal, fictional interview prototype: one AI Coaching Workspace, three independently requested Gemini API interactions, and explicit educator decisions. Not a Leading Educators product, partnership, or endorsement.

## What works

1. **Challenge my interpretation** compares the educator's thinking with cited fictional evidence, offers a tentative counterhypothesis and probing question, and drafts a possible revision. Accept copies that revision into an editable interpretation; Reject preserves the educator's wording. **Confirm interpretation** is a separate educator action.
2. **Suggest a stronger PLC question** uses only the confirmed interpretation and current educator-authored question. Accept copies one focused question into the editable draft; Reject leaves it unchanged. **Confirm inquiry** is another independent action.
3. **Suggest a PLC activity** uses only the confirmed inquiry and approved evidence to suggest one 15-minute math rehearsal with two discussion prompts, teacher practice, and possible student evidence to examine. Accept copies it into an editable preview; Reject preserves educator work. **Confirm activity** means choosing to bring this rehearsal to discussion. Changing the confirmed inquiry marks an accepted activity **Needs review**.

AI runs only on a button click. Errors never replace educator work with a scripted answer. Sources, uncertainty, response history, and decisions are visible. State is ephemeral React memory: refresh, lock, or reset clears drafts; no database, local storage, analytics, or student accounts.

## Deploy entirely in your browser

1. On **GitHub.com**, review the Copilot cloud agent's implementation pull request, its checks, and verification notes. Request changes there if needed; merge when ready.
2. On **Vercel.com → Dashboard → Add New → Project**, import `alexandergshaw/ai-integration-prototype` from GitHub. Keep the root directory at the repository root.
3. Select **Vite**. Use install command `npm ci`, build command `npm run build`, output directory `dist`, and Node.js **22.x**. `vercel.json` configures the static frontend and the Node functions in `api/`; do not deploy only the `dist` folder or use GitHub Pages alone.
4. In **Project → Settings → Environment Variables**, enter these server-only variables for the deployment environments you will use:

   | Variable | Value |
   | --- | --- |
   | `GEMINI_API_KEY` | Your Google AI Studio Gemini API key |
   | `GEMINI_MODEL` | Optional model override; default `gemini-3.8-flash` |
   | `DEMO_ACCESS_CODE` | A nonblank access code |
   | `SESSION_SECRET` | A separate nonblank secret for signing sessions |

   Use a password manager to generate both secrets. Never put credentials in a GitHub issue, PR, source file, screenshot, or a variable named `VITE_*`. `.env.example` lists names only.
5. Configure cost protection before sharing: use a dedicated Gemini API key and Google AI Studio project, review available quotas, monitor use, and revoke the key if necessary. Configure Vercel Firewall rate limits on `/api/session` and `/api/coach` where your plan supports them; enable Vercel deployment protection for private rehearsals. Account budget alerts may not be hard spending caps—verify each platform's enforcement. The access code is not a substitute for distributed abuse protection.
6. Click **Deploy**, then open the HTTPS deployment URL and enter the demo code.
7. Verify all three live actions. Inspect sources/limits, Reject a challenge and retain your question, request another challenge and Accept, refine and Confirm inquiry, then request the 15-minute rehearsal. Test both activity decisions and the Needs review state. See [the demo script](docs/DEMO_SCRIPT.md).
8. After changing runtime variables, redeploy using the Vercel dashboard. A deployment without the required session secrets fails closed; without an API key it can unlock but cannot generate suggestions.

**Secrets are separate:** Copilot agent secrets support cloud development; GitHub Actions secrets support CI; Vercel Environment Variables supply the deployed API's runtime. Adding a secret to one does not configure the others. This CI needs no model credentials.

## Trust and cost boundaries

- `shared/evidence.ts` contains only fictional Grade 5 evidence. Dates, scope, visibility, exact counts, and hypothetical rubric labels are shown in the persistent rail (a disclosure on mobile).
- The server reconstructs evidence from allowlisted IDs; client-provided evidence/metadata and unknown IDs are rejected. The optional September one-classroom observation is deliberately **not included** in this demo or its API allowlist. There is no role picker or way to unlock it by request tampering.
- Metrics are separate rubric measures: 68/96 correct products and 29/96 adequate explanations, with unknown group overlap. Illustrative student work establishes neither prevalence nor causality.
- HMAC-signed, two-hour, HttpOnly, SameSite=Strict cookies protect paid calls; production cookies are Secure. Same-origin checks protect mutations. Login uses constant-time comparisons. Logout clears the browser cookie; a copied cookie is still valid until expiry. Rotate `SESSION_SECRET` to revoke all sessions.
- Requests are strictly validated and limited to 12 KiB (including streamed and platform-parsed bodies). Human text has a 2,000-character limit. Each call allows at most 2,200 output tokens, a 25-second provider timeout, no automatic provider retries, and no conversation replay. Browser cancellation discards results but may not prevent already-started provider charges.
- Zod validates action-specific model output, exact 15-minute duration, canonical mathematical representation, and 1–3 unique references to requested allowed sources. Invalid output is rejected—not shown as verified. Model prose still requires educator inspection; structured validation cannot guarantee pedagogical truth.
- Educator text is untrusted input, not system instructions. No tools, arbitrary prompts, raw-input logging, or fallback suggestions. The app keeps no provider conversation or persistent user content; provider processing and retention follow Google's Gemini API terms and project data controls. Use only fictional, non-sensitive text.

## Architecture & verification

Vite + React + TypeScript; typed state reducer in `src/features/ai-decision/state.ts`; shared Zod contracts; same-origin Vercel Node functions; official `@google/genai` SDK `models.generateContent` with JSON Schema structured output and server-side Zod validation. The Vite development server mounts the same API handlers locally; only the Vercel serverless deployment is public.

The cloud agent and GitHub Actions run:

- `npm run typecheck`
- `npm run lint` (the Vite scaffold's Oxlint)
- `npm test` (Vitest, reducer/UI tests, and API tests mocking only the external provider)
- `npm run build`

No real model call is claimed by automated tests. Configure the Vercel runtime and verify live behavior after deployment. The local Vite API adapter uses the same serverless handlers and requires the same server-only environment variables.

Official implementation references: [Google Gen AI SDK](https://github.com/googleapis/js-genai), [Gemini 3.8 Flash model](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash), [Gemini structured output](https://ai.google.dev/gemini-api/docs/generate-content/structured-output), [Vercel Vite](https://vercel.com/docs/frameworks/frontend/vite), and [Vercel Functions](https://vercel.com/docs/functions). SDK configuration signatures were checked against the pinned installed SDK version. See [design decisions](docs/DESIGN_DECISIONS.md) for scope and proposed pilot measures.
