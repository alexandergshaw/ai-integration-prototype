# Design decisions

## One decision workspace

A chatbot approach gets several things right: educator-authored language, quick iteration, and space for a probing second perspective. For this task, a chat transcript alone makes evidence, source limitations, draft ownership, and acceptance ambiguous. Inquiry keeps a compact evidence rail next to educator text and a contextual suggestion card. One explicit decision updates one editable artifact.

This vertical slice is enough for an interview: it demonstrates three real model integrations, human authorship, rejection, confirmation, and downstream invalidation without diluting those moments across an entire PLC planner.

The interface is deliberately a minimal prototype: system typography, flat surfaces, thin dividers, and restrained navy/teal accents. Plain labels replace decorative AI icons and promotional copy. Evidence, educator drafts, unconfirmed AI suggestions, and decision history remain distinct; mobile evidence stays in a disclosure.

## Agency is an implementation invariant

Accept copies a question or activity into a draft. It does not establish truth or confirm an educator decision. Reject is equally visible, preserves work, and never blocks progress. Confirmation is independent. Only action-specific educator text and server-authorized evidence enter later calls; suggestion history is for inspection, not provider context. If an educator explicitly copies or writes text, it is their current draft, not silently inferred acceptance.

Changed confirmed inquiry preserves the activity text but clears activity confirmation and marks alignment Needs review. An educator must review it explicitly or request a replacement. Confirmation means bringing a rehearsal to the PLC—not deciding the team's classroom strategy.

## Bounded evidence and mathematical reasoning

The normalized conceptual fixture says “Three tenths of four tenths makes twelve hundredths, or 0.12.” A 10 × 10 model reinforces the unit of the overlapping cells. Work-B exposes a place-value error; work-C's procedure alone cannot establish conceptual understanding.

The 68/96 and 29/96 figures are separate hypothetical rubric metrics, not a known nested set. Individual examples are illustrative, not prevalence estimates. The optional September 9 observation from one classroom is excluded entirely. A future authorized-coach view would need server-verified authorization, visible date/scope, and explicit noncausal framing; a stale one-classroom observation cannot explain current four-classroom results.

## Trust, security, and repeatability

Three stateless Gemini `generateContent` calls use fixed boundaries, distinct structured schemas, server-owned fixtures, validated citations, and token/time limits. A signed demo-code session protects paid calls. Platform firewall and provider controls must supply distributed abuse/spend protection; process-memory counters would be misleading on serverless infrastructure.

No model output is trusted as a confirmed decision. Schemas constrain format, time, citations, and the mathematical representation, but cannot prove all generated prose is pedagogically correct. Educators must inspect uncertainty and sources.

Reset clears memory for repeated demonstrations. No persistence service is necessary. Automated tests mock the external provider; live verification occurs only with securely configured runtime credentials. No claimed pilot outcomes or student-learning effects appear.

## Deliberately excluded

Onboarding, dashboards, assessment exploration, lesson browsing, full agendas, slide exports, role administration, student accounts/progress, post-PLC tracking, LMS integration, unrestricted chat, analytics services, and a database. The activity preview is a small editable rehearsal, not a meeting builder. Historical data are not hidden behind a client-side role toggle.

## Proposed pilot measurements—not observed results

Guided planning is an ordinary optional path, not a simulated model response. Short local prompts support reasoning without assessing the current draft. Examples use explicit scenario metadata rather than keyword-based alignment claims. They retain the existing validated suggestion/review mechanism, separate acceptance and confirmation, citation checks, and built-in activity alignment review. Requests have a single retirement helper for timer clearing, abort and identity invalidation; the eight-second UI threshold is an adjustable prototype choice, not an outage diagnosis. Server failure diagnostics remain safe and unchanged; session-local outcome, provenance, decisions and confirmations are not persistent analytics.

Evaluate the guided journey with proposed tasks: can an educator finish all three steps without AI; is any draft lost during switching; can they explain the evidence behind the inquiry; can they distinguish AI from built-in support; and how many actions or interruptions does switching introduce? No usability or effectiveness results are claimed.

If a future authorized pilot adds instrumentation, measure:

| Measure | Unit |
| --- | --- |
| Model use/cost exposure | Requests per educator session, by action |
| Agency and fit | Accepted and rejected suggestions / decided suggestions, by action (%) |
| Educator understanding | Educators able to explain their final inquiry / educators interviewed (%) |
| Efficiency | Minutes from workspace entry to educator-confirmed question |
| Citation integrity | Number of invalid citations per 100 provider responses |
| Access control | Number of unauthorized-access incidents per pilot week |

These are proposed measures, not implemented analytics or reported findings. Acceptance is not a proxy for quality; rejection may demonstrate productive judgment. Faster confirmation is not evidence of better instruction. Student-learning effects would require a separate appropriate study.
