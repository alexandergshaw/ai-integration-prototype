import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { HttpError } from '../server/http.ts'
import {
  DEFAULT_GEMINI_MODEL,
  GEMINI_MAX_OUTPUT_TOKENS,
  GEMINI_PROVIDER_TIMEOUT_MS,
  getGeminiApiKey,
  getGeminiGenerationOptions,
  getGeminiModel,
} from '../server/geminiConfig.ts'

describe('server-only Gemini configuration', () => {
  it('trims and prefers a nonblank canonical key over its compatibility alias', () => {
    expect(getGeminiApiKey({ GEMINI_API_KEY: '  canonical-key \n', Gemini_LLM_API_Key: 'alias-key' })).toBe('canonical-key')
  })

  it.each([
    { GEMINI_API_KEY: '', Gemini_LLM_API_Key: ' alias-key ' },
    { GEMINI_API_KEY: '   ', Gemini_LLM_API_Key: ' alias-key ' },
    { Gemini_LLM_API_Key: ' alias-key ' },
  ])('uses the compatibility alias only when the canonical key is absent or blank', (env) => {
    expect(getGeminiApiKey(env)).toBe('alias-key')
  })

  it('fails with an actionable configuration error before any SDK request', () => {
    expect(() => getGeminiApiKey({ GEMINI_API_KEY: ' ', Gemini_LLM_API_Key: '\t' }))
      .toThrow(expect.objectContaining({ status: 503, message: expect.stringContaining('GEMINI_API_KEY') }))
    try {
      getGeminiApiKey({})
    } catch (error) {
      expect(JSON.stringify(error)).not.toContain('secret')
      expect(error).toBeInstanceOf(HttpError)
    }
  })

  it.each([{}, { GEMINI_MODEL: '' }, { GEMINI_MODEL: ' \t\n ' }])(
    'uses the default for an absent or blank model override',
    (env) => {
      expect(getGeminiModel(env)).toBe(DEFAULT_GEMINI_MODEL)
    },
  )

  it('keeps the documented default model', () => {
    expect(DEFAULT_GEMINI_MODEL).toBe('gemini-2.5-flash')
  })

  it.each([
    ['gemini-2.5-flash', 'gemini-2.5-flash'],
    [' \tgemini-2.5-flash \n', 'gemini-2.5-flash'],
    ['gemini-future-model-preview', 'gemini-future-model-preview'],
    ['models/gemini-custom-model', 'models/gemini-custom-model'],
    ['projects/demo/locations/global/publishers/google/models/gemini-custom', 'projects/demo/locations/global/publishers/google/models/gemini-custom'],
  ])('supports a syntactically valid override without a version allowlist', (value, expected) => {
    expect(getGeminiModel({ GEMINI_MODEL: value })).toBe(expected)
  })

  it.each([
    'GEMINI_MODEL', ' GEMINI_MODEL ',
    '${GEMINI_MODEL}', '$GEMINI_MODEL',
    'GEMINI_MODEL=gemini-2.5-flash',
    '"gemini-2.5-flash"', "'gemini-2.5-flash'", '`gemini-2.5-flash`',
    'gemini 2.5 flash', 'gemini-2.5-\nflash', 'gemini-\0flash',
    'https://example.com/models/gemini-2.5-flash',
    'models//gemini-2.5-flash', 'models/', '../gemini-2.5-flash',
    'gemini-2.5-flash?key=private-value',
  ])('rejects malformed configuration without echoing it', (value) => {
    expect(() => getGeminiModel({ GEMINI_MODEL: value })).toThrow(expect.objectContaining({
      status: 503,
      message: 'The Gemini model setting is invalid. Set GEMINI_MODEL to a supported model ID, such as gemini-2.5-flash, or remove the override to use the application default. Redeploy after changing Vercel environment variables. Your work is unchanged.',
    }))
  })

  it('applies thinking only to Gemini 2.5 Flash and shares the named output/timeout baselines', () => {
    expect(getGeminiGenerationOptions('gemini-2.5-flash')).toEqual({
      maxOutputTokens: 8192,
      thinkingConfig: { thinkingBudget: 0 },
    })
    expect(getGeminiGenerationOptions('gemini-configured-model')).toEqual({ maxOutputTokens: 8192 })
    expect(GEMINI_MAX_OUTPUT_TOKENS).toBe(8192)
    expect(GEMINI_PROVIDER_TIMEOUT_MS).toBe(60_000)
    const vercel = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'))
    expect(vercel.functions['api/*.ts'].maxDuration).toBe(90)
  })
})
