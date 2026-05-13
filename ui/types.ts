export type Model = "gpt-5.4" | "gpt-5.4-mini" | "gpt-5.4-nano"

export const MODELS: Model[] = ["gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano"]

export interface AgentConfig {
  name: string
  role: string
  persona: string
  model: Model
}

export interface SessionConfig {
  topic: string
  agents: AgentConfig[]
  max_rounds: number
}

// ── Orchestra event types ────────────────────────────────────────────────────

export interface BaseEvent {
  type: string
  ts: string
  ui?: Record<string, string>
}

export interface SessionStartEvent extends BaseEvent {
  type: "session_start"
  topic: string
  agents: Array<{ name: string; role: string; model: string }>
  max_rounds: number
}

export interface FacilitatorFramingEvent extends BaseEvent {
  type: "facilitator_framing"
  definition: string
  questions: string[]
}

export interface RoundStartEvent extends BaseEvent {
  type: "round_start"
  round: number
}

export interface AgentThinkingEvent extends BaseEvent {
  type: "agent_thinking"
  agent: string
  role: string
}

export interface AgentResponseEvent extends BaseEvent {
  type: "agent_response"
  agent: string
  role: string
  content: string
  round: number
}

export interface RoundEndEvent extends BaseEvent {
  type: "round_end"
  round: number
}

export interface ReviewEvent extends BaseEvent {
  type: "review"
  decision: "continue" | "synthesize"
  reason: string
  round: number
}

export interface SynthesisOutput {
  executive_summary: string
  key_insights: string[]
  convergence_points: string[]
  divergence_points: string[]
  recommendations: string[]
  open_questions: string[]
}

export interface SynthesisEvent extends BaseEvent, SynthesisOutput {
  type: "synthesis"
}

export interface SessionEndEvent extends BaseEvent {
  type: "session_end"
  total_rounds: number
}

export interface ErrorEvent extends BaseEvent {
  type: "error"
  message: string
}

export type OrchestraEvent =
  | SessionStartEvent
  | FacilitatorFramingEvent
  | RoundStartEvent
  | AgentThinkingEvent
  | AgentResponseEvent
  | RoundEndEvent
  | ReviewEvent
  | SynthesisEvent
  | SessionEndEvent
  | ErrorEvent

// ── Derived session state ────────────────────────────────────────────────────

export interface AgentEntry {
  name: string
  role: string
  thinking: boolean
  content: string
}

export interface RoundData {
  num: number
  agents: AgentEntry[]
}

export interface SessionState {
  topic: string
  maxRounds: number
  status: "waiting" | "framing" | "running" | "reviewing" | "synthesizing" | "done" | "error"
  framing: { definition: string; questions: string[] } | null
  rounds: RoundData[]
  currentRound: number
  reviews: Array<{ decision: string; reason: string; round: number }>
  synthesis: SynthesisOutput | null
  error: string | null
}

// ── Colors ───────────────────────────────────────────────────────────────────

export const C = {
  bg:          "#0d1117",
  panel:       "#161b22",
  border:      "#30363d",
  text:        "#c9d1d9",
  muted:       "#8b949e",
  blue:        "#58a6ff",
  green:       "#3fb950",
  purple:      "#bc8cff",
  orange:      "#d29922",
  red:         "#f85149",
  cyan:        "#56d4dd",
  yellow:      "#e3b341",
} as const

export const AGENT_COLORS = [C.blue, C.green, C.purple, C.orange, C.cyan, C.yellow]
