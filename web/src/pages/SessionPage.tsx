import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { streamSession, submitClarification } from '../lib/api'
import { SettingsMenu } from '../lib/settings'
import { ArrowLeft, Check, Copy, Download, Eye, EyeOff, Send } from 'lucide-react'
import html2pdf from 'html2pdf.js'
import type {
  AgentResponseEvent,
  AgentThinkingEvent,
  ClarificationAnswerEvent,
  ClarificationRequestEvent,
  FacilitatorFramingEvent,
  ReviewEvent,
  RoundExtractionEvent,
  RoundStartEvent,
  SavedSession,
  SessionConfig,
  SessionEndEvent,
  SessionEvent,
  SessionStartEvent,
  SessionStatus,
  SynthesisEvent,
} from '../types'

const STATUS_TEXT: Record<SessionStatus, string> = {
  connecting: 'connecting',
  framing: 'framing',
  running: 'running',
  awaiting_clarification: 'awaiting clarification',
  synthesizing: 'synthesizing',
  done: 'done',
  error: 'error',
}

type Props =
  | { mode: 'live'; sessionId: string; config: SessionConfig; onBack: () => void }
  | { mode: 'replay'; session: SavedSession; onBack: () => void }

export default function SessionPage(props: Props) {
  const [events, setEvents] = useState<SessionEvent[]>([])
  const [status, setStatus] = useState<SessionStatus>(
    props.mode === 'replay' ? 'done' : 'connecting',
  )
  const [agentsCollapsed, setAgentsCollapsed] = useState(false)
  const feedRef = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)

  // Replay mode: load events immediately
  useEffect(() => {
    if (props.mode === 'replay') {
      setEvents(props.session.events)
    }
  }, [props.mode]) // eslint-disable-line react-hooks/exhaustive-deps

  // Live mode: connect SSE stream
  useEffect(() => {
    if (props.mode !== 'live') return
    const stop = streamSession(
      props.sessionId,
      (event) => {
        setEvents(prev => [...prev, event])
        if (event.type === 'facilitator_framing') setStatus('framing')
        else if (event.type === 'round_start') setStatus('running')
        else if (event.type === 'clarification_request') setStatus('awaiting_clarification')
        else if (event.type === 'clarification_answer') setStatus('running')
        else if (event.type === 'synthesis') setStatus('synthesizing')
        else if (event.type === 'session_end') setStatus('done')
        else if (event.type === 'error') setStatus('error')
      },
      () => setStatus('error'),
    )
    return stop
  }, [props.mode]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll when new events arrive
  useEffect(() => {
    if (atBottomRef.current && feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight
    }
  }, [events])

  function handleScroll() {
    const el = feedRef.current
    if (!el) return
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100
  }

  // Hide agent_thinking once the corresponding response or clarification_request has arrived
  const visibleEvents = useMemo(() => {
    return events.filter((event, index) => {
      if (event.type !== 'agent_thinking') return true
      const agentName = (event as AgentThinkingEvent).agent
      const later = events.slice(index + 1)
      const responseArrived = later.some(
        e => e.type === 'agent_response' && (e as AgentResponseEvent).agent === agentName,
      )
      const clarificationArrived = later.some(
        e => e.type === 'clarification_request' && (e as ClarificationRequestEvent).agent === agentName,
      )
      return !responseArrived && !clarificationArrived
    })
  }, [events])

  const sessionId = props.mode === 'live' ? props.sessionId : undefined
  const title = props.mode === 'replay' ? props.session.name || props.session.topic : props.config.topic
  const subtitle = props.mode === 'replay' && props.session.name ? props.session.topic : undefined

  return (
    <div className="h-screen flex flex-col bg-[var(--c-bg)] overflow-hidden relative">
      {/* ── Header ─────────────────────────────────────────── */}
      <header className="border-b border-[var(--c-border)] h-12 px-5 flex items-center gap-4 shrink-0">
        <button
          onClick={props.onBack}
          className="text-[var(--c-muted-2)] flex items-center gap-1.5 shrink-0 hover:text-[var(--c-secondary)] transition-colors"
        >
          <ArrowLeft size={14} />
          <span className="text-[12px]">Back</span>
        </button>
        <div className="w-px h-4 bg-[var(--c-border)] shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-[13px] font-medium text-[var(--c-fg)] truncate block leading-none">
            {title}
          </span>
          {subtitle && (
            <span className="text-[11px] text-[var(--c-muted-2)] truncate block mt-0.5 leading-none">
              {subtitle}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span
            className={`text-[11px] font-mono ${
              status === 'done' ? 'text-[var(--c-secondary)]'
              : status === 'error' ? 'text-[var(--c-secondary)]'
              : status === 'awaiting_clarification' ? 'text-[var(--c-fg)]'
              : 'text-[var(--c-muted-2)]'
            }`}
          >
            {STATUS_TEXT[status]}
          </span>
          <SettingsMenu />
        </div>
      </header>

      {/* ── Event feed ─────────────────────────────────────── */}
      <div ref={feedRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
        <div className="max-w-[680px] mx-auto px-5 py-5">
          {status === 'connecting' && events.length === 0 && (
            <p className="text-[12px] text-[var(--c-muted-2)] py-4">Connecting to session…</p>
          )}

          {visibleEvents.map((event, i) => (
            <EventBlock
              key={i}
              event={event}
              collapsed={agentsCollapsed}
              sessionId={sessionId}
              allEvents={events}
            />
          ))}

          {status === 'done' && <div className="h-16" />}
        </div>
      </div>

      {/* ── Floating collapse toggle ────────────────────────── */}
      <div className="absolute bottom-5 left-0 right-0 flex justify-center pointer-events-none">
        <button
          onClick={() => setAgentsCollapsed(v => !v)}
          className="pointer-events-auto flex items-center gap-1.5 text-[11px] text-[var(--c-muted-2)] border border-[var(--c-border)] bg-[var(--c-bg-alpha)] backdrop-blur-sm rounded-full px-4 py-1.5 hover:text-[var(--c-secondary)] hover:border-[var(--c-muted)] transition-colors"
        >
          {agentsCollapsed
            ? <><Eye size={13} className="shrink-0" /><span>expand responses</span></>
            : <><EyeOff size={13} className="shrink-0" /><span>collapse responses</span></>
          }
        </button>
      </div>
    </div>
  )
}

// ── Individual event renderers ──────────────────────────────────────────────

interface EventBlockProps {
  event: SessionEvent
  collapsed: boolean
  sessionId?: string
  allEvents: SessionEvent[]
}

function EventBlock({ event, collapsed, sessionId, allEvents }: EventBlockProps) {
  switch (event.type) {
    case 'session_start':         return <SessionStartBlock event={event} />
    case 'facilitator_framing':   return <FramingBlock event={event} />
    case 'round_start':           return <RoundStartBlock event={event} />
    case 'agent_thinking':        return <ThinkingBlock event={event} />
    case 'agent_response':        return <AgentBlock event={event} collapsed={collapsed} />
    case 'round_end':             return null
    case 'round_extraction':      return <ExtractionBlock event={event} />
    case 'review':                return <ReviewBlock event={event} />
    case 'clarification_request': return (
      <ClarificationCard
        event={event}
        sessionId={sessionId}
        allEvents={allEvents}
      />
    )
    case 'clarification_answer':  return null  // shown as part of ClarificationCard history
    case 'synthesis':             return <SynthesisBlock event={event} />
    case 'session_end':           return <SessionEndBlock event={event} />
    case 'error':                 return <ErrorBlock message={event.message} />
    default:                      return null
  }
}

function SessionStartBlock({ event }: { event: SessionStartEvent }) {
  return (
    <div className="py-3 border-b border-[var(--c-border-subtle)] mb-1">
      <div className="text-[11px] text-[var(--c-muted)] font-mono mb-1.5">◆ session init</div>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[12px] text-[var(--c-secondary)]">
        <span>{event.agents.length} member{event.agents.length !== 1 ? 's' : ''}</span>
        <Dot />
        <span>{event.discussion_rounds} round{event.discussion_rounds !== 1 ? 's' : ''}</span>
        <Dot />
        <span>{event.agents.map(a => a.name).join(', ')}</span>
      </div>
    </div>
  )
}

function FramingBlock({ event }: { event: FacilitatorFramingEvent }) {
  return (
    <div className="py-4 border-b border-[var(--c-border-subtle)] mb-1">
      <div className="text-[11px] text-[var(--c-muted)] font-mono mb-2.5">⬡ framing</div>
      <p className="text-[13px] text-[var(--c-body)] leading-relaxed mb-3">{event.definition}</p>
      {event.questions.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-[var(--c-muted-2)] mb-1.5">
            Key questions
          </div>
          <ul className="space-y-1">
            {event.questions.map((q, i) => (
              <li key={i} className="flex gap-2 text-[12px] text-[var(--c-secondary)]">
                <span className="text-[var(--c-muted)] shrink-0 mt-px">·</span>
                <span>{q}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-3 text-[10px] text-[var(--c-muted)] font-mono">
        {event.model} · {event.tokens}t
      </div>
    </div>
  )
}

function RoundStartBlock({ event }: { event: RoundStartEvent }) {
  return (
    <div className="flex items-center gap-3 py-4">
      <span className="text-[11px] text-[var(--c-muted)] font-mono whitespace-nowrap">
        ▶ round {event.round}
      </span>
      <div className="flex-1 border-t border-[var(--c-border-subtle)]" />
    </div>
  )
}

function ThinkingBlock({ event }: { event: AgentThinkingEvent }) {
  return (
    <div className="py-2 pl-3 border-l border-[var(--c-border)] mb-0.5">
      <span className="text-[12px] text-[var(--c-muted-2)]">{event.agent}</span>
      <span className="text-[12px] text-[var(--c-muted)] mx-1.5">—</span>
      <span className="text-[12px] text-[var(--c-muted)]">thinking</span>
      <span className="dot-blink text-[12px] text-[var(--c-muted)]">.</span>
      <span className="dot-blink text-[12px] text-[var(--c-muted)]">.</span>
      <span className="dot-blink text-[12px] text-[var(--c-muted)]">.</span>
    </div>
  )
}

function AgentBlock({ event, collapsed }: { event: AgentResponseEvent; collapsed: boolean }) {
  return (
    <div className={`pl-3 border-l-2 border-[var(--c-border)] mb-2 ${collapsed ? 'py-2' : 'py-4'}`}>
      <div className={`flex items-baseline gap-2 ${collapsed ? '' : 'mb-2.5'}`}>
        <span className="text-[13px] font-semibold text-[var(--c-fg)]">{event.agent}</span>
        <span className="text-[12px] text-[var(--c-secondary)]">{event.role}</span>
        <span className="ml-auto text-[10px] text-[var(--c-muted)] font-mono">
          {event.model} · {event.tokens}t
        </span>
      </div>
      {!collapsed && (
        <div className="prose-session">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{event.content}</ReactMarkdown>
        </div>
      )}
    </div>
  )
}

// ── Clarification card ──────────────────────────────────────────────────────

interface ClarificationCardProps {
  event: ClarificationRequestEvent
  sessionId?: string
  allEvents: SessionEvent[]
}

function ClarificationCard({ event, sessionId, allEvents }: ClarificationCardProps) {
  const [answer, setAnswer] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Determine if an answer has already been submitted (clarification_answer arrived)
  const answerEvent = allEvents.find(
    e =>
      e.type === 'clarification_answer' &&
      (e as ClarificationAnswerEvent).agent === event.agent &&
      (e as ClarificationAnswerEvent).round === event.round,
  ) as ClarificationAnswerEvent | undefined

  // Determine if the agent has already resumed and finalized (agent_response arrived after this)
  const requestIndex = allEvents.indexOf(event)
  const responseArrived = allEvents
    .slice(requestIndex + 1)
    .some(
      e =>
        e.type === 'agent_response' &&
        (e as AgentResponseEvent).agent === event.agent &&
        (e as AgentResponseEvent).round === event.round,
    )

  async function handleSubmit() {
    if (!sessionId || !answer.trim()) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      await submitClarification(sessionId, answer.trim())
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit')
      setSubmitting(false)
    }
    // Keep submitting=true until agent_response arrives (the card will collapse)
  }

  // Once the response has arrived, render a collapsed history record
  if (responseArrived) {
    return (
      <div className="pl-3 border-l-2 border-[var(--c-border)] mb-2 py-2">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-[12px] font-medium text-[var(--c-fg)]">{event.agent}</span>
          <span className="text-[10px] font-mono text-[var(--c-muted)]">? clarification</span>
        </div>
        <div className="text-[11px] text-[var(--c-muted-2)] mb-0.5">{event.question}</div>
        {answerEvent && (
          <div className="text-[11px] text-[var(--c-secondary)]">
            <span className="text-[var(--c-muted)] mr-1">↳</span>
            {answerEvent.answer}
          </div>
        )}
      </div>
    )
  }

  // Pending state: render the full interactive clarification card
  return (
    <div className="mb-3 border border-[var(--c-border)] rounded-lg bg-[var(--c-surface)] overflow-hidden">
      {/* Card header */}
      <div className="px-4 pt-3 pb-2 border-b border-[var(--c-border-subtle)]">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[12px] font-semibold text-[var(--c-fg)]">{event.agent}</span>
          <span className="text-[10px] text-[var(--c-muted)] font-mono">{event.role}</span>
          <span className="ml-auto text-[10px] font-mono text-[var(--c-muted)] border border-[var(--c-border)] rounded px-1.5 py-0.5">
            needs clarification
          </span>
        </div>
      </div>

      {/* Question + why */}
      <div className="px-4 py-3">
        <p className="text-[13px] text-[var(--c-body)] leading-relaxed mb-2">
          {event.question}
        </p>
        {event.why_it_matters && (
          <p className="text-[11px] text-[var(--c-muted-2)] leading-relaxed">
            <span className="text-[var(--c-muted)] mr-1">Why this matters:</span>
            {event.why_it_matters}
          </p>
        )}
      </div>

      {/* Answer input */}
      {sessionId && (
        <div className="px-4 pb-3">
          <textarea
            value={answer}
            onChange={e => setAnswer(e.target.value)}
            disabled={submitting || !!answerEvent}
            placeholder="Type your answer…"
            rows={3}
            className="w-full text-[12px] text-[var(--c-fg)] bg-[var(--c-bg)] border border-[var(--c-border)] rounded-md px-3 py-2 resize-none placeholder:text-[var(--c-muted)] focus:outline-none focus:border-[var(--c-muted)] transition-colors disabled:opacity-50"
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                handleSubmit()
              }
            }}
          />
          {submitError && (
            <p className="text-[11px] text-[var(--c-secondary)] mt-1">{submitError}</p>
          )}
          <div className="flex items-center justify-between mt-2">
            <span className="text-[10px] text-[var(--c-muted)]">⌘↵ to submit</span>
            <button
              onClick={handleSubmit}
              disabled={submitting || !answer.trim() || !!answerEvent}
              className="flex items-center gap-1.5 text-[11px] px-3 py-1 rounded border border-[var(--c-border)] text-[var(--c-fg)] hover:border-[var(--c-muted)] hover:text-[var(--c-secondary)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {submitting
                ? <><span className="dot-blink">.</span><span className="dot-blink">.</span><span className="dot-blink">.</span></>
                : <><Send size={11} /><span>Submit</span></>
              }
            </button>
          </div>
        </div>
      )}

      {/* Replay mode: show the recorded answer */}
      {!sessionId && answerEvent && (
        <div className="px-4 pb-3 border-t border-[var(--c-border-subtle)] pt-2">
          <div className="text-[10px] uppercase tracking-widest text-[var(--c-muted)] mb-1">Answer</div>
          <p className="text-[12px] text-[var(--c-secondary)]">{answerEvent.answer}</p>
        </div>
      )}
    </div>
  )
}

function ExtractionBlock({ event }: { event: RoundExtractionEvent }) {
  return (
    <div className="py-3 ml-3 mb-2">
      <div className="text-[10px] text-[var(--c-muted)] font-mono mb-1.5">
        ⊛ round {event.round} — extraction
      </div>
      <p className="text-[12px] text-[var(--c-muted-2)] leading-relaxed mb-2">{event.summary}</p>
      {event.decisions_added.length > 0 && (
        <div className="mb-2">
          <div className="text-[10px] uppercase tracking-widest text-[var(--c-muted)] mb-1">Decisions</div>
          {event.decisions_added.map((d, i) => (
            <div key={i} className="flex gap-2 text-[11px] text-[var(--c-muted-2)] mb-0.5">
              <span className="text-[var(--c-muted)] shrink-0">+</span>
              <span>{d}</span>
            </div>
          ))}
        </div>
      )}
      {event.open_items.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-[var(--c-muted)] mb-1">Open items</div>
          {event.open_items.map((item, i) => (
            <div key={i} className="flex gap-2 text-[11px] text-[var(--c-muted-2)] mb-0.5">
              <span className="text-[var(--c-muted)] shrink-0">?</span>
              <span>{item}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ReviewBlock({ event }: { event: ReviewEvent }) {
  return (
    <div className="py-2 flex items-baseline gap-2 mb-1">
      <span className="text-[10px] font-mono text-[var(--c-muted)]">⊹ review</span>
      <span className="text-[var(--c-border)]">—</span>
      <span className="text-[11px] font-medium text-[var(--c-secondary)]">
        {event.decision}
      </span>
      <span className="text-[11px] text-[var(--c-muted)]">{event.reason}</span>
    </div>
  )
}

function SynthesisBlock({ event }: { event: SynthesisEvent }) {
  const [copied, setCopied] = useState(false)
  const deliverableRef = useRef<HTMLDivElement>(null)

  function handleCopy() {
    navigator.clipboard.writeText(event.deliverable).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function handleDownloadPdf() {
    if (!deliverableRef.current) return
    const filename = `synthesis-${Date.now()}.pdf`
    html2pdf()
      .set({
        margin: [12, 14, 12, 14],
        filename,
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      })
      .from(deliverableRef.current)
      .save()
  }

  return (
    <div className="pt-5 mt-2 border-t-2 border-[var(--c-border)]">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-[11px] font-mono text-[var(--c-secondary)]">◈ synthesis</span>
        <span className="text-[11px] text-[var(--c-muted)]">{event.output_type}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={handleCopy}
            title="Copy to clipboard"
            className="flex items-center gap-1 text-[11px] text-[var(--c-muted)] hover:text-[var(--c-secondary)] border border-[var(--c-border)] rounded px-2 py-0.5 transition-colors"
          >
            {copied ? <Check size={11} /> : <Copy size={11} />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
          <button
            onClick={handleDownloadPdf}
            title="Download as PDF"
            className="flex items-center gap-1 text-[11px] text-[var(--c-muted)] hover:text-[var(--c-secondary)] border border-[var(--c-border)] rounded px-2 py-0.5 transition-colors"
          >
            <Download size={11} />
            <span>PDF</span>
          </button>
        </div>
      </div>
      <div className="border border-[var(--c-border)] rounded-lg px-5 py-4 mb-4 bg-[var(--c-surface-deep)]">
        <div ref={deliverableRef} className="prose-session">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{event.deliverable}</ReactMarkdown>
        </div>
      </div>
      {event.summary && (
        <p className="text-[12px] text-[var(--c-secondary)] leading-relaxed mb-3">{event.summary}</p>
      )}
      {event.key_decisions.length > 0 && (
        <div className="mb-3">
          <div className="text-[10px] uppercase tracking-widest text-[var(--c-muted)] mb-1.5">Key decisions</div>
          {event.key_decisions.map((d, i) => (
            <div key={i} className="flex gap-2 text-[12px] text-[var(--c-secondary)] mb-0.5">
              <span className="text-[var(--c-muted)] shrink-0">·</span>
              <span>{d}</span>
            </div>
          ))}
        </div>
      )}
      {event.open_questions.length > 0 && (
        <div className="mb-3">
          <div className="text-[10px] uppercase tracking-widest text-[var(--c-muted)] mb-1.5">Open questions</div>
          {event.open_questions.map((q, i) => (
            <div key={i} className="flex gap-2 text-[12px] text-[var(--c-muted-2)] mb-0.5">
              <span className="text-[var(--c-muted)] shrink-0">?</span>
              <span>{q}</span>
            </div>
          ))}
        </div>
      )}
      <div className="text-[10px] font-mono text-[var(--c-muted)] mt-2">
        {event.model} · {event.tokens}t
      </div>
    </div>
  )
}

function SessionEndBlock({ event }: { event: SessionEndEvent }) {
  return (
    <div className="py-3 mt-2 text-[11px] text-[var(--c-muted)] font-mono">
      ◆ done · {event.total_rounds} round{event.total_rounds !== 1 ? 's' : ''}
    </div>
  )
}

function ErrorBlock({ message }: { message: string }) {
  return (
    <div className="py-3 px-3 border border-[var(--c-border)] rounded-md bg-[var(--c-surface)] my-2">
      <div className="text-[11px] font-mono text-[var(--c-fg)] mb-1">✗ error</div>
      <div className="text-[12px] text-[var(--c-secondary)]">{message}</div>
    </div>
  )
}

function Dot() {
  return <span className="text-[var(--c-muted)]">·</span>
}
