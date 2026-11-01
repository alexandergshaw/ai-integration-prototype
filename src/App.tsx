import { useEffect, useReducer, useRef, useState } from 'react'
import { evidence, learningGoal, sourceIds } from '../shared/evidence'
import { coachResponseSchema, type CoachAction, type Suggestion } from '../shared/schemas'
import { formatActivity, initialState, reducer, requestFor } from './features/ai-decision/state'
import './App.css'

const actionNames: Record<CoachAction, string> = {
  challenge: 'AI Challenge', refine_inquiry: 'Question refinement', suggest_activity: 'Suggested Rehearsal',
}

function Sources({ ids }: { ids: string[] }) {
  return <div className="source-links" aria-label="Suggestion sources">{ids.map((id) =>
    <a key={id} href={`#source-${id}`} onClick={() => {
      const disclosure = document.getElementById('evidence-disclosure') as HTMLDetailsElement | null
      if (disclosure) disclosure.open = true
      window.setTimeout(() => document.getElementById(`source-${id}`)?.focus(), 0)
    }}>{id} ↗</a>)}</div>
}

function EvidenceRail() {
  return <details id="evidence-disclosure" className="evidence-rail" open>
    <summary>Evidence & lesson context <span>Read only</span></summary>
    <div className="rail-content">
      <div className="eyebrow">GRADE 5 · DECIMAL MULTIPLICATION</div>
      <h2>Why hundredths?</h2>
      <div className="lesson-context">
        <p className="lesson-goal" aria-label={learningGoal}>Explain why multiplying tenths gives hundredths:<br />0.3 × 0.4 = 0.12.</p>
        <div>
          <div className="math-model" aria-label="10 by 10 area model: three columns of tenths overlap four rows of tenths in twelve hundredths">
            {Array.from({ length: 100 }, (_, i) =>
              <span key={i} className={i % 10 < 3 && i < 40 ? 'overlap' : i % 10 < 3 ? 'tenths-a' : i < 40 ? 'tenths-b' : ''} />)}
          </div>
          <p className="model-caption">12 overlapping hundredths</p>
        </div>
      </div>
      <section id={`source-${evidence[0].id}`} tabIndex={-1} className="assessment-source">
        <h3>{evidence[0].title}</h3>
        <p className="source-meta">October 28, 2026<br />{evidence[0].scope} · Demo-visible</p>
        <div className="metrics">
          <div><strong>71<span>%</span></strong><b>68/96</b><span>Correct products</span></div>
          <div><strong>30<span>%</span></strong><b>29/96</b><span>Adequate explanations</span></div>
        </div>
        <p className="rubric-note">Separate hypothetical rubric metrics. Group overlap is unknown.</p>
        <code>{evidence[0].id}</code>
      </section>
      <h3 className="work-heading">Three illustrative responses</h3>
      {evidence.slice(1).map((source) => <section key={source.id} id={`source-${source.id}`} className="student-work" tabIndex={-1}>
        <h4>{source.title}</h4>
        <blockquote>“{source.text}”</blockquote>
        <p className="source-meta"><code>{source.id}</code> · {source.date} · 1 illustrative response · Demo-visible</p>
      </section>)}
      <p className="rail-footnote">Illustrative work—not prevalence or causal evidence. Procedural wording alone does not establish conceptual understanding.</p>
    </div>
  </details>
}

