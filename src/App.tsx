import { useEffect, useId, useReducer, useRef, useState, type ReactNode } from 'react'
import { evidence, learningGoal, sourceIds } from '../shared/evidence'
import { demoScenario, matchesExampleScenario, validateSuggestion } from '../shared/demoExamples'
import { coachResponseSchema, type CoachAction, type Suggestion } from '../shared/schemas'
import { formatActivity, initialState, reducer, requestFor, type Origin } from './features/ai-decision/state'
import { classifyResponse, GUIDED_PLANNING_WAIT_MS } from './features/ai-decision/failure'
import { useRevealHighlight } from './features/ai-decision/useRevealHighlight'
import './App.css'

const actionNames: Record<CoachAction, string> = {
  challenge: 'Interpretation feedback', refine_inquiry: 'Question refinement', suggest_activity: 'Rehearsal suggestion',
}

function Spinner() {
  return <span className="spinner" aria-hidden="true" />
}

function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const wrap = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    const onPointer = (event: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onPointer) }
  }, [open])
  return <span className="info-tip" ref={wrap} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
    <button type="button" className="info-tip-trigger" aria-label={label} aria-expanded={open}
      aria-describedby={open ? id : undefined} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
      onClick={() => setOpen(true)}>i</button>
    {open && <span role="tooltip" id={id} className="info-tip-bubble">{children}</span>}
  </span>
}

function InterpretationSource({ state, onSelect }: {
  state: { interpretationSource: 'mine' | 'ai'; originalInterpretation: string; aiInterpretation: string }
  onSelect: (source: 'mine' | 'ai') => void
}) {
  if (!state.aiInterpretation) return null
  const usingAi = state.interpretationSource === 'ai'
  return <div className="interpretation-source" role="group" aria-label="Active interpretation">
    <p className="source-status"><span className="status-dot" aria-hidden="true" />
      <strong>{usingAi ? 'Using AI interpretation.' : 'Using your interpretation.'}</strong></p>
    <button className="secondary" onClick={() => onSelect(usingAi ? 'mine' : 'ai')}>
      {usingAi ? 'Use my original interpretation' : 'Use AI interpretation'}</button>
    <details className="activity-detail">
      <summary>{usingAi ? 'View my original' : 'View AI interpretation'}</summary>
      <p>{usingAi ? state.originalInterpretation : state.aiInterpretation}</p>
    </details>
  </div>
}

function Provenance({ origin, action, explain = false }: { origin: Origin; action: CoachAction; explain?: boolean }) {
  if (origin === 'gemini') return <span className="status-label">{explain ? 'AI suggestion' : 'Started from an AI suggestion'}</span>
  return <div className="demo-provenance">
    <span className="status-label">{explain ? 'Built-in example' : 'Started from a built-in example'}</span>
    <details className="activity-detail"><summary>About this support</summary>
      <p>This prewritten example was prepared for the fictional demo evidence. Review its fit with your current interpretation and inquiry.</p><p>{demoScenario[action]}</p>
      <p>Fictional Grade 5 decimal multiplication · October 28, 2026 · Four classrooms, 96 responses on separate hypothetical rubrics; group overlap unknown. Work A and C are individual illustrative responses. Demo-visible sources only.</p>
    </details>
  </div>
}

