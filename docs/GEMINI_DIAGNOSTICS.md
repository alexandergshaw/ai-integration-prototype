# Gemini investigation and verification

## Finding and evidence limits

**The reported production failure's cause is not confirmed.** No `GEMINI_API_KEY` or Vercel token was available in the repair session. GitHub's deployments list was empty; runtime logs could not be inspected. Direct access to Google's documentation host and the public Vercel deployment failed DNS resolution in this environment. No secret values were retrieved and no production settings or deployments were changed.

The original baseline passed 86 mocked tests. That does not demonstrate provider acceptance. Inspection of all three actual Zod-generated schemas and the pinned SDK's contract found **no remaining unsupported keyword after the existing conversion**. There is no evidence to justify stripping strict objects or array constraints, replacing structured output with JSON-only mode, or changing model names as a supposed cure.

Two concrete code defects are repaired:

1. **Hidden multi-request generation:** `@google/genai` 2.32.0 defaults `config.automaticContinuation` to true. A checkpoint response can trigger additional HTTP requests; each has its own timeout and billing. `retryOptions.attempts: 1` does not prevent continuation. The real SDK test in `tests/sdk.test.ts` reproduces two HTTP calls under that original configuration. `server/coach.ts:suggestionRequest` now sets `automaticContinuation: false`; the same checkpoint results in one call and an honest incomplete-generation error. This restores the intended 25-second/single-request bounds beneath the 28-second browser and 30-second Vercel limits. **Whether production encountered a checkpoint remains unknown.**
2. **Misclassified failures and missing diagnostic evidence:** the old catch-all turned programming errors into connection-shaped 502s, treated provider outages/configuration as 502s, and discarded safe provider reasons and correlation information. `classifyProviderError` now distinguishes these categories, including nested Node fetch causes. The real SDK timeout test confirms an `AbortError` (not a wrapped generic Error); the network test exercises `TypeError` with its actual cause chain. `api/coach.ts` emits one sanitized failure record and an `X-Request-ID` header.

The SDK is explicitly initialized with `vertexai: false`: the app uses the Gemini Developer API key, not Vertex AI. A wire-contract test sets `GOOGLE_GENAI_USE_VERTEXAI=true` and verifies that the app still reaches the Developer API. This is endpoint hardening, not evidence that a Vertex environment variable caused the reported incident.

## Complete request trace

| Stage | Code | Boundary / possible failure |
| --- | --- | --- |
| Explicit educator click | `src/App.tsx:requestSuggestion` | Disabled prerequisites; browser network error; 28-second abort |
| Action-specific payload | `src/features/ai-decision/state.ts:requestFor` | Current authored text / confirmed context only; UUID and fixture IDs |
| HTTP and session | `api/coach.ts`, `server/http.ts`, `server/session.ts` | POST, same origin, signed session, content type, 12 KiB size, strict request Zod; original 400/401/403/405/413/415/503 preserved |
| Provider request | `server/coach.ts:suggestionRequest` | Authoritative source reconstruction; no unavailable/duplicate sources; action schema conversion; unexpected schema keyword fails locally |
| SDK transport | `server/coach.ts:generateSuggestion` | Server-only key; explicit Developer API; model override; 25-second timeout; one attempt; no continuation |
| Completion | `server/coach.ts:responseText` | Only STOP accepted; missing candidates, safety blocks, checkpoint, MAX_TOKENS and empty/whitespace text rejected |
| Output contract | `shared/schemas.ts`, `server/coach.ts:generateSuggestion` | JSON parsing, strict action-specific Zod, correct action, unique requested citations, canonical mathematics, exactly two prompts and 15-minute total |
| Browser verification | `src/App.tsx` | Strict response contract, matching request/action and fixture citations; invalid output never dispatched as a suggestion |
| Educator decision | `src/features/ai-decision/state.ts:reducer` | Failure clears only request state. Drafts remain; Accept/Reject/Confirm and inquiry alignment remain independent |

Local Vite mounts the same handlers through `vite.config.ts`; Vercel builds the frontend into `dist` and serves the separate Node functions through `vercel.json`. The frontend has no provider SDK or key.

## Exact schema compatibility

