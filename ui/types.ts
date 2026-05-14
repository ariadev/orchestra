export type Model = "gpt-5.4" | "gpt-5.4-mini" | "gpt-5.4-nano"

export const MODELS: Model[] = ["gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano"]

export type OutputMode = "content" | "technical_report" | "product_spec" | "strategy" | "decision_brief" | "general"

export const OUTPUT_MODES: OutputMode[] = [
  "content", "technical_report", "product_spec", "strategy", "decision_brief", "general",
]

export const MODE_LABELS: Record<OutputMode, string> = {
  content:          "content",
  technical_report: "tech report",
  product_spec:     "product spec",
  strategy:         "strategy",
  decision_brief:   "decision",
  general:          "general",
}

export const MODE_SUBTITLES: Record<OutputMode, string> = {
  content:          "The output will be the finished piece — article, ad copy, script, email, or social post",
  technical_report: "The output will be a technical document — ADR, design doc, system design, or eng spec",
  product_spec:     "The output will be a product spec — PRD, feature brief, UX spec, or user-story map",
  strategy:         "The output will be a strategic plan — marketing, SEO, go-to-market, or campaign",
  decision_brief:   "The output will be a decision memo with recommendation, rationale, and next steps",
  general:          "The output will be a structured synthesis of insights, agreements, and recommendations",
}

export interface AgentConfig {
  name: string
  role: string
  persona: string
  model: Model
}

export interface SessionConfig {
  topic: string
  agents: AgentConfig[]
  discussion_rounds: number
  output_type: OutputMode
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
  discussion_rounds: number
}

export interface FacilitatorFramingEvent extends BaseEvent {
  type: "facilitator_framing"
  definition: string
  questions: string[]
  model?: string
  tokens?: number
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
  model?: string
  tokens?: number
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
  output_type: string
  deliverable: string
  summary: string
  key_decisions: string[]
  open_questions: string[]
  model?: string
  tokens?: number
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
  model?: string
  tokens?: number
}

export interface RoundData {
  num: number
  agents: AgentEntry[]
}

export interface SessionState {
  topic: string
  discussionRounds: number
  status: "waiting" | "framing" | "running" | "reviewing" | "synthesizing" | "done" | "error"
  framing: { definition: string; questions: string[]; model?: string; tokens?: number } | null
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
