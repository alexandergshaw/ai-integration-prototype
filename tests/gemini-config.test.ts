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

  it('respects explicit model configuration and defaults to the documented model', () => {
    expect(getGeminiModel({ GEMINI_MODEL: '  gemini-custom-model  ' })).toBe('gemini-custom-model')
    expect(getGeminiModel({ GEMINI_MODEL: '  ' })).toBe(DEFAULT_GEMINI_MODEL)
    expect(DEFAULT_GEMINI_MODEL).toBe('gemini-2.5-flash')
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