Dependencies remain pinned at `@google/genai` **2.32.0** and Zod **4.6.7**. `z.toJSONSchema(..., { target: 'draft-7' })` generates each action separately, not the output discriminated union. Its custom 15-minute invariant is checked locally, not representable as an ordinary array constraint.

| Schema | Provider fields / constraints |
| --- | --- |
| `challenge` | Required strict object; action single-value string enum; seven text/reference fields; references array 1–3 |
| `refine_inquiry` | Required strict object; action enum; suggested question, rationale, limitations, references 1–3 |
| `suggest_activity` | Required strict nested objects; action and canonical representation enums; steps array 2–6, integer minutes 1–15; discussion prompts exactly 2; references 1–3 |

The complete emitted keyword set is `type`, `enum`, `properties`, `required`, `additionalProperties`, `items`, `minItems`, `maxItems`, `minimum`, `maximum`. All are documented for `responseJsonSchema` in the pinned SDK. Zod's `$schema`, `minLength`, `maxLength` are omitted and string/trim bounds remain local; `const` becomes `enum`. The converter now treats property names separately from schema keywords and rejects unforeseen keywords rather than silently passing them through. The tests inspect every node, nested bounds, literal values, required fields, and the exact HTTP payload serialized by the real SDK.

`responseJsonSchema` is distinct from the SDK's OpenAPI-style `responseSchema`. Use only the former together with `responseMimeType: "application/json"`; switching between them changes the accepted format. Google publishes a version-tagged Developer API recording showing nested objects, `additionalProperties: false`, enums, and numeric bounds accepted by `gemini-2.5-flash`. This is Google's recording, **not a live result for this application**.

Gemini 2.5 and Gemini 3 support structured output, but account/model access must still be tested. Google's SDK guide documents 2.5 `thinkingBudget` versus 3 `thinkingLevel`; do not blindly apply a zero thinking budget to every model (2.5 Pro cannot disable thinking). Default thinking and the existing 2,200-token ceiling remain a possible source of latency/truncation. No thinking/budget adjustment was made without production evidence. If `MAX_TOKENS` occurs, inspect the diagnostic token metadata before selecting a model-specific budget and rerun all actions. A schema-valid response is not proof of pedagogical or factual truth.

## Controlled live sequence

`scripts/diagnose-gemini.ts` runs six sequential, real SDK requests when a key is configured. It never prints prompts, keys, headers, raw errors, or output text.

| Test | Request | Pass criterion |
| --- | --- | --- |
| A | Minimal text, no JSON/schema | Actual provider completion with STOP and nonblank text |
| B | JSON MIME type, no schema | STOP and parseable JSON |
| C | Minimal required string/object schema | STOP and locally validated minimal JSON object |
| D1–D3 | Exact production builder and validation for each action, fictional inputs and approved evidence | Each action separately completes and passes all local invariants |

Every failed stage sets a nonzero process exit code. Later stages still run to isolate schema-specific differences. Missing credentials report **all six stages as `not_run`**, exit unsuccessfully, and never call Gemini. A–C successes include numeric output/thinking token counts when supplied. D successes mean local validation completed, not educator confirmation.

Interpret results cautiously: A failure indicates auth/model/network/provider problems before schema involvement; A pass/B failure isolates JSON mode; B pass/C failure isolates minimal structured output; C pass/D failure narrows to application configuration, schema complexity, output budget or local contracts. Different responses can still reflect transient provider conditions. Use the logged category/reason, not just the last successful stage, to establish cause.

## Browser-only owner verification

