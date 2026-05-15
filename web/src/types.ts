export type ModelId = 'gpt-5.4' | 'gpt-5.4-mini' | 'gpt-5.4-nano'

export type OutputType =
  | 'general'
  | 'content'
  | 'technical_report'
  | 'product_spec'
  | 'strategy'
  | 'decision_brief'

export interface AgentConfig {
  id: string
  name: string
  role: string
  persona: string
  model: ModelId
}

export interface SessionConfig {
  topic: string
  agents: AgentConfig[]
  discussion_rounds: number
  output_type: OutputType
}

// ── Events ───────────────────────────────────────────────────────────────────

export interface SessionStartEvent {
  type: 'session_start'
  topic: string
  agents: Array<{ name: string; role: string; model: string }>
  discussion_rounds: number
  ts: string
}

export interface FacilitatorFramingEvent {
  type: 'facilitator_framing'
  definition: string
  questions: string[]
  output_type: string
  model: string
  tokens: number
  ts: string
}

export interface RoundStartEvent {
  type: 'round_start'
  round: number
  ts: string
}

export interface AgentThinkingEvent {
  type: 'agent_thinking'
  agent: string
  role: string
  ts: string
}

export interface AgentResponseEvent {
  type: 'agent_response'
  agent: string
  role: string
  content: string
  round: number
  model: string
  tokens: number
  ts: string
}

export interface RoundEndEvent {
  type: 'round_end'
  round: number
  ts: string
}

export interface RoundExtractionEvent {
  type: 'round_extraction'
  round: number
  summary: string
  decisions_added: string[]
  items_resolved: string[]
  items_added: string[]
  open_items: string[]
  ts: string
}

export interface ReviewEvent {
  type: 'review'
  decision: 'continue' | 'synthesize'
  reason: string
  round: number
  ts: string
}

export interface SynthesisEvent {
  type: 'synthesis'
  output_type: string
  deliverable: string
  summary: string
  key_decisions: string[]
  open_questions: string[]
  model: string
  tokens: number
  ts: string
}

export interface SessionEndEvent {
  type: 'session_end'
  total_rounds: number
  ts: string
}

export interface ErrorEvent {
  type: 'error'
  message: string
  ts: string
}

export type SessionEvent =
  | SessionStartEvent
  | FacilitatorFramingEvent
  | RoundStartEvent
  | AgentThinkingEvent
  | AgentResponseEvent
  | RoundEndEvent
  | RoundExtractionEvent
  | ReviewEvent
  | SynthesisEvent
  | SessionEndEvent
  | ErrorEvent

export type SessionStatus =
  | 'connecting'
  | 'framing'
  | 'running'
  | 'synthesizing'
  | 'done'
  | 'error'
