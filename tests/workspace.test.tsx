import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App, { Workspace } from '../src/App'
import { initialState } from '../src/features/ai-decision/state'
import { challenge, refinement, rehearsal } from './fixtures'
import type { Suggestion } from '../shared/schemas'

const fetchMock = vi.fn()
function providerFailure(status = 502) {
  fetchMock.mockResolvedValueOnce({
    ok: false, status, json: async () => ({ error: 'Sensitive provider detail', category: 'provider_failure' }),
  })
}
function modelResponse(suggestion: Suggestion) {
  fetchMock.mockImplementationOnce(async (_url, options) => ({
    ok: true, status: 200,
    json: async () => ({ id: crypto.randomUUID(), requestId: JSON.parse(options.body).requestId, suggestion }),
  }))
}
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  fetchMock.mockReset()
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks() })

describe('Workspace interaction and provider-idle boundaries', () => {
  it('loads signed-session gate without requesting AI', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ authenticated: false }) })
    render(<App />)
    const code = await screen.findByLabelText('Demo access code') as HTMLInputElement
    expect(code.type).toBe('password')
    expect(screen.getByRole('heading', { name: 'AI Coaching Workspace' })).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/session')
  })

  it('shows and hides the access code without submitting the form', async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ authenticated: false }) })
    render(<App />)
    const code = await screen.findByLabelText('Demo access code') as HTMLInputElement
    await user.type(code, 'demo-code')
    await user.click(screen.getByRole('button', { name: 'Show password' }))
    expect(code.type).toBe('text')
    expect(code.value).toBe('demo-code')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(code.type).toBe('password')
    expect(code.value).toBe('demo-code')
  })

  it('frames the workspace as a prototype with optional AI and guided support', () => {
    render(<Workspace onLock={() => {}} />)
    expect(screen.getByRole('heading', { name: 'AI Coaching Workspace' })).toBeTruthy()
    expect(screen.getByText('Prototype')).toBeTruthy()
    expect(screen.getByText('Fictional Grade 5 data')).toBeTruthy()
    expect(screen.getByText('Optional assistance')).toBeTruthy()
    expect(screen.getByText('No suggestion to review')).toBeTruthy()
  })

  it('typing and inspecting evidence do not request AI; explicit request sends current text', async () => {
    const user = userEvent.setup()
    render(<Workspace onLock={() => {}} />)
    fireEvent.change(screen.getByLabelText('Your Interpretation'), { target: { value: 'Perhaps explanation language is a barrier.' } })
    await user.click(screen.getByText('Evidence & lesson context'))
    expect(fetchMock).not.toHaveBeenCalled()
    modelResponse(challenge)
    await user.click(screen.getByRole('button', { name: 'Challenge my interpretation' }))
    expect(await screen.findByRole('button', { name: 'Accept suggestion' })).toBeTruthy()
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(payload.educatorInterpretation).toBe('Perhaps explanation language is a barrier.')
    expect(payload.sourceIds).toHaveLength(4)
    expect(Object.keys(payload).sort()).toEqual(['action', 'educatorInterpretation', 'requestId', 'sourceIds'])
  })

  it('preserves educator work on Reject and requires separate confirmation through each step', async () => {
    const user = userEvent.setup()
    render(<Workspace onLock={() => {}} />)
    modelResponse(challenge)
    await user.click(screen.getByRole('button', { name: 'Challenge my interpretation' }))
    await user.click(await screen.findByRole('button', { name: 'Reject suggestion' }))
    expect((screen.getByLabelText('Your Interpretation') as HTMLTextAreaElement).value).toBe(initialState.educatorInterpretation)
    await user.click(screen.getByRole('button', { name: /Confirm interpretation and continue/ }))
    modelResponse(refinement)
    await user.click(screen.getByRole('button', { name: 'Suggest a stronger PLC question' }))
    await user.click(await screen.findByRole('button', { name: 'Reject suggestion' }))
    expect((screen.getByLabelText('Your PLC Question') as HTMLTextAreaElement).value).toBe(initialState.inquiryDraft)
    await user.click(screen.getByRole('button', { name: 'Confirm inquiry →' }))
    fireEvent.change(screen.getByLabelText('Activity preview'), { target: { value: 'My custom rehearsal' } })
    modelResponse(rehearsal)
    await user.click(screen.getByRole('button', { name: 'Suggest a PLC activity' }))
    await user.click(await screen.findByRole('button', { name: 'Reject suggestion' }))
    expect((screen.getByLabelText('Activity preview') as HTMLTextAreaElement).value).toBe('My custom rehearsal')
    expect(JSON.stringify(JSON.parse(fetchMock.mock.calls[2][1].body))).not.toContain('Students may understand')
  })

  it('accepts AI suggestions into editable drafts without confirmation and reviews activity alignment separately', async () => {
    const user = userEvent.setup()
    render(<Workspace onLock={() => {}} />)
    modelResponse(challenge)
    await user.click(screen.getByRole('button', { name: 'Challenge my interpretation' }))
    await user.click(await screen.findByRole('button', { name: 'Accept suggestion' }))
    expect((screen.getByLabelText('Your Interpretation') as HTMLTextAreaElement).value)
      .toBe(challenge.action === 'challenge' && challenge.revisedInterpretation)
    expect(screen.queryByRole('button', { name: 'Suggest a PLC activity' })).toBeNull()
    await user.click(screen.getByRole('button', { name: /Confirm interpretation and continue/ }))
    modelResponse(refinement)
    await user.click(screen.getByRole('button', { name: 'Suggest a stronger PLC question' }))
    await user.click(await screen.findByRole('button', { name: 'Accept suggestion' }))
    expect(screen.queryByText('EDUCATOR CONFIRMED · REQUEST CONTEXT')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Confirm inquiry →' }))
    modelResponse(rehearsal)
    await user.click(screen.getByRole('button', { name: 'Suggest a PLC activity' }))
    await user.click(await screen.findByRole('button', { name: 'Accept suggestion' }))
    expect((screen.getByLabelText('Activity preview') as HTMLTextAreaElement).value).toContain('Rehearse an area-model explanation')
    await user.click(screen.getByRole('button', { name: 'Confirm activity' }))
    await user.click(screen.getByRole('button', { name: /Refine/ }))
    fireEvent.change(screen.getByLabelText('Your PLC Question'), { target: { value: 'How do students identify a hundredth?' } })
    await user.click(screen.getByRole('button', { name: 'Confirm inquiry →' }))
    expect(screen.getByText('Needs review')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Confirm activity' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('completes all three planning steps after provider failures, preserving exact educator work', async () => {
    const user = userEvent.setup()
    render(<Workspace onLock={() => {}} />)
    const interpretation = '  Educator-authored hypothesis — preserve exactly.  '
    fireEvent.change(screen.getByLabelText('Your Interpretation'), { target: { value: interpretation } })
    providerFailure()
    await user.click(screen.getByRole('button', { name: 'Challenge my interpretation' }))
    expect(await screen.findByText('Continue shaping your interpretation.')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect((screen.getByLabelText('Your Interpretation') as HTMLTextAreaElement).value).toBe(interpretation)
    await user.click(screen.getByRole('button', { name: /Continue with my interpretation/ }))

    const inquiry = '  What do learners say each overlapping cell represents?  '
    fireEvent.change(screen.getByLabelText('Your PLC Question'), { target: { value: inquiry } })
    providerFailure()
    await user.click(screen.getByRole('button', { name: 'Try AI' }))
    expect(await screen.findByText('Build your inquiry from the evidence.')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect((screen.getByLabelText('Your PLC Question') as HTMLTextAreaElement).value).toBe(inquiry)
    await user.click(screen.getByRole('button', { name: 'Confirm inquiry →' }))

    const activity = '  Our team-authored rehearsal, with original spacing.  '
    fireEvent.change(screen.getByLabelText('Activity preview'), { target: { value: activity } })
    providerFailure()
    await user.click(screen.getByRole('button', { name: 'Try AI' }))
    expect(await screen.findByText('Shape your 15-minute rehearsal.')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect((screen.getByLabelText('Activity preview') as HTMLTextAreaElement).value).toBe(activity)
    expect(screen.getByRole('heading', { name: 'Your decision trail 0' })).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(3)
    await user.click(screen.getByRole('button', { name: 'Confirm activity' }))
    expect((screen.getByLabelText('Activity preview') as HTMLTextAreaElement).value).toBe(activity)
  })

  it('keeps guide across edits and steps; local example display is explicit and never auto-accepts', async () => {
    const user = userEvent.setup()
    render(<Workspace onLock={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'Use guided planning' }))
    expect(screen.getByText('Guided planning is ready. Your draft is unchanged.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Your Interpretation'), { target: { value: 'Edited while using the guide.' } })
    expect(screen.getByText('Continue shaping your interpretation.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /Continue with my interpretation/ }))
    expect(screen.getByText('Build your inquiry from the evidence.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Confirm inquiry →' }))
    expect(screen.getByText('Shape your 15-minute rehearsal.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Activity preview'), { target: { value: 'My editable rehearsal.' } })
    expect(screen.getByText('Shape your 15-minute rehearsal.')).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()

    await user.click(screen.getByText('Example for the fictional scenario'))
    await user.click(screen.getByRole('button', { name: 'View example' }))
    expect(await screen.findByText('Built-in example ready for review.')).toBeTruthy()
    expect((screen.getByLabelText('Activity preview') as HTMLTextAreaElement).value).toBe('My editable rehearsal.')
    expect(screen.getByRole('heading', { name: 'Your decision trail 1' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Accept suggestion' })).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('retains demo provenance through editing and requires separate activity alignment review', async () => {
    const user = userEvent.setup()
    render(<Workspace onLock={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'Use guided planning' }))
    await user.click(screen.getByRole('button', { name: /Continue with my interpretation/ }))
    await user.click(screen.getByRole('button', { name: 'Confirm inquiry →' }))
    await user.click(screen.getByText('Example for the fictional scenario'))
    await user.click(screen.getByRole('button', { name: 'View example' }))
    await user.click(await screen.findByRole('button', { name: 'Accept suggestion' }))
    const activity = screen.getByLabelText('Activity preview') as HTMLTextAreaElement
    expect(activity.value).toContain('Rehearse making hundredths visible')
    expect(screen.getByText('Needs review')).toBeTruthy()
    fireEvent.change(activity, { target: { value: `${activity.value}\nEducator edit.` } })
    expect(screen.getAllByText(/Started from a built-in example/).length).toBeGreaterThan(0)
    expect((screen.getByRole('button', { name: 'Confirm activity' }) as HTMLButtonElement).disabled).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Review accepted activity' }))
    await user.click(screen.getByRole('button', { name: 'Confirm activity' }))
    expect(screen.getAllByText('Educator confirmed').length).toBeGreaterThan(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([429, 502, 503, 504])('moves directly to guidance for provider status %i without flashing an alert', async (status) => {
    providerFailure(status)
    render(<Workspace onLock={() => {}} />)
    const alerts: Node[] = []
    const observer = new MutationObserver((records) => {
      for (const record of records) for (const node of record.addedNodes) {
        if (node instanceof Element && (node.matches('[role="alert"]') || node.querySelector('[role="alert"]'))) alerts.push(node)
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
    fireEvent.click(screen.getByRole('button', { name: 'Challenge my interpretation' }))
    await screen.findByText('Continue shaping your interpretation.')
    await act(async () => {})
    observer.disconnect()
    expect(alerts).toEqual([])
    expect(document.querySelector('.service-details')?.hasAttribute('open')).toBe(false)
    expect(screen.queryByText('Sensitive provider detail')).toBeNull()
  })

  it('starts guided planning on provider, platform, network, non-JSON, and invalid-output failures', async () => {
    const cases = ['provider', 'platform', 'network', 'non-json', 'invalid-output'] as const
    for (const kind of cases) {
      cleanup()
      fetchMock.mockReset()
      if (kind === 'provider') providerFailure()
      if (kind === 'platform') fetchMock.mockResolvedValueOnce({
        ok: false, status: 502, json: async () => ({ category: 'platform_failure', error: 'Platform detail' }),
      })
      if (kind === 'network') fetchMock.mockRejectedValueOnce(new TypeError('Network unavailable'))
      if (kind === 'non-json') fetchMock.mockResolvedValueOnce({
        ok: false, status: 503, json: async () => { throw new SyntaxError('not JSON') },
      })
      if (kind === 'invalid-output') modelResponse({ ...challenge, sourceIds: ['invented-source'] })
      render(<Workspace onLock={() => {}} />)
      fireEvent.click(screen.getByRole('button', { name: 'Challenge my interpretation' }))
      expect(await screen.findByText('Continue shaping your interpretation.')).toBeTruthy()
      expect(screen.queryByRole('alert')).toBeNull()
      expect(screen.queryByRole('button', { name: 'Accept suggestion' })).toBeNull()
      expect(screen.queryByRole('link', { name: /invented-source/ })).toBeNull()
      expect(screen.getByRole('heading', { name: 'Your decision trail 0' })).toBeTruthy()
    }
  })

  it.each(['malformed-success', 'empty-success', 'wrong-request-id'] as const)('guides safely after %s output', async (kind) => {
    fetchMock.mockImplementationOnce(async () => ({
      ok: true, status: 200, json: async () => {
        if (kind === 'malformed-success') throw new SyntaxError('private output')
        if (kind === 'empty-success') return null
        return { id: crypto.randomUUID(), requestId: crypto.randomUUID(), suggestion: challenge }
      },
    }))
    render(<Workspace onLock={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Challenge my interpretation' }))
    await screen.findByText('Continue shaping your interpretation.')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Accept suggestion' })).toBeNull()
    expect((screen.getByLabelText('Your Interpretation') as HTMLTextAreaElement).value).toBe(initialState.educatorInterpretation)
  })

  it('keeps a non-JSON access failure visible even while the educator edits', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, json: async () => { throw new SyntaxError('HTML sign-in page') } })
    render(<Workspace onLock={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Challenge my interpretation' }))
    expect((await screen.findByRole('alert')).textContent).toContain('session has expired')
    fireEvent.change(screen.getByLabelText('Your Interpretation'), { target: { value: 'Keep my work.' } })
    expect(screen.getByRole('alert').textContent).toContain('session has expired')
    expect((screen.getByRole('button', { name: 'Use guided planning' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it.each(['Use guided planning', 'Cancel request'])('retires a pending call immediately through %s and ignores late output', async (control) => {
    vi.useFakeTimers()
    let finish: ((response: unknown) => void) | undefined
    let signal: AbortSignal | undefined
    fetchMock.mockImplementationOnce((_url, options) => {
      signal = options.signal
      return new Promise((resolve) => { finish = resolve })
    })
    render(<Workspace onLock={() => {}} />)
    const draft = '  My hypothesis, unchanged byte for byte.  '
    fireEvent.change(screen.getByLabelText('Your Interpretation'), { target: { value: draft } })
    fireEvent.click(screen.getByRole('button', { name: 'Challenge my interpretation' }))
    fireEvent.click(screen.getByRole('button', { name: control }))
    expect(signal?.aborted).toBe(true)
    expect(screen.getByText('Continue shaping your interpretation.')).toBeTruthy()
    expect((screen.getByRole('button', { name: /Continue with my interpretation/ }) as HTMLButtonElement).disabled).toBe(false)
    expect(document.querySelector('.service-details')).toBeNull()
    const requestId = JSON.parse(fetchMock.mock.calls[0][1].body).requestId
    await act(async () => {
      finish?.({ ok: true, json: async () => ({ id: crypto.randomUUID(), requestId, suggestion: challenge }) })
      await vi.advanceTimersByTimeAsync(8_000)
    })
    expect((screen.getByLabelText('Your Interpretation') as HTMLTextAreaElement).value).toBe(draft)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Accept suggestion' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Your decision trail 0' })).toBeTruthy()
  })

  it('uses the keyboard for local support and keeps double-clicked example decisions singular', async () => {
    const user = userEvent.setup()
    render(<Workspace onLock={() => {}} />)
    screen.getByRole('button', { name: 'Use guided planning' }).focus()
    await user.keyboard('{Enter}')
    expect(document.activeElement?.id).toBe('suggestion-title')
    screen.getByText('Example for the fictional scenario').focus()
    await user.keyboard('{Enter}')
    const example = screen.getByRole('button', { name: 'View example' })
    act(() => { example.click(); example.click() })
    expect(screen.getByRole('heading', { name: 'Your decision trail 1' })).toBeTruthy()
    const reject = screen.getByRole('button', { name: 'Reject suggestion' })
    reject.focus()
    await user.keyboard('{Enter}')
    expect((screen.getByLabelText('Your Interpretation') as HTMLTextAreaElement).value).toBe(initialState.educatorInterpretation)
    expect(screen.getByText('rejected')).toBeTruthy()
    expect(screen.getByText('Built-in example')).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true)
    fireEvent.click(screen.getByRole('button', { name: 'Reset demo' }))
    expect(screen.queryByText('Built-in guide')).toBeNull()
    expect(screen.queryByText('Built-in example')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Your decision trail 0' })).toBeTruthy()
  })

  it.each([400, 401, 403, 404, 405, 413, 415, 422])('keeps application/access status %i as safe alert and blocks local support', async (status) => {
    fetchMock.mockResolvedValueOnce({
      ok: false, status, json: async () => ({ error: 'Sensitive server detail', category: 'application_failure' }),
    })
    render(<Workspace onLock={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Challenge my interpretation' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).not.toContain('Sensitive server detail')
    if (status === 401) expect(alert.textContent).toContain('session has expired')
    else expect(alert.textContent).toContain('request is not permitted')
    expect(screen.queryByText('Continue shaping your interpretation.')).toBeNull()
    expect((screen.getByRole('button', { name: 'Use guided planning' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByRole('button', { name: 'View example' })).toBeNull()
  })

  it('blocks structured application failures even on otherwise recoverable status', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false, status: 503, json: async () => ({ category: 'application_failure', error: 'Raw backend detail' }),
    })
    render(<Workspace onLock={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Challenge my interpretation' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByText('Continue shaping your interpretation.')).toBeNull()
    expect(screen.queryByText('Raw backend detail')).toBeNull()
    expect((screen.getByRole('button', { name: 'Use guided planning' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('does not steal focus on automatic guide activation; explicit guide action focuses support', async () => {
    const user = userEvent.setup()
    providerFailure()
    render(<Workspace onLock={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'Challenge my interpretation' }))
    await screen.findByText('Continue shaping your interpretation.')
    expect(document.activeElement?.id).not.toBe('suggestion-title')
    await user.click(screen.getByRole('button', { name: 'Use guided planning' }))
    expect(document.activeElement?.id).toBe('suggestion-title')
  })

  it('honors the 8000ms deadline, aborts the request, and ignores a late successful response', async () => {
    vi.useFakeTimers()
    let finish: ((response: unknown) => void) | undefined
    let signal: AbortSignal | undefined
    fetchMock.mockImplementationOnce((_url, options) => {
      signal = options.signal
      return new Promise((resolve) => { finish = resolve })
    })
    render(<Workspace onLock={() => {}} />)
    const text = 'Keep exactly this educator-authored text.'
    fireEvent.change(screen.getByLabelText('Your Interpretation'), { target: { value: text } })
    fireEvent.click(screen.getByRole('button', { name: 'Challenge my interpretation' }))
    expect(signal?.aborted).toBe(false)
    await act(async () => { await vi.advanceTimersByTimeAsync(7_999) })
    expect(signal?.aborted).toBe(false)
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(signal?.aborted).toBe(true)
    expect(screen.getByText('The workspace waiting limit was reached; this does not establish a provider failure. Stopping the browser request does not guarantee provider processing or charges stopped.')).toBeTruthy()
    expect(screen.getByText('Guided planning is ready. Your draft is unchanged.')).toBeTruthy()
    const requestId = JSON.parse(fetchMock.mock.calls[0][1].body).requestId
    await act(async () => {
      finish?.({ ok: true, json: async () => ({ id: crypto.randomUUID(), requestId, suggestion: challenge }) })
    })
    expect((screen.getByLabelText('Your Interpretation') as HTMLTextAreaElement).value).toBe(text)
    expect(screen.getByRole('heading', { name: 'Your decision trail 0' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Accept suggestion' })).toBeNull()
  })

  it('ignores a late response after editing the active request', async () => {
    let finish: ((response: unknown) => void) | undefined
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    render(<Workspace onLock={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Challenge my interpretation' }))
    fireEvent.change(screen.getByLabelText('Your Interpretation'), { target: { value: 'Edited after request start.' } })
    const requestId = JSON.parse(fetchMock.mock.calls[0][1].body).requestId
    await act(async () => { finish?.({ ok: true, json: async () => ({ id: crypto.randomUUID(), requestId, suggestion: challenge }) }) })
    expect((screen.getByLabelText('Your Interpretation') as HTMLTextAreaElement).value).toBe('Edited after request start.')
    expect(screen.queryByRole('button', { name: 'Accept suggestion' })).toBeNull()
  })

  it('ignores a late response after navigation, reset, or lock', async () => {
    for (const transition of ['navigation', 'reset', 'lock'] as const) {
      cleanup()
      fetchMock.mockReset()
      let finish: ((response: unknown) => void) | undefined
      const onLock = vi.fn()
      fetchMock.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
      if (transition === 'lock') fetchMock.mockResolvedValueOnce({ ok: true })
      render(<Workspace onLock={onLock} />)

      if (transition === 'navigation') {
        fireEvent.click(screen.getByRole('button', { name: /Continue with my interpretation/ }))
        fireEvent.click(screen.getByRole('button', { name: 'Confirm inquiry →' }))
        fireEvent.click(screen.getByRole('button', { name: /Refine/ }))
        fireEvent.click(screen.getByRole('button', { name: 'Suggest a stronger PLC question' }))
        fireEvent.click(screen.getByRole('button', { name: /1Challenge/ }))
      } else {
        fireEvent.click(screen.getByRole('button', { name: 'Challenge my interpretation' }))
        if (transition === 'reset') {
          vi.spyOn(window, 'confirm').mockReturnValueOnce(true)
          fireEvent.click(screen.getByRole('button', { name: 'Reset demo' }))
        } else {
          fireEvent.click(screen.getByRole('button', { name: 'Lock demo' }))
          await waitFor(() => expect(onLock).toHaveBeenCalledOnce())
        }
      }
      const requestId = JSON.parse(fetchMock.mock.calls[0][1].body).requestId
      await act(async () => {
        finish?.({ ok: true, json: async () => ({ id: crypto.randomUUID(), requestId, suggestion: transition === 'navigation' ? refinement : challenge }) })
      })
      expect(screen.queryByRole('button', { name: 'Accept suggestion' })).toBeNull()
      if (transition === 'reset') expect((screen.getByLabelText('Your Interpretation') as HTMLTextAreaElement).value).toBe(initialState.educatorInterpretation)
      if (transition === 'lock') expect(onLock).toHaveBeenCalledOnce()
    }
  })

  it('shows a loading indicator during a delayed request and sends only one request on repeated clicks', async () => {
    let finish: ((response: unknown) => void) | undefined
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    render(<Workspace onLock={() => {}} />)
    const button = screen.getByRole('button', { name: 'Challenge my interpretation' })
    fireEvent.click(button)
    fireEvent.click(button)
    fireEvent.click(button)
    expect((await screen.findAllByText('Reviewing the evidence…')).length).toBeGreaterThan(0)
    expect(document.querySelector('.suggestion-panel')?.getAttribute('aria-busy')).toBe('true')
    expect((button as HTMLButtonElement).disabled).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const requestId = JSON.parse(fetchMock.mock.calls[0][1].body).requestId
    await act(async () => { finish?.({ ok: true, json: async () => ({ id: crypto.randomUUID(), requestId, suggestion: challenge }) }) })
    expect(screen.queryByText('Reviewing the evidence…')).toBeNull()
    expect(await screen.findByRole('button', { name: 'Accept suggestion' })).toBeTruthy()
  })

  it('accepts AI then restores the exact original interpretation, keeping both reversible', async () => {
    const user = userEvent.setup()
    render(<Workspace onLock={() => {}} />)
    const original = initialState.educatorInterpretation
    modelResponse(challenge)
    await user.click(screen.getByRole('button', { name: 'Challenge my interpretation' }))
    await user.click(await screen.findByRole('button', { name: 'Accept suggestion' }))
    expect(screen.getByText('Using AI interpretation.')).toBeTruthy()
    expect((screen.getByLabelText('Your Interpretation') as HTMLTextAreaElement).value)
      .toBe(challenge.action === 'challenge' && challenge.revisedInterpretation)
    await user.click(screen.getByRole('button', { name: 'Use my original interpretation' }))
    expect(screen.getByText('Using your interpretation.')).toBeTruthy()
    expect((screen.getByLabelText('Your Interpretation') as HTMLTextAreaElement).value).toBe(original)
    await user.click(screen.getByRole('button', { name: 'Use AI interpretation' }))
    expect(screen.getByText('Using AI interpretation.')).toBeTruthy()
    expect((screen.getByLabelText('Your Interpretation') as HTMLTextAreaElement).value)
      .toBe(challenge.action === 'challenge' && challenge.revisedInterpretation)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
