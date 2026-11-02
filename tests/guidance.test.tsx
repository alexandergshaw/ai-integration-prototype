import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Workspace } from '../src/App'
import { initialState } from '../src/features/ai-decision/state'
import { challenge } from './fixtures'
import type { Suggestion } from '../shared/schemas'

const fetchMock = vi.fn()
let reduceMotion = false

function modelResponse(suggestion: Suggestion) {
  fetchMock.mockImplementationOnce(async (_url, options) => ({
    ok: true, status: 200,
    json: async () => ({ id: crypto.randomUUID(), requestId: JSON.parse(options.body).requestId, model: 'gemini-2.5-flash', suggestion }),
  }))
}

beforeEach(() => {
  reduceMotion = false
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('prefers-reduced-motion') ? reduceMotion : true,
    media: query, addEventListener() {}, removeEventListener() {},
  }))
  fetchMock.mockReset()
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks() })

const panel = () => document.querySelector('.suggestion-panel') as HTMLElement

describe('Reveal-and-highlight guidance', () => {
  it('reveals and gently highlights the panel exactly once when AI feedback arrives', async () => {
    const user = userEvent.setup()
    render(<Workspace onLock={() => {}} />)
    modelResponse(challenge)
    await user.click(screen.getByRole('button', { name: 'Challenge my interpretation' }))
    await screen.findByRole('button', { name: 'Accept suggestion' })
    await waitFor(() => expect(panel().classList.contains('newly-revealed')).toBe(true))
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('New feedback is ready to review. Your draft is unchanged until you accept it.')).toBeTruthy()
  })

  it('does not re-reveal the panel on an unrelated re-render', async () => {
    const user = userEvent.setup()
    render(<Workspace onLock={() => {}} />)
    modelResponse(challenge)
    await user.click(screen.getByRole('button', { name: 'Challenge my interpretation' }))
    await screen.findByRole('button', { name: 'Accept suggestion' })
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1))
    // Rejecting re-renders the workspace but must not scroll again.
    await user.click(screen.getByRole('button', { name: 'Reject suggestion' }))
    await screen.findByText('No suggestion to review')
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1)
  })

  it('reveals and focuses the editable draft when a suggestion is accepted, without confirming it', async () => {
    const user = userEvent.setup()
    render(<Workspace onLock={() => {}} />)
    modelResponse(challenge)
    await user.click(screen.getByRole('button', { name: 'Challenge my interpretation' }))
    await user.click(await screen.findByRole('button', { name: 'Accept suggestion' }))
    const draft = screen.getByLabelText('Your Interpretation') as HTMLTextAreaElement
    expect(draft.value).toBe(challenge.action === 'challenge' && challenge.revisedInterpretation)
    await waitFor(() => expect(draft.classList.contains('newly-revealed')).toBe(true))
    expect(document.activeElement).toBe(draft)
    // Acceptance is not confirmation: Refine stays locked until a separate confirm.
    expect((screen.getByRole('button', { name: /Refine/ }) as HTMLButtonElement).disabled).toBe(true)
    const announcements = await screen.findAllByText('Suggestion added to your editable draft. Review it before confirming.')
    expect(announcements).toHaveLength(1)
  })

  it('announces rejection and preserves the original interpretation without scrolling', async () => {
    const user = userEvent.setup()
    render(<Workspace onLock={() => {}} />)
    modelResponse(challenge)
    await user.click(screen.getByRole('button', { name: 'Challenge my interpretation' }))
    await screen.findByRole('button', { name: 'Reject suggestion' })
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled())
    ;(Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>).mockClear()
    await user.click(screen.getByRole('button', { name: 'Reject suggestion' }))
    expect((screen.getByLabelText('Your Interpretation') as HTMLTextAreaElement).value).toBe(initialState.educatorInterpretation)
    expect(await screen.findByText('Suggestion rejected. Your interpretation is unchanged.')).toBeTruthy()
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled()
  })

  it('makes guided planning discoverable by revealing the support panel', async () => {
    const user = userEvent.setup()
    render(<Workspace onLock={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'Use guided planning' }))
    expect(screen.getByText('Continue shaping your interpretation.')).toBeTruthy()
    await waitFor(() => expect(panel().classList.contains('newly-revealed')).toBe(true))
  })

  it('does not trigger a stale reveal after a cancelled request resolves late', async () => {
    let finish: ((response: unknown) => void) | undefined
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    render(<Workspace onLock={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Challenge my interpretation' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel request' }))
    ;(Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>).mockClear()
    const requestId = JSON.parse(fetchMock.mock.calls[0][1].body).requestId
    await act(async () => {
      finish?.({ ok: true, json: async () => ({ id: crypto.randomUUID(), requestId, model: 'gemini-2.5-flash', suggestion: challenge }) })
    })
    expect(screen.queryByRole('button', { name: 'Accept suggestion' })).toBeNull()
    expect(panel().classList.contains('newly-revealed')).toBe(false)
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled()
  })
})