1. **Before merging the repair**, for live verification start a GitHub Copilot session with an authorized server-only Gemini agent secret and ask the agent to run the diagnostic on the repair branch. Do not paste credentials in chat, issues or PRs.
2. Alternatively, once the reviewed diagnostic workflow is present on the default branch, use **GitHub → Settings → Secrets and variables → Actions** to configure `GEMINI_DIAGNOSTIC_API_KEY` with a key from the same Google AI Studio project as the failing app. This is an optional Actions-only diagnostic secret, not a new runtime requirement.
3. Open **Actions → Gemini live diagnostic → Run workflow**. Choose the reviewed branch and enter the **exact failing Vercel model identifier**. A run makes up to six billed requests with fictional data. The workflow is manual only; ordinary PR tests require no credentials. Inspect each stage; a green ordinary CI check is not live verification. If testing `gemini-2.5-flash` as a baseline, record it as a separate model run, not a fix for the failing configuration.
4. Review the PR and authorize a preview deployment in Vercel. Confirm server-side variable **names and environment scope**, without revealing values: `GEMINI_API_KEY`, `GEMINI_MODEL`, `DEMO_ACCESS_CODE`, `SESSION_SECRET`. Existing default `gemini-3.8-flash` was not independently verified for this account and is deliberately unchanged. Set a model only after confirming project access; no production variable change is prescribed as the confirmed cure.
5. Keep Node **22.x**, root at the repository root, install `npm ci`, build `npm run build`, output `dist`, and Node API functions. The 30-second function budget is unchanged. Do not host just `dist`; preview/static hosting alone does not run these handlers. Private variables must never have a `VITE_` prefix.
6. On the correct HTTPS preview, unlock the demo and run all three actions using the [demo script](DEMO_SCRIPT.md). Inspect citations, mathematics and total time. Accept copies into a draft, Reject preserves it, Confirm remains separate. Also fail a request with existing drafts and verify preservation. Change and confirm inquiry and verify activity Needs review.
7. In **Vercel → Logs**, filter the preview deployment and `/api/coach`; correlate `Gemini coach failure.requestId` with the response `X-Request-ID` in browser Network tools. The log has action (null before validated input), category, model, provider status (null without an HTTP response), and allowlisted reason (null if unavailable). Do not share raw provider logs or secret values.

No required Vercel variable name, function duration, authentication setting or frontend configuration changed. Production rollout and secret changes require owner authorization. Copilot, Actions and Vercel secrets are separate.

## Verification record and remaining risks

At repair time, **`npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` all passed**; the expanded suite passed **118 tests** (4 files). The suite includes SDK-method mocks, real pinned SDK serialization over **stubbed HTTP**, and React/reducer tests. All remain credential-independent; none demonstrate Google accepted an application schema. The diagnostic reported A, B, C and all three D stages **not run: key missing**.

The running local Vite adapter was also checked over HTTP: session login returned 200; an authenticated coach request without a provider key returned the expected configuration 503, correlation header and sanitized failure record, with no fallback suggestion or provider call. The production frontend bundle contained no provider SDK or API-key symbol. This validates local wiring and build separation, not Vercel runtime or live generation.

Remaining acceptance gates: actual A–D results with the failing project's credentials/model, Vercel runtime logs or equivalent safe failure evidence, and all three workflows on an authorized preview. Truncation/latency, project quota/key permissions, regional/model availability, and provider semantic inaccuracies remain possible. **Do not label this a confirmed permanent production fix until those gates pass and the observed incident's cause is established.**

## Official sources checked

- [Pinned SDK types](https://github.com/googleapis/js-genai/blob/v2.32.0/src/types.ts): `GenerateContentConfig.responseJsonSchema`, `automaticContinuation`, `HttpOptions`, `HttpRetryOptions`, `ThinkingConfig`.
- [Pinned SDK transport](https://github.com/googleapis/js-genai/blob/v2.32.0/src/_api_client.ts): timeout/abort, typed `ApiError`, safe reasons available in JSON `error.message`.
- [Google's pinned structured-output recording](https://github.com/googleapis/js-genai/blob/v2.32.0/test/system/recordings/Client_Tests_generateContent_ML_Dev_should_generate_content_with_given_valid_json_schema_in_responseJsonSchema.json).
- [Google SDK generation guide](https://github.com/googleapis/js-genai/blob/v2.32.0/codegen_instructions.md) and [Zod JSON Schema conversion](https://zod.dev/json-schema).
- [Current Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output), [thinking](https://ai.google.dev/gemini-api/docs/thinking), [models](https://ai.google.dev/gemini-api/docs/models): direct pages were DNS-blocked here; Google-owned versioned SDK sources were retrieved through GitHub instead. Search summaries were not treated as authoritative evidence of account access.