function SuggestionContent({ suggestion }: { suggestion: Suggestion }) {
  if (suggestion.action === 'challenge') return <>
    <h3>Another hypothesis to investigate</h3>
    <p>{suggestion.alternativeHypothesis}</p>
    <div className="proposed"><span className="eyebrow">PROBING QUESTION</span><p>{suggestion.probingQuestion}</p></div>
    <h3>Proposed inquiry draft</h3><p>{suggestion.suggestedInquiry}</p>
  </>
  if (suggestion.action === 'refine_inquiry') return <div className="proposed">
    <span className="eyebrow">PROPOSED PLC QUESTION</span><p>{suggestion.suggestedInquiry}</p>
  </div>
  return <>
    <h3>{suggestion.activity.name} <span className="duration">15 min</span></h3>
    <p>{suggestion.activity.objective}</p>
    <ol className="activity-steps">{suggestion.activity.steps.map((step, index) =>
      <li key={index}><b>{step.minutes} min</b><span>{step.instruction}</span></li>)}</ol>
    <details className="activity-detail"><summary>Representation & facilitation</summary>
      <p>{suggestion.activity.representation}</p>
      <h4>Facilitator question</h4><p>{suggestion.activity.facilitatorQuestion}</p>
      <h4>Anticipated misconception</h4><p>{suggestion.activity.anticipatedMisconception}</p>
      <h4>Possible teacher response</h4><p>{suggestion.activity.teacherResponse}</p>
      <h4>Implementation check</h4><p>{suggestion.activity.implementationCheck}</p>
    </details>
  </>
}

function Gate({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  return <main className="gate">
    <div className="brand-mark" aria-hidden="true">↻</div>
    <p className="eyebrow">INQUIRYLOOP</p>
    <h1>AI challenges the reasoning.<br />Educators own the decision.</h1>
    <p>Enter your demo access code to open the AI Coaching Workspace.</p>
    <form onSubmit={async (event) => {
      event.preventDefault()
      setBusy(true); setError('')
      try {
        const response = await fetch('/api/session', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }), signal: AbortSignal.timeout(10000),
        })
        if (!response.ok) {
          const body = await response.json()
          throw new Error(body.error || 'Unable to unlock the workspace. Please try again.')
        }
        setCode(''); onAuthenticated()
      } catch (cause) {
        setError(cause instanceof Error && cause.name !== 'TimeoutError' ? cause.message : 'Connection timed out. Please try again.')
      } finally { setBusy(false) }
    }}>
      <label htmlFor="demo-code">Demo access code</label>
      <input id="demo-code" type="password" autoComplete="current-password" maxLength={200} value={code}
        onChange={(event) => setCode(event.target.value)} required />
      <button className="primary" disabled={busy || !code.trim()}>{busy ? 'Opening workspace…' : 'Open workspace →'}</button>
      {error && <p role="alert" className="error">{error}</p>}
    </form>
    <small>Personal interview prototype · Fictional assessment data<br />Not a Leading Educators product or endorsement.</small>
  </main>
}

