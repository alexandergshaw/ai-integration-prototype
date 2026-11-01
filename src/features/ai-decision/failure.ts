export const GUIDED_PLANNING_WAIT_MS = 8_000

type RequestFailure = { kind: 'recoverable' } | { kind: 'application'; message: string }

export function classifyResponse(status: number, body: unknown): RequestFailure {
  // Application/access status wins even if a proxy or malformed body claims otherwise.
  if ([400, 401, 403, 404, 405, 413, 415, 422].includes(status)) {
    return { kind: 'application', message: status === 401
      ? 'Your session has expired. Copy any work you want to keep, then use Lock demo to sign in again.'
      : 'This request is not permitted. Your draft is unchanged. Check your session and authorized evidence before trying again.' }
  }
  if (body && typeof body === 'object' && 'category' in body && body.category === 'application_failure') {
    return { kind: 'application', message: 'The application could not accept this request. Your draft is unchanged.' }
  }
  return { kind: 'recoverable' }
}
