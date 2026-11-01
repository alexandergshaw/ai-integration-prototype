# Inquiry

**AI supports educator thinking; educators own the decisions.**

A focused demo of the **Value Add of Technology on Teaching (VATT)** principle: AI can offer a useful second perspective while the educator owns the thinking and every decision. This is one fictional AI–educator interaction workspace—not a complete PLC application, nor a Leading Educators product, partnership, or endorsement.

## What works

1. **Challenge my interpretation** compares the educator's thinking with cited fictional evidence, offers a tentative counterhypothesis and probing question, and drafts a possible revision. Accept copies that revision into an editable interpretation; Reject preserves the educator's wording. **Confirm interpretation** is a separate educator action.
2. **Suggest a stronger PLC question** uses only the confirmed interpretation and current educator-authored question. Accept copies one focused question into the editable draft; Reject leaves it unchanged. **Confirm inquiry** is another independent action.
3. **Suggest a PLC activity** uses only the confirmed inquiry and approved evidence to suggest one 15-minute math rehearsal with two discussion prompts, teacher practice, and possible student evidence to examine. Accept copies it into an editable preview; Reject preserves educator work. **Confirm activity** means choosing to bring this rehearsal to discussion. Changing the confirmed inquiry marks an accepted activity **Needs review**.

AI runs only on a button click. Errors never automatically replace educator work. Sources, uncertainty, response history, and decisions are visible. State is ephemeral React memory: refresh, lock, or reset clears drafts; no database, local storage, analytics, or student accounts.

### Guided planning

**Use guided planning** is available beside the AI action before or during a request. It opens short built-in reasoning prompts in the same assistance panel, leaving every editor unchanged. Provider, network, platform, and response-validation failures open this guide directly without a technical error banner. Authentication, same-origin, unauthorized-source, and invalid-input failures remain explicit application problems; they do not activate support or bypass access checks.

Challenge supports testing an interpretation against evidence and alternatives. Refine offers an inquiry checklist and sentence frame. Rehearse offers a 3 + 7 + 5 minute scaffold with objectives, mathematical questions, teacher practice, and subsequent student evidence. Educators can write and confirm all three artifacts without accepting any suggestion or example. Guidance stays available on subsequent steps; AI never runs automatically.

**Built-in guide**, **Built-in example**, **AI suggestion**, and **Your draft** distinguish sources. **About this support** explains what built-in content does and does not do. Optional examples appear only for explicit matching fictional Grade 5 decimal-multiplication scenario metadata and authorized sources, never keyword matching. **View example** does not apply it; **Accept suggestion** copies it into an editable draft and **Reject suggestion** preserves educator text. Confirmation remains separate. Accepted built-in activities still require explicit alignment review, and **Started from a built-in example** remains accurate after edits.

The named `GUIDED_PLANNING_WAIT_MS` threshold is initially eight seconds: a prototype UX choice, not a provider-failure diagnosis or research benchmark. It retires the browser request, clears its timer, and opens guidance without moving typing focus. Editing, navigation, Reset, Lock, cancellation, and explicit guided activation also retire requests; late results cannot replace guided work. A collapsed **Service details** disclosure truthfully reports that no new AI suggestion was returned. Browser abort cannot guarantee provider processing or charges stop. **Try AI** is always an explicit new request, and success returns an optional suggestion, never an automatic draft replacement.

All local guidance and examples ship in the initial workspace bundle, without extra requests. This does not support a fully offline reload. Work remains in React memory only: refresh, successful Lock, or Reset clears it. Safe server diagnostics remain separate from planning; client state distinguishes AI success, provider/unavailable-response failure, UI deadline, guided activation and cancellation, while decision origins and confirmed artifacts distinguish example use and educator confirmation. No telemetry or persistent storage is added.

## Deploy entirely in your browser

