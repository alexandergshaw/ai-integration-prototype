import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import type { ServerResponse } from 'node:http'
import { HttpError } from './http.ts'
import type { Request } from './http.ts'

export const COOKIE_NAME = 'inquiryloop_session'
export const SESSION_SECONDS = 2 * 60 * 60

export function configuration() {
  const code = process.env.DEMO_ACCESS_CODE
  const secret = process.env.SESSION_SECRET
  if (!code || code.trim().length < 24 || !secret || secret.trim().length < 32) {
    throw new HttpError(503, 'Demo access is not configured. Ask the project owner to set DEMO_ACCESS_CODE (at least 24 characters) and SESSION_SECRET (at least 32 characters) in Vercel project environment settings and redeploy.')
  }
  return { code, secret }
}

function equal(left: string, right: string) {
  return timingSafeEqual(createHash('sha256').update(left).digest(), createHash('sha256').update(right).digest())
}

export function validCode(code: string) {
  return equal(code, configuration().code)
}

function signature(payload: string, secret: string) {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

export function authenticated(req: Request): boolean {
  const { secret } = configuration()
  const cookies = (req.headers.cookie ?? '').split(';').map((part) => part.trim())
    .filter((part) => part.startsWith(`${COOKIE_NAME}=`))
  if (cookies.length !== 1) return false
  const token = cookies[0]!.slice(COOKIE_NAME.length + 1)
  if (token.length > 512) return false
  const parts = token.split('.')
  if (parts.length !== 2) return false
  const [payload, signed] = parts as [string, string]
  if (!/^[A-Za-z0-9_-]+$/.test(payload) || !/^[A-Za-z0-9_-]{43}$/.test(signed) ||
    !equal(signed, signature(payload, secret))) return false
  try {
    const data: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (!data || typeof data !== 'object' || !('exp' in data) || !('nonce' in data)) return false
    const now = Math.floor(Date.now() / 1000)
    return typeof data.exp === 'number' && Number.isInteger(data.exp) &&
      data.exp > now && data.exp <= now + SESSION_SECONDS && typeof data.nonce === 'string'
  } catch {
    return false
  }
}

export function requireSession(req: Request) {
  if (!authenticated(req)) throw new HttpError(401, 'Sign in to use the coach.')
}

export function setSession(res: ServerResponse, login: boolean) {
  const { secret } = configuration()
  const payload = Buffer.from(JSON.stringify({
    exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS, nonce: randomUUID(),
  })).toString('base64url')
  const token = login ? `${payload}.${signature(payload, secret)}` : ''
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${login ? SESSION_SECONDS : 0}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`)
}
