import type { ServerResponse } from 'node:http'
import { z } from 'zod'
import { authenticated, configuration, setSession, validCode } from '../server/session.ts'
import { failure, headers, HttpError, json, readJson, sameOrigin } from '../server/http.ts'
import type { Request } from '../server/http.ts'

const loginSchema = z.object({ code: z.string().min(1).max(2000) }).strict()

export default async function session(req: Request, res: ServerResponse) {
  headers(res)
  try {
    if (!['GET', 'POST', 'DELETE'].includes(req.method ?? '')) {
      res.setHeader('Allow', 'GET, POST, DELETE')
      throw new HttpError(405, 'Method not allowed.')
    }
    configuration()
    if (req.method === 'GET') {
      json(res, 200, { authenticated: authenticated(req) })
      return
    }
    sameOrigin(req)
    const body = await readJson(req)
    if (req.method === 'DELETE') {
      if (!z.object({}).strict().safeParse(body).success) throw new HttpError(400, 'Invalid logout request.')
      setSession(res, false)
      json(res, 200, { authenticated: false })
      return
    }
    const parsed = loginSchema.safeParse(body)
    if (!parsed.success) throw new HttpError(400, 'Invalid login request.')
    if (!validCode(parsed.data.code)) throw new HttpError(401, 'Invalid access code.')
    setSession(res, true)
    json(res, 200, { authenticated: true })
  } catch (error) {
    failure(res, error)
  }
}