1. On **GitHub.com**, review the Copilot cloud agent's implementation pull request, its checks, and verification notes. Request changes there if needed; merge when ready.
2. On **Vercel.com → Dashboard → Add New → Project**, import `alexandergshaw/ai-integration-prototype` from GitHub. Keep the root directory at the repository root.
3. Select **Vite**. Use install command `npm ci`, build command `npm run build`, output directory `dist`, and Node.js **22.x**. `vercel.json` configures the static frontend and the Node functions in `api/`; do not deploy only the `dist` folder or use GitHub Pages alone.
4. In **Project → Settings → Environment Variables**, enter these server-only variables for the deployment environments you will use:

   | Variable | Value |
   | --- | --- |
   | `GEMINI_API_KEY` | Your Google AI Studio Gemini API key |
   | `GEMINI_MODEL` | Optional model override; default `gemini-2.5-flash` |
   | `DEMO_ACCESS_CODE` | A nonblank access code |
   | `SESSION_SECRET` | A separate nonblank secret for signing sessions |

   Use a password manager to generate both secrets. Never put credentials in a GitHub issue, PR, source file, screenshot, or a variable named `VITE_*`. `.env.example` lists names only.
5. Configure cost protection before sharing: use a dedicated Gemini API key and Google AI Studio project, review available quotas, monitor use, and revoke the key if necessary. Configure Vercel Firewall rate limits on `/api/session` and `/api/coach` where your plan supports them; enable Vercel deployment protection for private rehearsals. Account budget alerts may not be hard spending caps—verify each platform's enforcement. The access code is not a substitute for distributed abuse protection.
6. Click **Deploy**, then open the HTTPS deployment URL and enter the demo code.
7. Verify all three live actions. Inspect sources/limits, Reject a challenge and retain your question, request another challenge and Accept, refine and Confirm inquiry, then request the 15-minute rehearsal. Test both activity decisions and the Needs review state. See [the demo script](docs/DEMO_SCRIPT.md).
8. After changing runtime variables, redeploy using the Vercel dashboard. A deployment without the required session secrets fails closed; without an API key it can unlock but cannot generate suggestions.

**Secrets are separate:** Copilot agent secrets support cloud development; GitHub Actions secrets support CI; local `.env` files supply local Vite development; Vercel Environment Variables supply the deployed API's runtime. Adding a secret to one does not configure the others. This CI needs no model credentials. `GEMINI_API_KEY` is canonical; a nonblank `Gemini_LLM_API_Key` is accepted only when the canonical value is blank or absent.

### Troubleshooting Gemini

`GEMINI_MODEL` must contain only a model identifier, for example `gemini-2.5-flash`: not the variable name `GEMINI_MODEL`, an assignment, an unexpanded `$GEMINI_MODEL`/`${GEMINI_MODEL}` placeholder, or a quoted value. Missing or blank overrides use the default; surrounding whitespace is trimmed. The server rejects malformed nonblank values with HTTP 503 before constructing the Gemini client, without silently repairing them or choosing another model. The diagnostic is `stage: configuration`, `category: invalid_model_configuration`, with the request ID and action but no invalid value. This syntax guard does not verify Google model access. Guided planning remains available, but is not evidence of a successful Gemini request.

For the confirmed Production misconfiguration, open **Vercel.com → alexandergshaws-projects → ai-integration-prototype → Settings → Environment Variables**. Verify project ID `prj_AXBcXNkhmnRI7WPsPnA5geLGGqXI`, then change only **Name:** `GEMINI_MODEL`, **Value:** `gemini-2.5-flash`, **Environment:** Production. Leave credentials and other scopes/settings untouched. In **Deployments**, identify the deployment currently serving `ai-integration-prototype.vercel.app`, verify its source commit and Production target, and redeploy that same reviewed source with the updated environment (not the old environment). Do not promote a preview or deploy a newer unreviewed commit. After it is READY and the production domain points to it, unlock normally and verify Challenge, Refine, and Rehearse with their confirmation prerequisites. If access is unavailable, the owner must perform these steps; merging the guard alone does not change Vercel configuration.

Gemini request failures do not change your drafts. Authentication/access errors mean you should check `GEMINI_API_KEY` and the associated Google AI Studio project's permissions; model-not-found errors mean you should check `GEMINI_MODEL` and that project's model access. HTTP 400 means Gemini rejected the request: check the key, model, and structured-output configuration rather than assuming the output was invalid. Rate limits can reflect quota exhaustion; temporary provider failures can be retried later.

The provider schema converts Zod literal `const` constraints to single-value `enum` constraints and preserves documented length, number, and array bounds; server-side Zod and citation checks remain authoritative. After deploying schema changes, verify all three live actions; mocked tests cannot establish whether a particular API key and model accept the request.

