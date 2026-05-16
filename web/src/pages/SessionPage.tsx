import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { streamSession } from '../lib/api'
import type {
  AgentResponseEvent,
  AgentThinkingEvent,
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

  // Hide agent_thinking once the corresponding response has arrived
  const visibleEvents = useMemo(() => {
    return events.filter((event, index) => {
      if (event.type !== 'agent_thinking') return true
      const agentName = (event as AgentThinkingEvent).agent
      return !events
        .slice(index + 1)
        .some(e => e.type === 'agent_response' && (e as AgentResponseEvent).agent === agentName)
    })
  }, [events])

  const title = props.mode === 'replay' ? props.session.name || props.session.topic : props.config.topic
  const subtitle = props.mode === 'replay' && props.session.name ? props.session.topic : undefined

  return (
    <div className="h-screen flex flex-col bg-[#09090b] overflow-hidden">
      {/* ── Header ─────────────────────────────────────────── */}
      <header className="border-b border-[#27272a] h-12 px-5 flex items-center gap-4 shrink-0">
        <button
          onClick={props.onBack}
          className="text-[12px] text-[#71717a] flex items-center gap-1 shrink-0"
        >
          ← Back
        </button>
        <div className="w-px h-4 bg-[#27272a] shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-[13px] font-medium text-[#fafafa] truncate block leading-none">
            {title}
          </span>
          {subtitle && (
            <span className="text-[11px] text-[#71717a] truncate block mt-0.5 leading-none">
              {subtitle}
            </span>
          )}
        </div>
        <span
          className={`text-[11px] font-mono shrink-0 ${
            status === 'done' ? 'text-[#a1a1aa]' : status === 'error' ? 'text-[#a1a1aa]' : 'text-[#71717a]'
          }`}
        >
          {STATUS_TEXT[status]}
        </span>
      </header>

      {/* ── Event feed ─────────────────────────────────────── */}
      <div ref={feedRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
        <div className="max-w-[680px] mx-auto px-5 py-5">
          {status === 'connecting' && events.length === 0 && (
            <p className="text-[12px] text-[#71717a] py-4">Connecting to session…</p>
          )}

          {visibleEvents.map((event, i) => (
            <EventBlock key={i} event={event} />
          ))}

          {status === 'done' && <div className="h-16" />}
        </div>
      </div>
    </div>
  )
}

// ── Individual event renderers ──────────────────────────────────────────────

function EventBlock({ event }: { event: SessionEvent }) {
  switch (event.type) {
    case 'session_start':      return <SessionStartBlock event={event} />
    case 'facilitator_framing': return <FramingBlock event={event} />
    case 'round_start':        return <RoundStartBlock event={event} />
    case 'agent_thinking':     return <ThinkingBlock event={event} />
    case 'agent_response':     return <AgentBlock event={event} />
    case 'round_end':          return null
    case 'round_extraction':   return <ExtractionBlock event={event} />
    case 'review':             return <ReviewBlock event={event} />
    case 'synthesis':          return <SynthesisBlock event={event} />
    case 'session_end':        return <SessionEndBlock event={event} />
    case 'error':              return <ErrorBlock message={event.message} />
    default:                   return null
  }
}

function SessionStartBlock({ event }: { event: SessionStartEvent }) {
  return (
    <div className="py-3 border-b border-[#1f1f1f] mb-1">
      <div className="text-[11px] text-[#52525b] font-mono mb-1.5">◆ session init</div>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[12px] text-[#a1a1aa]">
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
    <div className="py-4 border-b border-[#1f1f1f] mb-1">
      <div className="text-[11px] text-[#52525b] font-mono mb-2.5">⬡ framing</div>
      <p className="text-[13px] text-[#d4d4d8] leading-relaxed mb-3">{event.definition}</p>
      {event.questions.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-[#71717a] mb-1.5">
            Key questions
          </div>
          <ul className="space-y-1">
            {event.questions.map((q, i) => (
              <li key={i} className="flex gap-2 text-[12px] text-[#a1a1aa]">
                <span className="text-[#52525b] shrink-0 mt-px">·</span>
                <span>{q}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-3 text-[10px] text-[#52525b] font-mono">
        {event.model} · {event.tokens}t
      </div>
    </div>
  )
}

function RoundStartBlock({ event }: { event: RoundStartEvent }) {
  return (
    <div className="flex items-center gap-3 py-4">
      <span className="text-[11px] text-[#52525b] font-mono whitespace-nowrap">
        ▶ round {event.round}
      </span>
      <div className="flex-1 border-t border-[#1f1f1f]" />
    </div>
  )
}

function ThinkingBlock({ event }: { event: AgentThinkingEvent }) {
  return (
    <div className="py-2 pl-3 border-l border-[#27272a] mb-0.5">
      <span className="text-[12px] text-[#71717a]">{event.agent}</span>
      <span className="text-[12px] text-[#52525b] mx-1.5">—</span>
      <span className="text-[12px] text-[#52525b]">thinking</span>
      <span className="dot-blink text-[12px] text-[#52525b]">.</span>
      <span className="dot-blink text-[12px] text-[#52525b]">.</span>
      <span className="dot-blink text-[12px] text-[#52525b]">.</span>
    </div>
  )
}

function AgentBlock({ event }: { event: AgentResponseEvent }) {
  return (
    <div className="py-4 pl-3 border-l-2 border-[#27272a] mb-2">
      <div className="flex items-baseline gap-2 mb-2.5">
        <span className="text-[13px] font-semibold text-[#fafafa]">{event.agent}</span>
        <span className="text-[12px] text-[#a1a1aa]">{event.role}</span>
        <span className="ml-auto text-[10px] text-[#52525b] font-mono">
          {event.model} · {event.tokens}t
        </span>
      </div>
      <div className="prose-session">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{event.content}</ReactMarkdown>
      </div>
    </div>
  )
}

function ExtractionBlock({ event }: { event: RoundExtractionEvent }) {
  return (
    <div className="py-3 ml-3 mb-2">
      <div className="text-[10px] text-[#52525b] font-mono mb-1.5">
        ⊛ round {event.round} — extraction
      </div>
      <p className="text-[12px] text-[#71717a] leading-relaxed mb-2">{event.summary}</p>
      {event.decisions_added.length > 0 && (
        <div className="mb-2">
          <div className="text-[10px] uppercase tracking-widest text-[#52525b] mb-1">Decisions</div>
          {event.decisions_added.map((d, i) => (
            <div key={i} className="flex gap-2 text-[11px] text-[#71717a] mb-0.5">
              <span className="text-[#52525b] shrink-0">+</span>
              <span>{d}</span>
            </div>
          ))}
        </div>
      )}
      {event.open_items.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-[#52525b] mb-1">Open items</div>
          {event.open_items.map((item, i) => (
            <div key={i} className="flex gap-2 text-[11px] text-[#71717a] mb-0.5">
              <span className="text-[#52525b] shrink-0">?</span>
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
      <span className="text-[10px] font-mono text-[#52525b]">⊹ review</span>
      <span className="text-[#27272a]">—</span>
      <span className={`text-[11px] font-medium ${event.decision === 'synthesize' ? 'text-[#a1a1aa]' : 'text-[#a1a1aa]'}`}>
        {event.decision}
      </span>
      <span className="text-[11px] text-[#52525b]">{event.reason}</span>
    </div>
  )
}

function SynthesisBlock({ event }: { event: SynthesisEvent }) {
  return (
    <div className="pt-5 mt-2 border-t-2 border-[#27272a]">
      <div className="flex items-baseline gap-2 mb-4">
        <span className="text-[11px] font-mono text-[#a1a1aa]">◈ synthesis</span>
        <span className="text-[11px] text-[#52525b]">{event.output_type}</span>
      </div>
      <div className="border border-[#27272a] rounded-lg px-5 py-4 mb-4 bg-[#0d0d0f]">
        <div className="prose-session">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{event.deliverable}</ReactMarkdown>
        </div>
      </div>
      {event.summary && (
        <p className="text-[12px] text-[#a1a1aa] leading-relaxed mb-3">{event.summary}</p>
      )}
      {event.key_decisions.length > 0 && (
        <div className="mb-3">
          <div className="text-[10px] uppercase tracking-widest text-[#52525b] mb-1.5">Key decisions</div>
          {event.key_decisions.map((d, i) => (
            <div key={i} className="flex gap-2 text-[12px] text-[#a1a1aa] mb-0.5">
              <span className="text-[#52525b] shrink-0">·</span>
              <span>{d}</span>
            </div>
          ))}
        </div>
      )}
      {event.open_questions.length > 0 && (
        <div className="mb-3">
          <div className="text-[10px] uppercase tracking-widest text-[#52525b] mb-1.5">Open questions</div>
          {event.open_questions.map((q, i) => (
            <div key={i} className="flex gap-2 text-[12px] text-[#71717a] mb-0.5">
              <span className="text-[#52525b] shrink-0">?</span>
              <span>{q}</span>
            </div>
          ))}
        </div>
      )}
      <div className="text-[10px] font-mono text-[#52525b] mt-2">
        {event.model} · {event.tokens}t
      </div>
    </div>
  )
}

function SessionEndBlock({ event }: { event: SessionEndEvent }) {
  return (
    <div className="py-3 mt-2 text-[11px] text-[#52525b] font-mono">
      ◆ done · {event.total_rounds} round{event.total_rounds !== 1 ? 's' : ''}
    </div>
  )
}

function ErrorBlock({ message }: { message: string }) {
  return (
    <div className="py-3 px-3 border border-[#27272a] rounded-md bg-[#18181b] my-2">
      <div className="text-[11px] font-mono text-[#fafafa] mb-1">✗ error</div>
      <div className="text-[12px] text-[#a1a1aa]">{message}</div>
    </div>
  )
}

function Dot() {
  return <span className="text-[#52525b]">·</span>
}