function PlanningGuide({ action, onExample, examplesAvailable, onNavigate }: {
  action: CoachAction; onExample: () => void; examplesAvailable: boolean; onNavigate: (id: string) => void
}) {
  return <div className="planning-guide">
    <span className="status-label">Built-in guide</span>
    {action === 'challenge' ? <>
      <h3>Continue shaping your interpretation.</h3>
      <ol><li>Which evidence supports your interpretation?</li><li>What evidence complicates it?</li>
        <li>What else could explain the responses, and what would help distinguish it?</li></ol>
      <p>Review Your Interpretation alongside the sources. Edit it, or keep it and confirm when ready.</p>
      {examplesAvailable && <details className="activity-detail"><summary>A possibility to investigate</summary>
        <p>Could a learner show reasoning orally or visually that is not evident in a written explanation? This is a question to investigate, not a finding about the learner.</p>
      </details>}
    </> : action === 'refine_inquiry' ? <>
      <h3>Build your inquiry from the evidence.</h3>
      <p>Check your question against your confirmed interpretation:</p>
      <ul><li>Names the mathematical reasoning to investigate.</li><li>Identifies evidence that could answer the question.</li>
        <li>Leaves room for more than one explanation.</li><li>Does not prescribe a solution before investigation.</li></ul>
      <details className="activity-detail"><summary>Sentence frame</summary>
        <p>What would [specific student evidence] reveal about how students understand [mathematical idea]?</p>
        <p>A frame to shape in your own words, not a completed suggestion.</p>
      </details>
    </> : <>
      <h3>Shape your 15-minute rehearsal.</h3>
      <p>Use your educator-confirmed inquiry as the anchor.</p>
      <ol className="activity-steps"><li><b>3 min</b><span>Examine or construct the representation.</span></li>
        <li><b>7 min</b><span>Rehearse teacher questions and student explanations.</span></li>
        <li><b>5 min</b><span>Compare interpretations and identify subsequent evidence.</span></li></ol>
      <p>In Activity preview, name the instructional objective, two mathematical discussion questions, what teachers will practice, and what student evidence to examine afterward.</p>
    </>}
    <Sources ids={[...sourceIds]} onNavigate={onNavigate} />
    <details className="activity-detail"><summary>About this support</summary>
      <p>These built-in prompts support your reasoning without generating an analysis of your draft.</p>
    </details>
    {examplesAvailable && <details className="activity-detail"><summary>Example for the fictional scenario</summary>
      <p>A prewritten Grade 5 decimal-multiplication example, not an analysis of your draft or proof of alignment.</p>
      <button className="secondary" onClick={onExample}>View example</button>
    </details>}
  </div>
}

function LiveModelCallout({ model }: { model?: string }) {
  if (!model) return null
  return <p className="live-model-callout">
    <span className="live-dot" aria-hidden="true" />
    Live model call · generated in real time by <strong>{model}</strong>
  </p>
}

