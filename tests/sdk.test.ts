// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { GoogleGenAI } from '@google/genai'
import { z } from 'zod'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { challengeSchema, refineSchema, activitySchema } from '../shared/schemas.ts'
import type { CoachRequest } from '../shared/schemas.ts'
import { sourceIds } from '../shared/evidence.ts'
import { classifyProviderError, generateSuggestion, logCoachFailure, providerSchema, suggestionRequest } from '../server/coach.ts'
import { challenge, refinement, rehearsal } from './fixtures.ts'

const common = { sourceIds: [...sourceIds], requestId: '24a6342d-fc59-4fba-9e91-dd479b08c0f4' }
const requests: CoachRequest[] = [
  { action: 'challenge', educatorInterpretation: 'Fictional interpretation.', ...common },
  { action: 'refine_inquiry', confirmedInterpretation: 'Confirmed fictional interpretation.', inquiryDraft: 'How do students explain hundredths?', ...common },
  { action: 'suggest_activity', confirmedInquiry: 'How do students explain hundredths?', ...common },
]

beforeEach(() => {
  vi.stubEnv('GEMINI_API_KEY', 'test-key')
  vi.stubEnv('GEMINI_MODEL', 'gemini-2.5-flash')
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('pinned SDK wire contract (stubbed HTTP, NOT live Gemini)', () => {
  it.each(requests)('serializes the exact $action schema and reads actual SDK response text', async (request) => {
    // Do not replace GoogleGenAI or models.generateContent: exercise their real converters.
    vi.stubEnv('GOOGLE_GENAI_USE_VERTEXAI', 'true')
    const output = [challenge, refinement, rehearsal].find((suggestion) => suggestion.action === request.action)!
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify(output) }] }, finishReason: 'STOP' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await generateSuggestion(request)).toEqual(output)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent')
    const body = JSON.parse(init.body)
    expect(body.generationConfig).toEqual({
      responseMimeType: 'application/json', responseJsonSchema: suggestionRequest(request).config?.responseJsonSchema,
      maxOutputTokens: 2200,
    })
    expect(body.contents).toEqual([{ role: 'user', parts: [{ text: suggestionRequest(request).contents }] }])
    expect(body.systemInstruction.parts[0].text).toContain('0.3 × 0.4 = 0.12')
    expect(new Headers(init.headers).get('x-goog-api-key')).toBe('test-key')
    expect(new Headers(init.headers).get('x-server-timeout')).toBe('25')
  })

  it('recognizes the actual SDK timeout abort', async () => {
    vi.stubGlobal('fetch', (_url: unknown, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal!.addEventListener('abort', () => reject(init.signal!.reason), { once: true })
    }))
    const client = new GoogleGenAI({ apiKey: 'test-key', vertexai: false,
      httpOptions: { timeout: 10, retryOptions: { attempts: 1 } } })
    const error = await client.models.generateContent({ model: 'gemini-2.5-flash', contents: 'Test' }).catch((cause: unknown) => cause)
    expect(error).toBeInstanceOf(Error)
    expect(error).toHaveProperty('name', 'AbortError')
    expect(classifyProviderError(error)).toMatchObject({ status: 504, category: 'timeout' })
  })

  it('reproduces default automatic continuation and prevents hidden extra application calls', async () => {
    const intermediate = () => new Response(JSON.stringify({
      candidates: [{ content: { role: 'model', parts: [{ text: '{"action":' }] },
        finishReason: 'CONTINUATION', continuationToken: 'test-continuation-token' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    const final = () => new Response(JSON.stringify({
      candidates: [{ content: { role: 'model', parts: [{ text: '"challenge"}' }] }, finishReason: 'STOP' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    const fetchMock = vi.fn().mockResolvedValueOnce(intermediate()).mockResolvedValueOnce(final())
    vi.stubGlobal('fetch', fetchMock)
    const client = new GoogleGenAI({ apiKey: 'test-key', vertexai: false,
      httpOptions: { timeout: 25_000, retryOptions: { attempts: 1 } } })
    const originalPayload = suggestionRequest(requests[0]!)
    delete originalPayload.config?.automaticContinuation
    await client.models.generateContent(originalPayload)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body).continuationToken).toBe('test-continuation-token')
    fetchMock.mockReset().mockResolvedValueOnce(intermediate())
    await expect(generateSuggestion(requests[0]!)).rejects.toMatchObject({
      status: 502, category: 'incomplete_generation', providerReason: 'CONTINUATION',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(suggestionRequest(requests[0]!).config?.automaticContinuation).toBe(false)
  })

  it.each([400, 401, 403, 404, 429, 500, 503])('preserves HTTP %i through the real SDK without retries or raw logging', async (status) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { code: status, status: status === 429 ? 'RESOURCE_EXHAUSTED' : 'INVALID_ARGUMENT', message: 'sensitive test-key' },
    }), { status, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const error = await generateSuggestion(requests[0]!).catch((cause: unknown) => cause)
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    logCoachFailure(error, common.requestId, 'challenge')
    expect(log).toHaveBeenCalledWith('Gemini coach failure', expect.objectContaining({ providerStatus: status }))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(log.mock.calls)).not.toContain('sensitive')
    expect(JSON.stringify(log.mock.calls)).not.toContain('test-key')
  })

  it('recognizes a real SDK-wrapped network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed', {
      cause: Object.assign(new Error('sensitive hostname'), { code: 'ENOTFOUND' }),
    })))
    await expect(generateSuggestion(requests[0]!)).rejects.toMatchObject({ status: 503, category: 'network' })
  })
})

describe('complete provider schema contract', () => {
  it.each([challengeSchema, refineSchema, activitySchema])('uses only the documented subset at every schema node', (schema) => {
    const allowed = ['type', 'properties', 'required', 'additionalProperties', 'enum', 'items', 'minItems', 'maxItems', 'minimum', 'maximum', 'description']
    function check(node: unknown) {
      if (!node || typeof node !== 'object' || Array.isArray(node)) throw new Error('Expected schema node')
      for (const key of Object.keys(node)) expect(allowed).toContain(key)
      if ('type' in node && node.type === 'object') expect(node).toHaveProperty('additionalProperties', false)
      if ('properties' in node && node.properties && typeof node.properties === 'object') {
        for (const child of Object.values(node.properties)) check(child)
      }
      if ('items' in node) check(node.items)
    }
    check(providerSchema(schema))
  })
  it('fails locally on a newly introduced unsupported keyword instead of forwarding it silently', () => {
    const schema = challengeSchema.extend({ evidenceConsideration: z.string().regex(/evidence/) })
    expect(() => providerSchema(schema)).toThrow('Unsupported provider schema keyword: pattern')
  })
  it('retains all strict objects, required fields, numerical and array bounds', () => {
    const schema = providerSchema(activitySchema)
    expect(schema).toMatchObject({
      required: ['action', 'activity', 'rationale', 'limitations', 'sourceIds'],
      properties: {
        activity: {
          additionalProperties: false,
          properties: {
            steps: { minItems: 2, maxItems: 6, items: {
              additionalProperties: false, required: ['minutes', 'instruction'],
              properties: { minutes: { type: 'integer', minimum: 1, maximum: 15 } },
            } },
            discussionPrompts: { minItems: 2, maxItems: 2 },
          },
        },
        sourceIds: { minItems: 1, maxItems: 3 },
      },
    })
  })
  it('reports all live stages as not run and exits unsuccessfully without credentials', () => {
    const result = spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/diagnose-gemini.ts'], {
      cwd: process.cwd(), env: { ...process.env, GEMINI_API_KEY: '' }, encoding: 'utf8',
    })
    expect(result.status).toBe(1)
    const stages = result.stdout.trim().split('\n').map((line) => JSON.parse(line))
    expect(stages).toHaveLength(6)
    for (const stage of stages) expect(stage).toMatchObject({ result: 'not_run', reason: 'GEMINI_API_KEY_missing' })
  })
})