The browser's `/api/coach` HTTP 502 is the app's error status, not necessarily Gemini's status. Technical details remain in safe server diagnostics, not the planning panel. Recoverable errors activate built-in guidance; incomplete responses, empty text, malformed JSON, and failed validation do not by themselves establish a credential or configuration problem.

In **Vercel → Project → Logs**, select the deployment you are actually using, clear restrictive filters, reproduce the failure, and look for `/api/coach` and `Gemini coach failure`. The structured server diagnostic includes a request ID, action, resolved model (omitted for invalid model configuration), stage/category, elapsed time, and only safe provider status, finish reason, usage counts, or validation paths when available—never raw provider errors, prompts, response content, API keys, authorization headers, or educator text. It can distinguish configuration, provider rejection, timeout/network, incomplete response, JSON, schema, and citation failures. Check variables for the failing deployment environment and redeploy after any changes. Do not share credentials when troubleshooting.

## Trust and cost boundaries

- `shared/evidence.ts` contains only fictional Grade 5 evidence. Dates, scope, visibility, exact counts, and hypothetical rubric labels are shown in the persistent rail (a disclosure on mobile).
- The server reconstructs evidence from allowlisted IDs; client-provided evidence/metadata and unknown IDs are rejected. The optional September one-classroom observation is deliberately **not included** in this demo or its API allowlist. There is no role picker or way to unlock it by request tampering.
- Metrics are separate rubric measures: 68/96 correct products and 29/96 adequate explanations, with unknown group overlap. Illustrative student work establishes neither prevalence nor causality.
- HMAC-signed, two-hour, HttpOnly, SameSite=Strict cookies protect paid calls; production cookies are Secure. Same-origin checks protect mutations. Login uses constant-time comparisons. Logout clears the browser cookie; a copied cookie is still valid until expiry. Rotate `SESSION_SECRET` to revoke all sessions.
- Requests are strictly validated and limited to 12 KiB (including streamed and platform-parsed bodies). Human text has a 2,000-character limit. Each action makes one generation request with an 8,192-token output ceiling, a 60-second provider timeout, an eight-second UI waiting threshold, and a 90-second Vercel function limit. The SDK is configured for one attempt. The output ceiling can increase cost and latency, but structured responses are never truncated or accepted when incomplete. Browser cancellation discards results but may not prevent already-started provider charges.
- Zod validates action-specific model output, exact 15-minute duration, canonical mathematical representation, and 1–3 unique references to requested allowed sources. Invalid output is rejected—not shown as verified. Model prose still requires educator inspection; structured validation cannot guarantee pedagogical truth.
- Educator text is untrusted input, not system instructions. No tools, arbitrary prompts, raw-input logging, or automatic example insertion. Built-in prompts and examples are application-owned content, never reported as successful Gemini calls. The app keeps no provider conversation or persistent user content; provider processing and retention follow Google's Gemini API terms and project data controls. Use only fictional, non-sensitive text.

## Architecture & verification

Vite + React + TypeScript; typed state reducer in `src/features/ai-decision/state.ts`; shared Zod contracts; same-origin Vercel Node functions; official `@google/genai` SDK `models.generateContent` with JSON Schema structured output and server-side Zod validation. The Vite development server mounts the same API handlers locally; only the Vercel serverless deployment is public.

The cloud agent and GitHub Actions run:

- `npm run typecheck`
- `npm run lint` (the Vite scaffold's Oxlint)
- `npm test` (Vitest reducer/UI/API tests plus installed-SDK wire tests against an intercepted mock transport)
- `npm run build`

No live model call is claimed by automated tests. Configure the Vercel runtime and verify live behavior after deployment. The local Vite API adapter uses the same serverless handlers and requires the same server-only environment variables.

Official implementation references: [Google Gen AI SDK](https://github.com/googleapis/js-genai), [Gemini 2.5 Flash model](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash), [Gemini thinking](https://ai.google.dev/gemini-api/docs/generate-content/thinking), [Gemini structured output](https://ai.google.dev/gemini-api/docs/generate-content/structured-output), [Vercel Vite](https://vercel.com/docs/frameworks/frontend/vite), and [Vercel Function duration](https://vercel.com/docs/functions/configuring-functions/duration). SDK configuration signatures and retry behavior were checked against the pinned installed SDK version. See [design decisions](docs/DESIGN_DECISIONS.md) for scope and proposed pilot measures.
