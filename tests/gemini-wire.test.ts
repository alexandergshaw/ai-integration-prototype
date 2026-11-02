// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateSuggestion } from '../server/coach.ts'
import type { CoachRequest } from '../shared/schemas.ts'
import { challenge, refinement, rehearsal } from './fixtures'

const requestId = '24a6342d-fc59-4fba-9e91-dd479b08c0f4'
const requestFor = (action: CoachRequest['action']): CoachRequest => action === 'challenge'
  ? { action, educatorInterpretation: 'Students can calculate but may not explain.', sourceIds: ['assessment-2026-10-28', 'work-C'], requestId }
  : action === 'refine_inquiry'
    ? { action, confirmedInterpretation: 'The measures are separate.', inquiryDraft: 'What reasoning do students show?', sourceIds: ['assessment-2026-10-28', 'work-C'], requestId }
    : { action, confirmedInquiry: 'How do teachers connect tenths and hundredths?', sourceIds: ['assessment-2026-10-28', 'work-C'], requestId }

const responseFor = (action: CoachRequest['action']) => ({
  candidates: [{
    content: { parts: [{ text: JSON.stringify(action === 'challenge' ? challenge : action === 'refine_inquiry' ? refinement : rehearsal) }] },
    finishReason: 'STOP',
  }],
  usageMetadata: { promptTokenCount: 123, candidatesTokenCount: 456, totalTokenCount: 579 },
})

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a JSON object')
  return value as Record<string, unknown>
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('Gemini SDK wire contract', () => {
  it.each(['challenge', 'refine_inquiry', 'suggest_activity'] as const)(
    'serializes a valid %s request through the installed SDK',
    async (action) => {
      vi.stubEnv('GEMINI_API_KEY', 'wire-test-dummy-key')
      vi.stubEnv('Gemini_LLM_API_Key', '')
      vi.stubEnv('GEMINI_MODEL', '')
      const calls: Array<{ url: string; body: Record<string, unknown> }> = []
      vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
        calls.push({
          url: String(input),
          body: object(JSON.parse(String(init?.body))),
        })
        return new Response(JSON.stringify(responseFor(action)), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      })

      await expect(generateSuggestion(requestFor(action))).resolves.toMatchObject({
        model: 'gemini-2.5-flash',
        suggestion: { action },
      })
      expect(calls).toHaveLength(1)
      const [{ url, body }] = calls
      expect(url).toContain('/models/gemini-2.5-flash:generateContent')
      const generationConfig = object(body.generationConfig)
      expect(generationConfig).toMatchObject({
        responseMimeType: 'application/json',
        maxOutputTokens: 8192,
        thinkingConfig: { thinkingBudget: 0 },
      })
      const schema = object(generationConfig.responseJsonSchema)
      expect(schema).toMatchObject({ type: 'object', additionalProperties: false })
      expect(schema).not.toHaveProperty('$schema')
      expect(JSON.stringify(schema)).not.toContain('"const"')
      const properties = object(schema.properties)
      expect(properties.sourceIds).toMatchObject({ type: 'array', minItems: 1, maxItems: 3 })
      if (action === 'challenge') {
        expect(properties.evidenceConsideration).toMatchObject({ type: 'string', minLength: 1, maxLength: 1200 })
        expect(properties.probingQuestion).toMatchObject({ minLength: 1, maxLength: 2000 })
      }
      if (action === 'refine_inquiry') {
        expect(properties.suggestedInquiry).toMatchObject({ minLength: 1, maxLength: 2000 })
      }
      if (action === 'suggest_activity') {
        const activity = object(properties.activity)
        const activityProperties = object(activity.properties)
        const steps = object(activityProperties.steps)
        const stepProperties = object(object(steps.items).properties)
        expect(steps).toMatchObject({ minItems: 2, maxItems: 6 })
        expect(stepProperties.minutes).toMatchObject({
          type: 'integer',
          minimum: 1,
          maximum: 15,
        })
        expect(activityProperties.discussionPrompts).toMatchObject({
          minItems: 2,
          maxItems: 2,
        })
        if (rehearsal.action !== 'suggest_activity') throw new Error('Expected the activity fixture')
        expect(object(activityProperties.representation).enum).toEqual([rehearsal.activity.representation])
      }
      expect(JSON.stringify(body)).not.toContain('wire-test-dummy-key')
    },
  )

  it('keeps retry behavior bounded to one serialized request on retryable provider errors', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'wire-test-dummy-key')
    vi.stubEnv('GEMINI_MODEL', '')
    let attempts = 0
    vi.stubGlobal('fetch', async () => {
      attempts += 1
      return new Response(JSON.stringify({ error: { code: 503, message: 'Temporary provider error' } }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      })
    })

    await expect(generateSuggestion(requestFor('challenge'))).rejects.toMatchObject({ status: 502 })
    expect(attempts).toBe(1)
  })
})
