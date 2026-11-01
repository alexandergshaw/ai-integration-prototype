import type { IncomingMessage, ServerResponse } from 'node:http'

export type Request = IncomingMessage & { body?: unknown }
export const MAX_BODY_BYTES = 12 * 1024

export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function headers(res: ServerResponse) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
}

export function json(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(data))
}

export function failure(res: ServerResponse, error: unknown) {
  if (error instanceof HttpError) json(res, error.status, { error: error.message })
  else json(res, 500, { error: 'The request could not be completed.' })
}

export function sameOrigin(req: Request) {
  const host = req.headers.host
  const origin = req.headers.origin
  if (!host || !origin || host.length > 260 ||
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*|\[[a-f0-9:]+\])(?::[0-9]{1,5})?$/i.test(host)) {
    throw new HttpError(403, 'A same-origin request is required.')
  }
  try {
    const parsed = new URL(origin)
    const expected = new URL(`${parsed.protocol}//${host}`)
    if (!['https:', 'http:'].includes(parsed.protocol) ||
      (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') ||
      parsed.origin !== origin || parsed.origin !== expected.origin ||
      parsed.username || parsed.password) throw new Error('Invalid origin')
  } catch {
    throw new HttpError(403, 'A same-origin request is required.')
  }
}

export async function readJson(req: Request): Promise<unknown> {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type'] ?? '')) {
    throw new HttpError(415, 'Use application/json.')
  }
  const length = req.headers['content-length']
  if (length !== undefined && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)))) {
    throw new HttpError(400, 'Invalid Content-Length.')
  }
  if (length !== undefined && Number(length) > MAX_BODY_BYTES) throw new HttpError(413, 'Request body is too large.')
  let raw: string
  if (req.body !== undefined) {
    try {
      raw = typeof req.body === 'string' ? req.body : Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body)
      if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES ||
        (Buffer.isBuffer(req.body) && req.body.length > MAX_BODY_BYTES)) {
        throw new HttpError(413, 'Request body is too large.')
      }
    } catch (error) {
      if (error instanceof HttpError) throw error
      throw new HttpError(400, 'Invalid JSON body.')
    }
  } else {
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of req) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += bytes.length
      if (size > MAX_BODY_BYTES) throw new HttpError(413, 'Request body is too large.')
      chunks.push(bytes)
    }
    raw = Buffer.concat(chunks).toString('utf8')
  }
  try {
    return JSON.parse(raw)
  } catch {
    throw new HttpError(400, 'Invalid JSON body.')
  }
}