describe('Evidence source navigation', () => {
  it('expands the evidence disclosure and reveals the cited source', async () => {
    const user = userEvent.setup()
    render(<Workspace onLock={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'Use guided planning' }))
    const link = screen.getAllByRole('link', { name: /work-B/ })[0]
    await user.click(link)
    const disclosure = document.getElementById('evidence-disclosure') as HTMLDetailsElement
    expect(disclosure.open).toBe(true)
    const source = document.getElementById('source-work-B') as HTMLElement
    await waitFor(() => expect(source.classList.contains('newly-revealed')).toBe(true))
    expect(document.activeElement).toBe(source)
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
  })
})

describe('Reduced motion', () => {
  it('uses non-animated scrolling when reduced motion is preferred', async () => {
    reduceMotion = true
    const user = userEvent.setup()
    render(<Workspace onLock={() => {}} />)
    modelResponse(challenge)
    await user.click(screen.getByRole('button', { name: 'Challenge my interpretation' }))
    await screen.findByRole('button', { name: 'Accept suggestion' })
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled())
    const call = (Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.behavior).toBe('auto')
  })

  it('uses smooth scrolling when motion is allowed', async () => {
    reduceMotion = false
    const user = userEvent.setup()
    render(<Workspace onLock={() => {}} />)
    modelResponse(challenge)
    await user.click(screen.getByRole('button', { name: 'Challenge my interpretation' }))
    await screen.findByRole('button', { name: 'Accept suggestion' })
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled())
    const call = (Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.behavior).toBe('smooth')
  })
})

describe('Contextual tooltips', () => {
  it('shows a tooltip on keyboard focus and dismisses it with Escape', async () => {
    const user = userEvent.setup()
    render(<Workspace onLock={() => {}} />)
    const trigger = screen.getByRole('button', { name: 'About Your Interpretation' })
    trigger.focus()
    const tip = await screen.findByRole('tooltip')
    expect(tip.textContent).toContain('You can revise it at any time.')
    expect(trigger.getAttribute('aria-describedby')).toBe(tip.id)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('tooltip')).toBeNull()
    expect(trigger.getAttribute('aria-describedby')).toBeNull()
  })

  it('opens the tooltip on pointer activation and dismisses it on outside click', async () => {
    const user = userEvent.setup()
    render(<Workspace onLock={() => {}} />)
    const trigger = screen.getByRole('button', { name: 'About guided planning' })
    await user.click(trigger)
    expect((await screen.findByRole('tooltip')).textContent).toContain('without requesting a new AI suggestion')
    await user.click(document.body)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
})

describe('Progression guidance', () => {
  it('explains the next required action and keeps locked steps disabled', async () => {
    const user = userEvent.setup()
    render(<Workspace onLock={() => {}} />)
    expect(screen.getByText(/Next: continue with your interpretation to unlock Refine/)).toBeTruthy()
    expect((screen.getByRole('button', { name: /Refine/ }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: /Rehearse/ }) as HTMLButtonElement).disabled).toBe(true)
    await user.click(screen.getByRole('button', { name: /Continue with my interpretation/ }))
    expect((screen.getByRole('button', { name: /Refine/ }) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByText(/Next: confirm your inquiry to unlock Rehearse/)).toBeTruthy()
  })
})
