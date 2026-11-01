import { randomUUID } from 'node:crypto'
import { GoogleGenAI } from '@google/genai'
import type { GenerateContentParameters } from '@google/genai'
import { z } from 'zod'
import { sourceIds } from '../shared/evidence.ts'
import type { CoachRequest } from '../shared/schemas.ts'
import { classifyProviderError, configuredModel, GEMINI_HTTP_OPTIONS, generateSuggestion, logCoachFailure, responseText } from '../server/coach.ts'

const minimal = z.object({ message: z.string() }).strict()
function tokenCount(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
}
const common = { sourceIds: [...sourceIds], requestId: randomUUID() }
const requests: CoachRequest[] = [
  { action: 'challenge', educatorInterpretation: 'The fictional metrics show different scores but group overlap is unknown.', ...common },
  { action: 'refine_inquiry', confirmedInterpretation: 'The fictional scores do not establish individual reasoning or causation.',
    inquiryDraft: 'How do students explain why tenths multiplied by tenths give hundredths?', ...common },
  { action: 'suggest_activity', confirmedInquiry: 'How do students connect a decimal area model to hundredths?', ...common },
]

async function diagnose() {
  const model = configuredModel()
  const stages = ['A_connectivity', 'B_json_mode', 'C_minimal_schema', ...requests.map((request) => `D_${request.action}`)]
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) {
    for (const stage of stages) console.info(JSON.stringify({ stage, model, result: 'not_run', reason: 'GEMINI_API_KEY_missing' }))
    process.exitCode = 1
    return
  }
  const client = new GoogleGenAI({ apiKey, vertexai: false, httpOptions: GEMINI_HTTP_OPTIONS })
  for (const [index, stage] of stages.entries()) {
    const requestId = randomUUID()
    const action = requests[index - 3]?.action
    try {
      if (index < 3) {
        const payload: GenerateContentParameters = {
          model, contents: index === 0 ? 'Reply with OK.' : 'Return a JSON object with message equal to OK.',
          config: {
            maxOutputTokens: 2200,
            automaticContinuation: false,
            ...(index > 0 ? { responseMimeType: 'application/json' } : {}),
            ...(index === 2 ? { responseJsonSchema: {
              type: 'object', properties: { message: { type: 'string' } }, required: ['message'], additionalProperties: false,
            } } : {}),
          },
        }
        const response = await client.models.generateContent(payload)
        const text = responseText(response)
        if (index > 0) {
          const output: unknown = JSON.parse(text)
          if (index === 2) minimal.parse(output)
        }
        console.info(JSON.stringify({ stage, model, requestId, result: 'passed', finishReason: 'STOP',
          outputTokens: tokenCount(response.usageMetadata?.candidatesTokenCount),
          thinkingTokens: tokenCount(response.usageMetadata?.thoughtsTokenCount) }))
      } else {
        const request = requests[index - 3]!
        await generateSuggestion({ ...request, requestId })
        console.info(JSON.stringify({ stage, model, requestId, result: 'passed', localValidation: true }))
      }
    } catch (error) {
      logCoachFailure(classifyProviderError(error), requestId, action)
      console.info(JSON.stringify({ stage, model, requestId, result: 'failed' }))
      process.exitCode = 1
    }
  }
}

try {
  await diagnose()
} catch (error) {
  logCoachFailure(classifyProviderError(error), randomUUID())
  process.exitCode = 1
}