function Sources({ ids, onNavigate }: { ids: string[]; onNavigate?: (id: string) => void }) {
  return <div className="source-links" aria-label="Suggestion sources">{ids.map((id) =>
    <a key={id} href={`#source-${id}`} onClick={(event) => {
      if (onNavigate) {
        event.preventDefault()
        onNavigate(id)
        return
      }
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
        <h3>{evidence[0].title} <InfoTip label="About these rubric measures">
          Correct products and adequate explanations are scored on separate hypothetical rubrics. The overlap between the two groups is unknown, so one measure does not explain the other.
        </InfoTip></h3>
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
    <h3>Documented evidence to consider</h3>
    <p>{suggestion.evidenceConsideration}</p>
    <h3>An opposing reading to consider—not established</h3>
    <p>{suggestion.alternativeHypothesis}</p>
    <div className="proposed"><span className="eyebrow">PROBING QUESTION</span><p>{suggestion.probingQuestion}</p></div>
    <div className="proposed"><span className="eyebrow">REVISED INTERPRETATION DRAFT</span><p>{suggestion.revisedInterpretation}</p></div>
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
      <h4>Mathematical discussion prompts</h4>
      <ol>{suggestion.activity.discussionPrompts.map((prompt) => <li key={prompt}>{prompt}</li>)}</ol>
      <h4>Anticipated misconception</h4><p>{suggestion.activity.anticipatedMisconception}</p>
      <h4>What teachers should practice</h4><p>{suggestion.activity.teachersPractice}</p>
      <h4>Student evidence to examine afterward</h4><p>{suggestion.activity.studentEvidence}</p>
    </details>
  </>
}

function Gate({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [code, setCode] = useState('')
  const [codeVisible, setCodeVisible] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  return <main className="gate">
    <section className="gate-card" aria-labelledby="gate-title">
      <p className="eyebrow">Inquiry / Prototype</p>
      <h1 id="gate-title">AI Coaching Workspace</h1>
      <p>Review evidence, draft an inquiry, and plan a rehearsal. AI suggestions are optional.</p>
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
        <div className="password-field">
          <input id="demo-code" type={codeVisible ? 'text' : 'password'} autoComplete="current-password" maxLength={200} value={code}
            onChange={(event) => setCode(event.target.value)} required />
          <button className="password-visibility" type="button" aria-label={codeVisible ? 'Hide password' : 'Show password'}
            aria-pressed={codeVisible} onClick={() => setCodeVisible((visible) => !visible)}>
            {codeVisible ? 'Hide' : 'Show'}
          </button>
        </div>
        <button className="primary" disabled={busy || !code.trim()}>{busy ? 'Opening workspace…' : 'Open workspace →'}</button>
        {error && <p role="alert" className="error">{error}</p>}
      </form>
      <small>Fictional Grade 5 data · Session-only · Not a full PLC platform or a Leading Educators product or endorsement.</small>
    </section>
  </main>
}

export function Workspace({ onLock }: { onLock: () => void }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const active = useRef<{ id: string; controller: AbortController; timer: number } | null>(null)
  const feedback = useRef<HTMLHeadingElement>(null)
  const { targetRef, reveal, announce, announcement } = useRevealHighlight()
  const fieldName: Record<CoachAction, 'interpretation' | 'inquiry' | 'activity'> = {
    challenge: 'interpretation', refine_inquiry: 'inquiry', suggest_activity: 'activity',
  }
  const retire = (id?: string) => {
    const request = active.current
    if (!request || id && request.id !== id) return
    active.current = null
    window.clearTimeout(request.timer)
    request.controller.abort()
  }
  useEffect(() => () => retire(), [])
  useEffect(() => {
    const disclosure = document.getElementById('evidence-disclosure') as HTMLDetailsElement | null
    if (disclosure) disclosure.open = window.matchMedia('(min-width: 1100px)').matches
  }, [])

  const busy = !!state.request
  const inquiryChanged = !!state.confirmedInquiry && state.inquiryDraft.trim() !== state.confirmedInquiry
  const currentAction: CoachAction = state.step === 1 ? 'challenge' : state.step === 2 ? 'refine_inquiry' : 'suggest_activity'
  const navigateToSource = (id: string) => {
    const disclosure = document.getElementById('evidence-disclosure') as HTMLDetailsElement | null
    if (disclosure) disclosure.open = true
    if (typeof history !== 'undefined' && history.pushState) history.pushState(null, '', `#source-${id}`)
    reveal(`source-${id}`, { focus: true, block: 'center' })
  }
  const stop = () => { retire(); dispatch({ type: 'cancel' }) }
  const useGuide = () => {
    retire(); dispatch({ type: 'guide' })
    feedback.current?.focus({ preventScroll: true })
    reveal('suggestion-panel', { highlight: true, block: 'start' })
  }
  const edit = (field: 'educatorInterpretation' | 'inquiryDraft' | 'activityDraft', value: string) => {
    retire(); dispatch({ type: 'edit', field, value })
  }
  const navigate = (step: 1 | 2 | 3) => {
    retire(); dispatch({ type: 'step', step })
  }
  const selectInterpretation = (source: 'mine' | 'ai') => {
    retire(); dispatch({ type: 'selectInterpretation', source })
  }
  const decide = (choice: 'accepted' | 'rejected') => {
    const action = state.pending?.suggestion.action
    dispatch({ type: 'decide', choice, at: new Date().toISOString() })
    if (!action) return
    if (choice === 'accepted') {
      reveal(fieldName[action], { focus: true, block: 'center' })
      announce('Suggestion added to your editable draft. Review it before confirming.')
    } else {
      const owned = action === 'challenge' ? 'interpretation' : action === 'refine_inquiry' ? 'question' : 'activity'
      announce(`Suggestion rejected. Your ${owned} is unchanged.`)
    }
  }
  const confirmStep1 = () => {
    dispatch({ type: state.challengeDecided ? 'confirmInterpretation' : 'continueWithoutChallenge' })
    reveal('inquiry', { focus: true, block: 'center' })
    announce('Interpretation confirmed. Draft or refine your PLC question next.')
  }
  const confirmInquiry = () => {
    dispatch({ type: 'confirmInquiry' })
    reveal('activity', { focus: true, block: 'center' })
    announce('Inquiry confirmed. Plan your 15-minute rehearsal next.')
  }
  const confirmActivity = () => {
    dispatch({ type: 'confirmActivity' })
    reveal('activity', { highlight: true, block: 'center' })
    announce('Activity confirmed. You can refine any step or revisit your inquiry.')
  }
  const requestSuggestion = async () => {
    if (active.current) return
    const abort = new AbortController()
    const id = crypto.randomUUID()
    dispatch({ type: 'start', id, action: currentAction })
    const timer = window.setTimeout(() => {
      retire(id)
      dispatch({ type: 'guide', outcome: 'ui_deadline', requestId: id })
      reveal('suggestion-panel', { highlight: true, block: 'start' })
    }, GUIDED_PLANNING_WAIT_MS)
    active.current = { id, controller: abort, timer }
    try {
      const response = await fetch('/api/coach', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestFor(state, currentAction, id)), signal: abort.signal,
      })
      let body: unknown
      try { body = await response.json() } catch { body = null }
      if (active.current?.id !== id) return
      if (!response.ok) {
        const failure = classifyResponse(response.status, body)
        dispatch({ type: 'error', requestId: id, eligible: failure.kind === 'recoverable',
          message: failure.kind === 'application' ? failure.message : '' })
        if (failure.kind === 'recoverable') reveal('suggestion-panel', { highlight: true, block: 'start' })
        return
      }
      const parsed = coachResponseSchema.parse(body)
      if (parsed.requestId !== id) {
        throw new Error('The response could not be verified. Your work is unchanged; please try again.')
      }
      const suggestion = validateSuggestion(parsed.suggestion, currentAction)
      if (active.current?.id !== id) return
      dispatch({ type: 'received', requestId: id, id: parsed.id, suggestion, model: parsed.model, at: new Date().toISOString() })
      reveal('suggestion-panel', { highlight: true, block: 'start' })
      announce('New feedback is ready to review. Your draft is unchanged until you accept it.')
    } catch {
      if (active.current?.id !== id) return
      dispatch({ type: 'error', requestId: id, eligible: true, message: '' })
      reveal('suggestion-panel', { highlight: true, block: 'start' })
    } finally { retire(id) }
  }

  return <>
    <header className="topbar">
      <a className="brand" href="#workspace">Inquiry <span>Prototype</span></a>
      <div className="header-actions"><span className="fictional-label">Fictional Grade 5 data</span>
        <button className="text-button" onClick={() => {
          if (window.confirm('Clear your drafts and decisions for a fresh demonstration?')) {
            retire(); dispatch({ type: 'reset' })
          }
        }}>Reset demo</button>
        <button className="text-button" onClick={async () => {
          retire()
          dispatch({ type: 'cancel' })
          try {
            const response = await fetch('/api/session', {
              method: 'DELETE', headers: { 'Content-Type': 'application/json' },
              body: '{}', signal: AbortSignal.timeout(10000),
            })
            if (!response.ok) throw new Error('Could not lock the demo. Please try again.')
            dispatch({ type: 'reset' }); onLock()
          } catch {
            dispatch({ type: 'start', id: 'logout', action: currentAction })
            dispatch({ type: 'error', requestId: 'logout', message: 'Could not lock the demo. Please try again.' })
          }
        }}>Lock demo</button>
      </div>
    </header>
    <main id="workspace" className="workspace">
      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
      <div className="workspace-heading">
        <h1>AI Coaching Workspace</h1>
        <p>Examine evidence, shape an inquiry, and plan a rehearsal. You decide what to keep.</p>
        <details className="how-it-works">
          <summary>How this works</summary>
          <ol className="how-it-works-steps">
            <li>Examine the fictional evidence.</li>
            <li>Write your own interpretation.</li>
            <li>Optionally request an AI challenge or use guided planning.</li>
            <li>Accept, reject, or keep your work—your decision.</li>
            <li>Confirm an interpretation, then a PLC inquiry.</li>
            <li>Draft and confirm a short rehearsal.</li>
          </ol>
          <p>AI runs only when you ask and never confirms anything for you. You control every final decision.</p>
        </details></div>
      <div className="workspace-grid">
        <EvidenceRail />
        <section className="educator-panel" aria-label="Educator workspace">
          <nav className="stepper" aria-label="Coaching steps">{(['Challenge', 'Refine', 'Rehearse'] as const).map((name, index) =>
            <button key={name} aria-current={state.step === index + 1 ? 'step' : undefined}
              title={index === 1 && (!state.challengeDecided || !state.confirmedInterpretation ||
                state.educatorInterpretation.trim() !== state.confirmedInterpretation) ? 'Confirm your interpretation to unlock this step.'
                : index === 2 && (!state.confirmedInquiry || inquiryChanged) ? 'Confirm your inquiry to unlock this step.' : undefined}
              disabled={index === 1 && (!state.challengeDecided || !state.confirmedInterpretation ||
                state.educatorInterpretation.trim() !== state.confirmedInterpretation) ||
                index === 2 && (!state.confirmedInquiry || inquiryChanged)}
              onClick={() => navigate((index + 1) as 1 | 2 | 3)}><span>{index + 1}</span>{name}</button>)}</nav>
          <p className="step-hint" role="note">{state.step === 1
            ? (state.challengeDecided ? 'Next: confirm your interpretation to unlock Refine.'
              : 'Next: continue with your interpretation to unlock Refine. Requesting an AI challenge is optional.')
            : state.step === 2
              ? (inquiryChanged ? 'Next: confirm your changed inquiry to unlock Rehearse.' : 'Next: confirm your inquiry to unlock Rehearse.')
              : (state.confirmedActivity ? 'Activity confirmed. Refine any step or revisit your inquiry anytime.'
                : 'Next: confirm your activity once it aligns with your confirmed inquiry.')}</p>
          <div className="editor-content">
            <span className="status-label">Your draft</span>
            <h2>{state.step === 1 ? 'Interpret the evidence' : state.step === 2 ? 'Draft an inquiry' : 'Plan a rehearsal'}</h2>
            <p className="section-intro">{state.step === 1 ? 'What might the student work be telling us? Hold your interpretation as a hypothesis, not a finding.'
              : state.step === 2 ? 'Refine or keep your question. Only your separate confirmation makes it authoritative.'
                : 'Rehearse one mathematical idea in 15 minutes. The PLC still decides its classroom strategy.'}</p>
            <div className="label-with-tip"><label htmlFor="interpretation">Your Interpretation</label>
              <InfoTip label="About Your Interpretation">
                Your explanation of what the student evidence may suggest. You can revise it at any time.
              </InfoTip></div>
            <textarea id="interpretation" ref={targetRef('interpretation')} maxLength={2000} rows={5} value={state.educatorInterpretation}
              onChange={(event) => edit('educatorInterpretation', event.target.value)} />
            {state.draftSources.educatorInterpretation && <Provenance origin={state.draftSources.educatorInterpretation.origin} action="challenge" />}
            {state.step === 1 && <InterpretationSource state={state} onSelect={selectInterpretation} />}
            <p className="field-note">Your interpretation stays yours, even when you accept an AI question.</p>
            {state.step !== 1 && state.confirmedInterpretation &&
              <div className="confirmed-inquiry"><span className="eyebrow">EDUCATOR-CONFIRMED INTERPRETATION <InfoTip label="About the confirmed interpretation">
                The explanation you've chosen to use for planning. AI suggestions do not confirm it automatically.
              </InfoTip></span><p>{state.confirmedInterpretation}</p>
                <InterpretationSource state={state} onSelect={selectInterpretation} /></div>}
            {state.step !== 1 && <>
              <div className="field-heading"><div className="label-with-tip"><label htmlFor="inquiry">Your PLC Question</label>
                <InfoTip label="About your PLC question">
                  The question your team will investigate. Only your separate confirmation makes it authoritative.
                </InfoTip></div>
                <span className="status-label">{state.confirmedInquiry && !inquiryChanged ? 'Educator confirmed' : 'Your draft'}</span></div>
              <textarea id="inquiry" ref={targetRef('inquiry')} maxLength={2000} rows={4} value={state.inquiryDraft}
                onChange={(event) => edit('inquiryDraft', event.target.value)} />
              {state.draftSources.inquiryDraft && <Provenance origin={state.draftSources.inquiryDraft.origin} action="refine_inquiry" />}
              {inquiryChanged && <p className="notice">Unconfirmed edits. Confirm your changed inquiry before requesting a rehearsal.</p>}
            </>}
            <div className="request-area">
              <div className="support-actions"><button className="primary" onClick={requestSuggestion} disabled={busy || !!state.pending ||
                (state.step === 1 ? !state.educatorInterpretation.trim() : state.step === 2 ? !state.inquiryDraft.trim() : !state.confirmedInquiry || inquiryChanged)}>
                {state.guide ? 'Try AI' : state.step === 1 ? state.challengeDecided ? 'Try another challenge' : 'Challenge my interpretation'
                  : state.step === 2 ? 'Suggest a stronger PLC question' : 'Suggest a PLC activity'}
              </button>
                <button className="secondary" onClick={useGuide} disabled={state.supportBlocked}>Use guided planning</button>
                <InfoTip label="About guided planning">
                  Use structured questions to develop your plan without requesting a new AI suggestion.
                </InfoTip></div>
              <p className="field-note">AI runs only when you ask. Accepting copies a suggestion into a draft.</p>
              {busy && <div className="request-loading">
                <p className="loading-indicator"><Spinner /><span>Reviewing the evidence…</span></p>
                <button className="secondary" onClick={stop}>Cancel request</button>
              </div>}
            </div>
            {state.step === 1 && <button className="secondary confirm-button" disabled={!state.educatorInterpretation.trim() || busy || !!state.pending}
              onClick={confirmStep1}>
              {state.challengeDecided ? 'Confirm interpretation and continue →' : 'Continue with my interpretation →'}
            </button>}
            {state.step === 2 && <button className="secondary confirm-button" disabled={!state.inquiryDraft.trim() || busy || !!state.pending}
              onClick={confirmInquiry}>Confirm inquiry →</button>}
            {state.step === 2 && state.decisions.at(-1)?.suggestion.action === 'challenge' && state.decisions.at(-1)?.choice === 'rejected' &&
              <p className="notice">Continue with my interpretation: your original question is unchanged. Refinement is optional.</p>}
            {state.step === 3 && <>
              <div className="confirmed-inquiry"><span className="eyebrow">EDUCATOR CONFIRMED · REQUEST CONTEXT</span><p>{state.confirmedInquiry}</p></div>
              <div className="field-heading"><label htmlFor="activity">Activity preview</label><span className="status-label">
                {state.activityNeedsReview ? 'Needs review' : state.confirmedActivity ? 'Educator confirmed' : 'Your draft / Needs confirmation'}</span></div>
              <textarea id="activity" ref={targetRef('activity')} maxLength={12000} rows={8} value={state.activityDraft}
                placeholder="Write your own activity using the planning support, or request an AI suggestion."
                onChange={(event) => edit('activityDraft', event.target.value)} />
              {state.draftSources.activityDraft && <Provenance origin={state.draftSources.activityDraft.origin} action="suggest_activity" />}
              {state.activityNeedsReview && <div className="notice">Review this activity for alignment with your confirmed inquiry before confirming it.
                <button className="secondary" disabled={inquiryChanged || busy} onClick={() => dispatch({ type: 'reviewActivity' })}>Review accepted activity</button></div>}
              <button className="secondary confirm-button" disabled={!state.activityDraft.trim() || state.activityNeedsReview || inquiryChanged || busy || !!state.pending}
                onClick={confirmActivity}>Confirm activity</button>
              <p className="field-note">Confirmation means you choose to bring this rehearsal to discussion—not that the team has selected a classroom change.</p>
            </>}
          </div>
        </section>
        <aside className="ai-column" aria-label="Planning support and your decisions">
          <section ref={targetRef('suggestion-panel')} className={`suggestion-panel ${state.pending ? 'has-suggestion' : ''}`} tabIndex={-1} aria-labelledby="suggestion-title" aria-busy={busy}>
            <div className="ai-panel-heading"><div><span className="eyebrow">{state.pending ? 'For your review / Not confirmed' : 'Optional assistance'}</span>
              <h2 id="suggestion-title" ref={feedback} tabIndex={-1}>{state.pending ? actionNames[currentAction] : 'Planning support'}</h2></div></div>
            <p className="sr-only" role="status">{state.guide && !busy && !state.pending ? 'Guided planning is ready. Your draft is unchanged.' : ''}</p>
            {busy ? <div className="empty-state loading-state" role="status" aria-live="polite">
              <h3><Spinner />Reviewing the evidence…</h3><p>Your interpretation and submitted evidence stay in place while the suggestion is prepared.</p></div>
              : state.pending ? <>
                <Provenance origin={state.pending.origin} action={state.pending.suggestion.action} explain />
                <p>{state.pending.origin === 'demo' ? 'Built-in example ready for review.' : 'AI suggestion ready for review.'}</p>
                <LiveModelCallout model={state.pending.origin === 'gemini' ? state.pending.model : undefined} />
                <SuggestionContent suggestion={state.pending.suggestion} />
                <Sources ids={state.pending.suggestion.sourceIds} onNavigate={navigateToSource} />
                <div className="uncertainty"><h3>Uncertainty &amp; limits</h3><p>{state.pending.suggestion.limitations}</p></div>
                <details className="activity-detail more-detail"><summary>More detail</summary>
                  <h3 className="small-heading">Why investigate this?</h3><p>{state.pending.suggestion.rationale}</p></details>
                <div className="decision-buttons">
                  <button className="primary" onClick={() => decide('accepted')}>Accept suggestion</button>
                  <button className="secondary" onClick={() => decide('rejected')}>Reject suggestion</button>
                </div><p className="field-note">Accept → editable draft. Reject → your work stays unchanged.</p>
              </> : state.guide && !state.supportBlocked ? <PlanningGuide action={currentAction}
                examplesAvailable={matchesExampleScenario(state.scenario, sourceIds)} onNavigate={navigateToSource}
                onExample={() => {
                  if (state.fallback) dispatch({ type: 'demo', failedRequestId: state.fallback.id,
                    id: crypto.randomUUID(), at: new Date().toISOString() })
                }} /> : <div className="empty-state">
                <h3>No suggestion to review</h3>
                <p>{state.decisions.length ? 'Continue with your draft or request another suggestion. Confirmation is a separate action.'
                  : state.step === 1 ? 'Your evidence and interpretation are ready. Request a challenge to explore an alternative explanation, or use guided planning.'
                    : state.step === 2 ? 'Request a stronger PLC question, or use guided planning. Review sources and limits before accepting or rejecting.'
                      : 'Request a rehearsal activity, or use guided planning. Review sources and limits before accepting or rejecting.'}</p></div>}
            {state.error && <p className="error" role="alert">{state.error}</p>}
            {(state.outcome === 'provider_failure' || state.outcome === 'ui_deadline') &&
              <details className="activity-detail service-details"><summary>Service details</summary>
                <p>No new AI suggestion was returned for this request.</p>
                {state.outcome === 'ui_deadline' && <p>The workspace waiting limit was reached; this does not establish a provider failure. Stopping the browser request does not guarantee provider processing or charges stopped.</p>}
              </details>}
          </section>
          <section className="decision-trail" aria-label="Decision trail">
            <div className="trail-heading"><h2>Your decision trail <span>{state.decisions.length}</span></h2>
              <InfoTip label="About the decision trail">
                A record of suggestions you accepted or rejected. It is for your reference and is never sent back to the AI.
              </InfoTip></div>
            {!state.decisions.length ? <p>No decisions recorded yet. Suggestions you accept or reject will appear here.</p> :
              [...state.decisions].reverse().map((decision) => <details key={decision.id} className="decision-record">
                <summary><span>{actionNames[decision.suggestion.action]}</span><b>{decision.choice}</b>
                  <span className="status-label">{decision.origin === 'demo' ? 'Built-in example' : 'AI suggestion'}</span>
                </summary>
                {decision.origin === 'demo' && <p>Prepared scenario: {demoScenario[decision.suggestion.action]}</p>}
                {decision.origin === 'gemini' && <LiveModelCallout model={decision.model} />}
                <time dateTime={decision.at}>{new Date(decision.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
                <p>{decision.appliedToDraft ? 'Copied to an editable draft. Separate confirmation required.'
                  : 'Not copied. Educator work preserved; not used as later request context.'}</p>
                <p className="history-content">{decision.suggestion.action === 'suggest_activity'
                  ? formatActivity(decision.suggestion.activity)
                  : decision.suggestion.action === 'challenge'
                    ? decision.suggestion.revisedInterpretation : decision.suggestion.suggestedInquiry}</p>
                {decision.suggestion.action === 'challenge' && <p>
                  Documented evidence: {decision.suggestion.evidenceConsideration}<br />
                  Opposing reading: {decision.suggestion.alternativeHypothesis}<br />
                  {decision.suggestion.probingQuestion}
                </p>}
                <p>{decision.suggestion.rationale}</p><p>Limits: {decision.suggestion.limitations}</p>
                <Sources ids={decision.suggestion.sourceIds} onNavigate={navigateToSource} />
              </details>)}
          </section>
        </aside>
      </div>
      <footer>AI integration demo · Fictional, de-identified evidence · Session-only drafts · The educator owns every decision · Not a Leading Educators product or endorsement.</footer>
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
