import { randomUUID } from 'node:crypto'
import type { ServerResponse } from 'node:http'
import { coachRequestSchema } from '../shared/schemas.ts'
import { generateSuggestion } from '../server/coach.ts'
import { failure, headers, HttpError, json, readJson, sameOrigin } from '../server/http.ts'
import type { Request } from '../server/http.ts'
import { requireSession } from '../server/session.ts'

export default async function coach(req: Request, res: ServerResponse) {
  headers(res)
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      throw new HttpError(405, 'Method not allowed.')
    }
    sameOrigin(req)
    requireSession(req)
    const parsed = coachRequestSchema.safeParse(await readJson(req))
    if (!parsed.success) throw new HttpError(400, 'Invalid coach request.')
    const suggestion = await generateSuggestion(parsed.data)
    json(res, 200, { id: randomUUID(), requestId: parsed.data.requestId, suggestion })
  } catch (error) {
    failure(res, error)
  }
}