export function Workspace({ onLock }: { onLock: () => void }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const controller = useRef<AbortController | null>(null)
  const feedback = useRef<HTMLDivElement>(null)
  useEffect(() => () => controller.current?.abort(), [])
  useEffect(() => {
    if (state.pending) feedback.current?.focus()
  }, [state.pending])
  useEffect(() => {
    const disclosure = document.getElementById('evidence-disclosure') as HTMLDetailsElement | null
    if (disclosure) disclosure.open = window.matchMedia('(min-width: 1100px)').matches
  }, [])

  const busy = !!state.request
  const inquiryChanged = !!state.confirmedInquiry && state.inquiryDraft.trim() !== state.confirmedInquiry
  const currentAction: CoachAction = state.step === 1 ? 'challenge' : state.step === 2 ? 'refine_inquiry' : 'suggest_activity'
  const stop = () => { controller.current?.abort(); dispatch({ type: 'cancel' }) }
  const edit = (field: 'educatorInterpretation' | 'inquiryDraft' | 'activityDraft', value: string) => {
    controller.current?.abort(); dispatch({ type: 'edit', field, value })
  }
  const navigate = (step: 1 | 2 | 3) => {
    controller.current?.abort(); dispatch({ type: 'step', step })
  }
  const requestSuggestion = async () => {
    controller.current?.abort()
    const abort = new AbortController()
    controller.current = abort
    const id = crypto.randomUUID()
    dispatch({ type: 'start', id, action: currentAction })
    const timer = window.setTimeout(() => abort.abort('timeout'), 28000)
    try {
      const response = await fetch('/api/coach', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestFor(state, currentAction, id)), signal: abort.signal,
      })
      const body: unknown = await response.json()
      if (!response.ok) {
        const message = typeof body === 'object' && body && 'error' in body && typeof body.error === 'string'
          ? body.error : 'The suggestion could not be generated. Please try again.'
        throw new Error(response.status === 401 ? `${message} Use Lock demo to sign in again; copy any work you want to keep first.` : message)
      }
      const parsed = coachResponseSchema.parse(body)
      if (parsed.requestId !== id || parsed.suggestion.action !== currentAction ||
        parsed.suggestion.sourceIds.some((source) => !sourceIds.includes(source as typeof sourceIds[number]))) {
        throw new Error('The response could not be verified. Your work is unchanged; please try again.')
      }
      dispatch({ type: 'received', requestId: id, id: parsed.id, suggestion: parsed.suggestion, at: new Date().toISOString() })
    } catch (cause) {
      if (abort.signal.aborted && abort.signal.reason !== 'timeout') return
      dispatch({
        type: 'error', requestId: id,
        message: abort.signal.reason === 'timeout' ? 'The request timed out. Your work is unchanged; please try again.'
          : cause instanceof Error && cause.name !== 'ZodError' ? cause.message : 'The response could not be verified. Please try again.',
      })
    } finally { window.clearTimeout(timer) }
  }

  return <>
    <header className="topbar">
      <a className="brand" href="#workspace"><span className="brand-mark" aria-hidden="true">i</span>Inquiry</a>
      <span className="tagline">AI challenges the reasoning; educators own the decision.</span>
      <div className="header-actions"><span className="fictional-label">Fictional assessment data</span>
        <button className="text-button" onClick={() => {
          if (window.confirm('Clear your drafts and decisions for a fresh demonstration?')) {
            controller.current?.abort(); dispatch({ type: 'reset' })
          }
        }}>Reset demo</button>
        <button className="text-button" onClick={async () => {
          controller.current?.abort()
          try {
            const response = await fetch('/api/session', {
              method: 'DELETE', headers: { 'Content-Type': 'application/json' },
              body: '{}', signal: AbortSignal.timeout(10000),
            })
            if (!response.ok) throw new Error('Could not lock the demo. Please try again.')
            onLock()
          } catch {
            dispatch({ type: 'start', id: 'logout', action: currentAction })
            dispatch({ type: 'error', requestId: 'logout', message: 'Could not lock the demo. Please try again.' })
          }
        }}>Lock demo</button>
      </div>
    </header>
    <main id="workspace" className="workspace">
      <div className="workspace-heading"><p className="eyebrow">A THINKING PARTNER, NOT A DECISION MAKER</p>
        <h1>AI Coaching Workspace</h1><p>Move from an interpretation to an inquiry you can stand behind.</p></div>
      <div className="workspace-grid">
        <EvidenceRail />
        <section className="educator-panel" aria-label="Educator workspace">
          <nav className="stepper" aria-label="Coaching steps">{(['Challenge', 'Refine', 'Rehearse'] as const).map((name, index) =>
            <button key={name} aria-current={state.step === index + 1 ? 'step' : undefined}
              disabled={index === 1 && !state.challengeDecided || index === 2 && (!state.confirmedInquiry || inquiryChanged)}
              onClick={() => navigate((index + 1) as 1 | 2 | 3)}><span>{index + 1}</span>{name}</button>)}</nav>
          <div className="editor-content">
            <span className="status-label">Educator draft</span>
            <h2>{state.step === 1 ? 'Start with your thinking.' : state.step === 2 ? 'Make the question yours.' : 'Bring reasoning into practice.'}</h2>
            <p className="section-intro">{state.step === 1 ? 'What might the student work be telling us? Hold your interpretation as a hypothesis, not a finding.'
              : state.step === 2 ? 'Refine or keep your question. Only your separate confirmation makes it authoritative.'
                : 'Rehearse one mathematical idea in 15 minutes. The PLC still decides its classroom strategy.'}</p>
            <label htmlFor="interpretation">Your Interpretation</label>
            <textarea id="interpretation" maxLength={2000} rows={5} value={state.educatorInterpretation}
              onChange={(event) => edit('educatorInterpretation', event.target.value)} />
            <p className="field-note">Your interpretation stays yours, even when you accept an AI question.</p>
            {state.step !== 1 && <>
              <div className="field-heading"><label htmlFor="inquiry">Your PLC Question</label>
                <span className="status-label">{state.confirmedInquiry && !inquiryChanged ? 'Educator confirmed' : 'Educator draft'}</span></div>
              <textarea id="inquiry" maxLength={2000} rows={4} value={state.inquiryDraft}
                onChange={(event) => edit('inquiryDraft', event.target.value)} />
              {inquiryChanged && <p className="notice">Unconfirmed edits. Confirm your changed inquiry before requesting a rehearsal.</p>}
            </>}
            <div className="request-area">
              <span className="eyebrow">AN INVITATION TO THINK DIFFERENTLY</span>
              <button className="primary" onClick={requestSuggestion} disabled={busy || !!state.pending ||
                (state.step === 1 ? !state.educatorInterpretation.trim() : state.step === 2 ? !state.inquiryDraft.trim() : !state.confirmedInquiry || inquiryChanged)}>
                <span aria-hidden="true">✧</span> {state.step === 1 ? state.challengeDecided ? 'Try another challenge' : 'Challenge my interpretation'
                  : state.step === 2 ? 'Suggest a stronger PLC question' : 'Suggest a PLC activity'}
              </button>
              <p className="field-note">AI runs only when you ask. Accepting copies a suggestion into a draft.</p>
              {busy && <button className="secondary" onClick={stop}>Cancel request</button>}
            </div>
            {state.step === 1 && <button className="secondary confirm-button" disabled={!state.educatorInterpretation.trim() || busy || !!state.pending}
              onClick={() => dispatch({ type: 'continueWithoutChallenge' })}>Continue with my interpretation →</button>}
            {state.step === 2 && <button className="secondary confirm-button" disabled={!state.inquiryDraft.trim() || busy || !!state.pending}
              onClick={() => dispatch({ type: 'confirmInquiry' })}>Confirm inquiry →</button>}
            {state.step === 2 && state.decisions.at(-1)?.suggestion.action === 'challenge' && state.decisions.at(-1)?.choice === 'rejected' &&
              <p className="notice">Continue with my interpretation: your original question is unchanged. Refinement is optional.</p>}
            {state.step === 3 && <>
              <div className="confirmed-inquiry"><span className="eyebrow">EDUCATOR CONFIRMED · REQUEST CONTEXT</span><p>{state.confirmedInquiry}</p></div>
              <div className="field-heading"><label htmlFor="activity">Activity preview</label><span className="status-label">
                {state.activityNeedsReview ? 'Needs review' : state.confirmedActivity ? 'Educator confirmed' : 'Educator draft / Needs confirmation'}</span></div>
              <textarea id="activity" maxLength={12000} rows={8} value={state.activityDraft}
                placeholder="Write your own activity, or inspect an AI rehearsal suggestion."
                onChange={(event) => edit('activityDraft', event.target.value)} />
              {state.activityNeedsReview && <div className="notice">Your confirmed inquiry changed. Review this activity for alignment before confirming it.
                <button className="secondary" disabled={inquiryChanged || busy} onClick={() => dispatch({ type: 'reviewActivity' })}>Review accepted activity</button></div>}
              <button className="secondary confirm-button" disabled={!state.activityDraft.trim() || state.activityNeedsReview || inquiryChanged || busy || !!state.pending}
                onClick={() => dispatch({ type: 'confirmActivity' })}>Confirm activity</button>
              <p className="field-note">Confirmation means you choose to bring this rehearsal to discussion—not that the team has selected a classroom change.</p>
            </>}
          </div>
        </section>
        <aside className="ai-column" aria-label="AI suggestions and your decisions">
          <section className={`suggestion-panel ${state.pending ? 'has-suggestion' : ''}`} ref={feedback} tabIndex={-1} aria-labelledby="suggestion-title" aria-busy={busy}>
            <div className="ai-panel-heading"><span className="ai-icon" aria-hidden="true">✧</span><div><span className="eyebrow">AI SUGGESTION</span>
              <h2 id="suggestion-title">{actionNames[currentAction]}</h2></div></div>
            {busy ? <div className="empty-state" role="status"><span className="thinking-icon" aria-hidden="true">✧</span>
              <h3>Considering the evidence…</h3><p>Your work stays in place while the suggestion is prepared.</p></div>
              : state.pending ? <>
                <SuggestionContent suggestion={state.pending.suggestion} />
                <h3 className="small-heading">Why investigate this?</h3><p>{state.pending.suggestion.rationale}</p>
                <Sources ids={state.pending.suggestion.sourceIds} />
                <div className="uncertainty"><h3>Uncertainty & limits</h3><p>{state.pending.suggestion.limitations}</p></div>
                <div className="decision-buttons">
                  <button className="primary" onClick={() => dispatch({ type: 'decide', choice: 'accepted', at: new Date().toISOString() })}>Accept suggestion</button>
                  <button className="secondary" onClick={() => dispatch({ type: 'decide', choice: 'rejected', at: new Date().toISOString() })}>Reject suggestion</button>
                </div><p className="field-note">Accept → editable draft. Reject → your work stays unchanged.</p>
              </> : <div className="empty-state"><span className="thinking-icon" aria-hidden="true">✧</span>
                <h3>{state.decisions.length ? 'Your decision leads.' : 'A second perspective, when you want one.'}</h3>
                <p>{state.decisions.length ? 'Continue with your wording, or request a fresh suggestion. Nothing is confirmed automatically.'
                  : 'Request a suggestion for this step. Inspect its evidence and limits, then decide what to keep.'}</p></div>}
            {state.error && <p className="error" role="alert">{state.error}</p>}
          </section>
          <section className="decision-trail" aria-label="Decision trail" aria-live="polite">
            <h2>Your decision trail <span>{state.decisions.length}</span></h2>
            {!state.decisions.length ? <p>Suggestions inform.<br />You decide what moves forward.</p> :
              [...state.decisions].reverse().map((decision) => <details key={decision.id} className="decision-record">
                <summary><span>{actionNames[decision.suggestion.action]}</span><b>{decision.choice}</b></summary>
                <time dateTime={decision.at}>{new Date(decision.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
                <p>{decision.appliedToDraft ? 'Copied to an editable draft. Separate confirmation required.'
                  : 'Not copied. Educator work preserved; not used as later request context.'}</p>
                <p className="history-content">{decision.suggestion.action === 'suggest_activity'
                  ? formatActivity(decision.suggestion.activity) : decision.suggestion.suggestedInquiry}</p>
                {decision.suggestion.action === 'challenge' && <p>{decision.suggestion.alternativeHypothesis}<br />{decision.suggestion.probingQuestion}</p>}
                <p>{decision.suggestion.rationale}</p><p>Limits: {decision.suggestion.limitations}</p>
                <Sources ids={decision.suggestion.sourceIds} />
              </details>)}
          </section>
        </aside>
      </div>
      <footer>Fictional, de-identified evidence · Session-only drafts · Personal interview prototype, not a Leading Educators product or endorsement.</footer>
    </main>
  </>
}

export default function App() {
  const [session, setSession] = useState<'checking' | 'locked' | 'open'>('checking')
  useEffect(() => {
    const abort = new AbortController()
    fetch('/api/session', { signal: abort.signal }).then(async (response) => {
      const body = await response.json()
      if (!abort.signal.aborted) setSession(response.ok && body.authenticated === true ? 'open' : 'locked')
    }).catch(() => { if (!abort.signal.aborted) setSession('locked') })
    return () => abort.abort()
  }, [])
  if (session === 'checking') return <main className="gate" role="status">Opening Inquiry…</main>
  return session === 'locked' ? <Gate onAuthenticated={() => setSession('open')} /> : <Workspace onLock={() => setSession('locked')} />
}
