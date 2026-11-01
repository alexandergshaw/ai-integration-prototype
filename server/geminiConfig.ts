import { HttpError } from './http.ts'

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash'
export const GEMINI_MAX_OUTPUT_TOKENS = 8192
export const GEMINI_PROVIDER_TIMEOUT_MS = 60_000

export function getGeminiApiKey(env: NodeJS.ProcessEnv = process.env) {
  const canonical = env.GEMINI_API_KEY?.trim()
  if (canonical) return canonical
  const compatibilityAlias = env.Gemini_LLM_API_Key?.trim()
  if (compatibilityAlias) return compatibilityAlias
  throw new HttpError(
    503,
    'The coach provider is not configured. Ask the project owner to set GEMINI_API_KEY (or the compatibility alias Gemini_LLM_API_Key) in the Vercel project environment settings, or in the local server environment for Vite, then redeploy. Your work is unchanged.',
  )
}

export function getGeminiModel(env: NodeJS.ProcessEnv = process.env) {
  const model = env.GEMINI_MODEL?.trim()
  if (!model) return DEFAULT_GEMINI_MODEL
  // Check syntax only; provider model availability and access remain Google's decision.
  if (model === 'GEMINI_MODEL' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*(?:\/[a-zA-Z0-9][a-zA-Z0-9._-]*)*$/.test(model)) {
    throw new HttpError(
      503,
      'The Gemini model setting is invalid. Set GEMINI_MODEL to a supported model ID, such as gemini-2.5-flash, or remove the override to use the application default. Redeploy after changing Vercel environment variables. Your work is unchanged.',
    )
  }
  return model
}

export function getGeminiGenerationOptions(model: string) {
  return {
    maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
    ...(model === 'gemini-2.5-flash' ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
  }
}
