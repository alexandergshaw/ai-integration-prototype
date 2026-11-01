import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App, { Workspace } from '../src/App'
import { initialState } from '../src/features/ai-decision/state'
import { challenge, refinement, rehearsal } from './fixtures'
import type { Suggestion } from '../shared/schemas'
import { demoExample } from '../shared/demoExamples'

const fetchMock = vi.fn()
function providerFailure(status = 502) {
  fetchMock.mockResolvedValueOnce({
    ok: false, status, json: async () => ({ error: 'Gemini unavailable. Your work is unchanged.', category: 'provider_failure' }),
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
    expect(screen.getByText('Review evidence, draft an inquiry, and plan a rehearsal. AI suggestions are optional.')).toBeTruthy()
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
  it('frames the workspace as a focused prototype with optional AI feedback', () => {
    render(<Workspace onLock={() => {}} />)
    expect(screen.getByRole('heading', { name: 'AI Coaching Workspace' })).toBeTruthy()
    expect(screen.getByText('Prototype')).toBeTruthy()
    expect(screen.getByText('Fictional Grade 5 data')).toBeTruthy()
    expect(screen.getByText('AI suggestion / Not confirmed')).toBeTruthy()
    expect(screen.getByText('No suggestion to review')).toBeTruthy()
  })
  it('typing and inspecting evidence do not request AI; explicit click sends current text', async () => {
    const user = userEvent.setup()
    render(<Workspace onLock={() => {}} />)
    expect(fetchMock).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Your Interpretation'), { target: { value: 'Perhaps explanation language is a barrier.' } })
    await user.click(screen.getByText('Evidence & lesson context'))
    expect(fetchMock).not.toHaveBeenCalled()
    modelResponse(challenge)
    await user.click(screen.getByRole('button', { name: 'Challenge my interpretation' }))
    expect(await screen.findByRole('button', { name: 'Accept suggestion' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Use Demo Example' })).toBeNull()
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(payload.educatorInterpretation).toBe('Perhaps explanation language is a barrier.')
    expect(payload.sourceIds).toHaveLength(4)
    expect(Object.keys(payload).sort()).toEqual(['action', 'educatorInterpretation', 'requestId', 'sourceIds'])
  })
  it('keyboard Reject preserves work, refinement Reject preserves question, activity Reject preserves custom activity', async () => {
    const user = userEvent.setup()
    render(<Workspace onLock={() => {}} />)
    modelResponse(challenge)
    await user.click(screen.getByRole('button', { name: 'Challenge my interpretation' }))
    const reject = await screen.findByRole('button', { name: 'Reject suggestion' })
    reject.focus()
    await user.keyboard('{Enter}')
    expect((screen.getByLabelText('Your Interpretation') as HTMLTextAreaElement).value).toBe(initialState.educatorInterpretation)
    await user.click(screen.getByRole('button', { name: /Confirm interpretation and continue/ }))
    expect((screen.getByLabelText('Your PLC Question') as HTMLTextAreaElement).value).toBe(initialState.inquiryDraft)
    modelResponse(refinement)
    await user.click(screen.getByRole('button', { name: 'Suggest a stronger PLC question' }))
    await user.click(await screen.findByRole('button', { name: 'Reject suggestion' }))
    await user.click(screen.getByRole('button', { name: 'Confirm inquiry →' }))
    fireEvent.change(screen.getByLabelText('Activity preview'), { target: { value: 'My custom rehearsal' } })
    modelResponse(rehearsal)
    await user.click(screen.getByRole('button', { name: 'Suggest a PLC activity' }))
    await user.click(await screen.findByRole('button', { name: 'Reject suggestion' }))
    expect((screen.getByLabelText('Activity preview') as HTMLTextAreaElement).value).toBe('My custom rehearsal')
    const activityPayload = JSON.parse(fetchMock.mock.calls[2][1].body)
    expect(activityPayload.confirmedInquiry).toBe(initialState.inquiryDraft)
    expect(JSON.stringify(activityPayload)).not.toContain('Students may understand')
    const refinementPayload = JSON.parse(fetchMock.mock.calls[1][1].body)
    expect(refinementPayload.confirmedInterpretation).toBe(initialState.educatorInterpretation)
    expect(refinementPayload.inquiryDraft).toBe(initialState.inquiryDraft)
  })
  it('accepts all three into editable artifacts; requires confirmations; visibly marks Needs review', async () => {
    const user = userEvent.setup()
    render(<Workspace onLock={() => {}} />)
    modelResponse(challenge)
    await user.click(screen.getByRole('button', { name: 'Challenge my interpretation' }))
    await user.click(await screen.findByRole('button', { name: 'Accept suggestion' }))
    expect((screen.getByLabelText('Your Interpretation') as HTMLTextAreaElement).value).toBe(challenge.action === 'challenge' && challenge.revisedInterpretation)
    expect(screen.queryByRole('button', { name: 'Suggest a PLC activity' })).toBeNull()
    await user.click(screen.getByRole('button', { name: /Confirm interpretation and continue/ }))
    modelResponse(refinement)
    await user.click(screen.getByRole('button', { name: 'Suggest a stronger PLC question' }))
    const refinementPayload = JSON.parse(fetchMock.mock.calls[1][1].body)
    expect(refinementPayload.confirmedInterpretation).toBe(challenge.action === 'challenge' && challenge.revisedInterpretation)
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
  it.each([429, 502, 503, 504])('preserves educator text on server error %s', async (status) => {
    fetchMock.mockResolvedValue({ ok: false, status, json: async () => ({ error: 'Please retry the request.' }) })
    render(<Workspace onLock={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Challenge my interpretation' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect((screen.getByLabelText('Your Interpretation') as HTMLTextAreaElement).value).toBe(initialState.educatorInterpretation)
    expect(screen.queryByRole('button', { name: 'Accept suggestion' })).toBeNull()
  })
  it('handles network failure honestly without scripted suggestion', async () => {
    fetchMock.mockRejectedValue(new TypeError('Unable to connect. Please retry.'))
    render(<Workspace onLock={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Challenge my interpretation' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Unable to connect')
    expect(screen.queryByRole('button', { name: 'Accept suggestion' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Continue with my interpretation →' }))
    expect((screen.getByLabelText('Your PLC Question') as HTMLTextAreaElement).value).toBe(initialState.inquiryDraft)
  })
  it('does not render fabricated model sources as valid citations', async () => {
    modelResponse({ ...challenge, sourceIds: ['invented-source'] })
    render(<Workspace onLock={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Challenge my interpretation' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByRole('link', { name: /invented-source/ })).toBeNull()
  })
  it('cancellation keeps inputs and ignores late responses', async () => {
    let finish: ((value: unknown) => void) | undefined
    fetchMock.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    render(<Workspace onLock={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Challenge my interpretation' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel request' }))
    expect(screen.getByRole('alert').textContent).toContain('cancelled')
    expect(screen.queryByRole('button', { name: 'Use Demo Example' })).toBeNull()
    finish?.({ ok: true, json: async () => ({ id: crypto.randomUUID(), requestId: JSON.parse(fetchMock.mock.calls[0][1].body).requestId, suggestion: challenge }) })
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Accept suggestion' })).toBeNull())
  })
  it('keeps drafts and reports the 75-second browser deadline', async () => {
    vi.useFakeTimers()
    let signal: AbortSignal | undefined
    fetchMock.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      signal = options.signal
      signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    }))
    render(<Workspace onLock={() => {}} />)
    const interpretation = screen.getByLabelText('Your Interpretation') as HTMLTextAreaElement
    fireEvent.change(interpretation, { target: { value: 'Keep my educator-authored interpretation.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Challenge my interpretation' }))
    expect(signal?.aborted).toBe(false)
    await act(async () => { await vi.advanceTimersByTimeAsync(74_999) })
    expect(signal?.aborted).toBe(false)
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(signal?.aborted).toBe(true)
    expect(screen.getByRole('alert').textContent).toContain('request timed out')
    expect(screen.getByRole('button', { name: 'Use Demo Example' })).toBeTruthy()
    expect(interpretation.value).toBe('Keep my educator-authored interpretation.')
  })

  describe('Manual demo example review', () => {
    it.each([429, 502, 503, 504])('offers explicit retry and demo choices after provider failure %i', async (status) => {
      providerFailure(status)
      render(<Workspace onLock={() => {}} />)
      fireEvent.click(screen.getByRole('button', { name: 'Challenge my interpretation' }))
      expect(await screen.findByRole('button', { name: 'Use Demo Example' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Retry Gemini' })).toBeTruthy()
      expect(screen.getByRole('alert').textContent).toContain('Gemini unavailable')
      expect(screen.queryByRole('button', { name: 'Accept suggestion' })).toBeNull()
    })
    it.each([400, 401, 403, 413, 415, 500, 503])('does not bypass application failures or unclassified errors %i', async (status) => {
      fetchMock.mockResolvedValueOnce({ ok: false, status, json: async () => ({ error: 'Application access failed.', category: 'application_failure' }) })
      render(<Workspace onLock={() => {}} />)
      fireEvent.click(screen.getByRole('button', { name: 'Challenge my interpretation' }))
      expect(await screen.findByRole('alert')).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'Use Demo Example' })).toBeNull()
      expect(screen.getByRole('button', { name: 'Continue with my interpretation →' })).toBeTruthy()
    })
    it('does not infer provider eligibility from status or error-message wording', async () => {
      fetchMock.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ error: 'Gemini provider unavailable' }) })
      render(<Workspace onLock={() => {}} />)
      fireEvent.click(screen.getByRole('button', { name: 'Challenge my interpretation' }))
      expect(await screen.findByRole('alert')).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'Use Demo Example' })).toBeNull()
    })
    it.each(['network', 'json', 'validation'] as const)('offers examples after %s failures, never automatically', async (failure) => {
      if (failure === 'network') fetchMock.mockRejectedValueOnce(new TypeError('Network unavailable'))
      else if (failure === 'json') fetchMock.mockResolvedValueOnce({ ok: true, json: async () => { throw new SyntaxError('Invalid JSON') } })
      else modelResponse({ ...challenge, sourceIds: ['work-A', 'work-A'] })
      render(<Workspace onLock={() => {}} />)
      fireEvent.click(screen.getByRole('button', { name: 'Challenge my interpretation' }))
      expect(await screen.findByRole('button', { name: 'Use Demo Example' })).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'Accept suggestion' })).toBeNull()
    })
    it('retries Gemini using the existing request flow and clears old eligibility', async () => {
      providerFailure()
      render(<Workspace onLock={() => {}} />)
      fireEvent.click(screen.getByRole('button', { name: 'Challenge my interpretation' }))
      await screen.findByRole('button', { name: 'Retry Gemini' })
      modelResponse(challenge)
      fireEvent.click(screen.getByRole('button', { name: 'Retry Gemini' }))
      expect(await screen.findByRole('button', { name: 'Accept suggestion' })).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'Use Demo Example' })).toBeNull()
      expect(screen.getByRole('status').textContent).toBe('Gemini suggestion ready for review.')
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })
    it('reviews all three correct examples without calling Gemini, preserving drafts and separating confirmation', async () => {
      const user = userEvent.setup()
      render(<Workspace onLock={() => {}} />)
      const actions = [
        { action: 'challenge', button: 'Challenge my interpretation', field: 'Your Interpretation', confirm: 'Confirm interpretation and continue →' },
        { action: 'refine_inquiry', button: 'Suggest a stronger PLC question', field: 'Your PLC Question', confirm: 'Confirm inquiry →' },
        { action: 'suggest_activity', button: 'Suggest a PLC activity', field: 'Activity preview', confirm: 'Confirm activity' },
      ] as const
      for (const [index, item] of actions.entries()) {
        if (item.action === 'suggest_activity') fireEvent.change(screen.getByLabelText(item.field), { target: { value: 'Educator rehearsal to preserve' } })
        const before = (screen.getByLabelText(item.field) as HTMLTextAreaElement).value
        providerFailure()
        await user.click(screen.getByRole('button', { name: item.button }))
        const fallback = await screen.findByRole('button', { name: 'Use Demo Example' })
        fallback.focus()
        await user.keyboard('{Enter}')
        expect(fetchMock).toHaveBeenCalledTimes(index + 1)
        expect(screen.getByRole('status').textContent).toBe('Demo example ready for review.')
        expect(screen.getByText('This prewritten example illustrates the review workflow. It was not generated from your current draft.')).toBeTruthy()
        expect(document.activeElement?.getAttribute('aria-labelledby')).toBe('suggestion-title')
        expect((screen.getByLabelText(item.field) as HTMLTextAreaElement).value).toBe(before)
        const fixture = demoExample(item.action)
        if (fixture.action === 'challenge') expect(screen.getByText(fixture.probingQuestion)).toBeTruthy()
        if (fixture.action === 'refine_inquiry') expect(screen.getAllByText(fixture.suggestedInquiry).length).toBeGreaterThan(0)
        if (fixture.action === 'suggest_activity') expect(screen.getByText(fixture.activity.objective)).toBeTruthy()
        expect(screen.getByRole('alert').textContent).toContain('Gemini unavailable')
        await user.click(screen.getByRole('button', { name: 'Accept suggestion' }))
        expect((screen.getByLabelText(item.field) as HTMLTextAreaElement).value).not.toBe(before)
        const editor = screen.getByRole('region', { name: 'Educator workspace' })
        expect(editor.textContent).toContain('Demo Example · Not Generated by Gemini')
        const trail = screen.getByRole('region', { name: 'Decision trail' })
        expect(trail.textContent).toContain('Demo Example · Not Generated by Gemini')
        expect(trail.textContent).toContain('accepted')
        if (item.action === 'suggest_activity') {
          expect((screen.getByRole('button', { name: item.confirm }) as HTMLButtonElement).disabled).toBe(true)
          expect(screen.getByText('Needs review')).toBeTruthy()
          await user.click(screen.getByRole('button', { name: 'Review accepted activity' }))
        }
        await user.click(screen.getByRole('button', { name: item.confirm }))
      }
      expect(fetchMock).toHaveBeenCalledTimes(3)
    })
    it('Reject preserves educator work and demo provenance, and double-click cannot duplicate history', async () => {
      providerFailure()
      render(<Workspace onLock={() => {}} />)
      fireEvent.click(screen.getByRole('button', { name: 'Challenge my interpretation' }))
      const fallback = await screen.findByRole('button', { name: 'Use Demo Example' })
      act(() => { fallback.click(); fallback.click() })
      expect(screen.getByRole('heading', { name: 'Your decision trail 1' })).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: 'Reject suggestion' }))
      expect((screen.getByLabelText('Your Interpretation') as HTMLTextAreaElement).value).toBe(initialState.educatorInterpretation)
      expect(screen.getByText('rejected')).toBeTruthy()
      expect(screen.getAllByText('Demo Example · Not Generated by Gemini').length).toBeGreaterThan(0)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
    it('ignores a late Gemini result after a timeout and demo selection, even if transport ignores abort', async () => {
      vi.useFakeTimers()
      let finish: ((response: unknown) => void) | undefined
      fetchMock.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
      render(<Workspace onLock={() => {}} />)
      fireEvent.click(screen.getByRole('button', { name: 'Challenge my interpretation' }))
      await act(async () => { await vi.advanceTimersByTimeAsync(75_000) })
      fireEvent.click(screen.getByRole('button', { name: 'Use Demo Example' }))
      const requestId = JSON.parse(fetchMock.mock.calls[0][1].body).requestId
      await act(async () => {
        finish?.({ ok: true, json: async () => ({ id: crypto.randomUUID(), requestId, suggestion: challenge }) })
      })
      expect(screen.getByRole('status').textContent).toBe('Demo example ready for review.')
      expect(screen.getByRole('heading', { name: 'Your decision trail 1' })).toBeTruthy()
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
    it.each(['reset', 'lock'] as const)('clears accepted demo records, drafts and pending state on %s', async (change) => {
      providerFailure()
      const onLock = vi.fn()
      render(<Workspace onLock={onLock} />)
      fireEvent.click(screen.getByRole('button', { name: 'Challenge my interpretation' }))
      fireEvent.click(await screen.findByRole('button', { name: 'Use Demo Example' }))
      fireEvent.click(screen.getByRole('button', { name: 'Accept suggestion' }))
      expect(screen.getAllByText('Demo Example · Not Generated by Gemini').length).toBeGreaterThan(0)
      if (change === 'reset') {
        vi.spyOn(window, 'confirm').mockReturnValueOnce(true)
        fireEvent.click(screen.getByRole('button', { name: 'Reset demo' }))
      } else {
        fetchMock.mockResolvedValueOnce({ ok: true })
        fireEvent.click(screen.getByRole('button', { name: 'Lock demo' }))
        await waitFor(() => expect(onLock).toHaveBeenCalledOnce())
      }
      expect(screen.queryByText('Demo Example · Not Generated by Gemini')).toBeNull()
      expect(screen.queryByRole('button', { name: 'Accept suggestion' })).toBeNull()
      expect(screen.getByRole('heading', { name: 'Your decision trail 0' })).toBeTruthy()
      expect((screen.getByLabelText('Your Interpretation') as HTMLTextAreaElement).value).toBe(initialState.educatorInterpretation)
    })
    it.each(['edit', 'step', 'reset', 'lock'] as const)('clears fallback eligibility on %s', async (change) => {
      providerFailure()
      const onLock = vi.fn()
      render(<Workspace onLock={onLock} />)
      fireEvent.click(screen.getByRole('button', { name: 'Challenge my interpretation' }))
      await screen.findByRole('button', { name: 'Use Demo Example' })
      if (change === 'edit') fireEvent.change(screen.getByLabelText('Your Interpretation'), { target: { value: 'Changed input' } })
      if (change === 'step') fireEvent.click(screen.getByRole('button', { name: 'Continue with my interpretation →' }))
      if (change === 'reset') {
        vi.spyOn(window, 'confirm').mockReturnValueOnce(true)
        fireEvent.click(screen.getByRole('button', { name: 'Reset demo' }))
      }
      if (change === 'lock') {
        fetchMock.mockResolvedValueOnce({ ok: true })
        fireEvent.click(screen.getByRole('button', { name: 'Lock demo' }))
        await waitFor(() => expect(onLock).toHaveBeenCalledOnce())
      }
      expect(screen.queryByRole('button', { name: 'Use Demo Example' })).toBeNull()
    })
  })
})
