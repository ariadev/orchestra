import { useEffect, useReducer, useRef } from "react"
import { useKeyboard } from "@opentui/react"
import path from "path"
import {
  C, AGENT_COLORS,
  type AgentEntry, type OrchestraEvent, type RoundData,
  type SessionConfig, type SessionState, type SynthesisOutput,
} from "../types"

// ── Paths ─────────────────────────────────────────────────────────────────────

const ORCH_DIR = path.resolve(import.meta.dir, "../..")
const PYTHON   = path.join(ORCH_DIR, ".venv", "bin", "python3")
const MAIN_PY  = path.join(ORCH_DIR, "main.py")

// ── State types ───────────────────────────────────────────────────────────────

type Status = "waiting" | "framing" | "running" | "reviewing" | "synthesizing" | "done" | "error"

type Action =
  | { type: "FRAMING";        definition: string; questions: string[] }
  | { type: "ROUND_START";    round: number }
  | { type: "AGENT_THINKING"; name: string; role: string }
  | { type: "AGENT_RESPONSE"; name: string; content: string }
  | { type: "REVIEW";         decision: string; reason: string; round: number }
  | { type: "SYNTHESIS";      output: SynthesisOutput }
  | { type: "DONE";           totalRounds: number }
  | { type: "ERROR";          message: string }

// ── Reducer ───────────────────────────────────────────────────────────────────

function reducer(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case "FRAMING":
      return { ...state, status: "framing", framing: { definition: action.definition, questions: action.questions } }

    case "ROUND_START":
      return {
        ...state,
        status: "running",
        currentRound: action.round,
        rounds: [...state.rounds, { num: action.round, agents: [] }],
      }

    case "AGENT_THINKING": {
      const rounds = [...state.rounds]
      const last = { ...rounds[rounds.length - 1] }
      last.agents = [...last.agents, { name: action.name, role: action.role, thinking: true, content: "" }]
      rounds[rounds.length - 1] = last
      return { ...state, rounds }
    }

    case "AGENT_RESPONSE": {
      const rounds = [...state.rounds]
      const last = { ...rounds[rounds.length - 1] }
      last.agents = last.agents.map((a: AgentEntry) =>
        a.name === action.name ? { ...a, thinking: false, content: action.content } : a
      )
      rounds[rounds.length - 1] = last
      return { ...state, rounds }
    }

    case "REVIEW":
      return {
        ...state,
        status: "reviewing",
        reviews: [...state.reviews, { decision: action.decision, reason: action.reason, round: action.round }],
      }

    case "SYNTHESIS":
      return { ...state, status: "synthesizing", synthesis: action.output }

    case "DONE":
      return { ...state, status: "done" }

    case "ERROR":
      return { ...state, status: "error", error: action.message }

    default:
      return state
  }
}

const INITIAL: SessionState = {
  topic: "", maxRounds: 3, status: "waiting",
  framing: null, rounds: [], currentRound: 0,
  reviews: [], synthesis: null, error: null,
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  config: SessionConfig
  onBack: () => void
}

export function SessionScreen({ config, onBack }: Props) {
  const [state, dispatch] = useReducer(reducer, { ...INITIAL, topic: config.topic, maxRounds: config.max_rounds })
  const procRef = useRef<ReturnType<typeof Bun.spawn> | null>(null)

  // ── Subprocess ──────────────────────────────────────────────────────────────

  useEffect(() => {
    let mounted = true

    const proc = Bun.spawn([PYTHON, MAIN_PY], {
      stdin:  "pipe",
      stdout: "pipe",
      stderr: "pipe",
      cwd:    ORCH_DIR,
    })
    procRef.current = proc

    proc.stdin.write(new TextEncoder().encode(JSON.stringify(config)))
    proc.stdin.end()

    ;(async () => {
      const decoder = new TextDecoder()
      let buffer = ""
      try {
        const reader = proc.stdout.getReader()
        while (true) {
          const { done, value } = await reader.read()
          if (done || !mounted) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() ?? ""
          for (const line of lines) {
            const t = line.trim()
            if (!t) continue
            try { handleEvent(JSON.parse(t) as OrchestraEvent) } catch {}
          }
        }
        if (mounted) dispatch({ type: "DONE", totalRounds: 0 })
      } catch (err: unknown) {
        if (mounted) dispatch({ type: "ERROR", message: String(err) })
      }
    })()

    return () => {
      mounted = false
      try { proc.kill() } catch {}
    }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  function handleEvent(ev: OrchestraEvent) {
    switch (ev.type) {
      case "facilitator_framing":
        dispatch({ type: "FRAMING", definition: ev.definition, questions: ev.questions })
        break
      case "round_start":
        dispatch({ type: "ROUND_START", round: ev.round })
        break
      case "agent_thinking":
        dispatch({ type: "AGENT_THINKING", name: ev.agent, role: ev.role })
        break
      case "agent_response":
        dispatch({ type: "AGENT_RESPONSE", name: ev.agent, content: ev.content })
        break
      case "review":
        dispatch({ type: "REVIEW", decision: ev.decision, reason: ev.reason, round: ev.round })
        break
      case "synthesis":
        dispatch({ type: "SYNTHESIS", output: {
          executive_summary:  ev.executive_summary,
          key_insights:       ev.key_insights,
          convergence_points: ev.convergence_points,
          divergence_points:  ev.divergence_points,
          recommendations:    ev.recommendations,
          open_questions:     ev.open_questions,
        }})
        break
      case "session_end":
        dispatch({ type: "DONE", totalRounds: ev.total_rounds })
        break
      case "error":
        dispatch({ type: "ERROR", message: ev.message })
        break
    }
  }

  // ── Keyboard ─────────────────────────────────────────────────────────────────

  useKeyboard((key) => {
    if (key.name === "b" && state.status === "done") onBack()
    if (key.ctrl && key.name === "c") { try { procRef.current?.kill() } catch {}; onBack() }
  })

  // ── Status display ────────────────────────────────────────────────────────────

  const STATUS_COLOR: Record<Status, string> = {
    waiting:      C.muted,
    framing:      C.yellow,
    running:      C.blue,
    reviewing:    C.orange,
    synthesizing: C.purple,
    done:         C.green,
    error:        C.red,
  }

  const STATUS_LABEL: Record<Status, string> = {
    waiting:      "waiting...",
    framing:      "framing topic...",
    running:      `round ${state.currentRound} — deliberating`,
    reviewing:    "reviewing...",
    synthesizing: "synthesizing...",
    done:         `session complete • ${state.rounds.length} rounds • b to exit`,
    error:        "error",
  }

  const status = state.status as Status

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <box style={{ width: "100%", height: "100%", flexDirection: "column", backgroundColor: C.bg }}>

      {/* Header */}
      <box
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          backgroundColor: C.panel,
          borderStyle: "single",
          borderColor: C.border,
          paddingLeft: 2,
          paddingRight: 2,
          height: 3,
          alignItems: "center",
        }}
      >
        <box style={{ flexDirection: "row", gap: 2 }}>
          <text fg={C.purple}>◆ ORCHESTRA</text>
          <text fg={C.muted}>•</text>
          <text fg={C.text}>{config.topic.slice(0, 60)}{config.topic.length > 60 ? "…" : ""}</text>
        </box>
        <text fg={STATUS_COLOR[status]}>{STATUS_LABEL[status]}</text>
      </box>

      {/* Scrollable content */}
      <scrollbox style={{ flexGrow: 1, width: "100%", padding: 1, gap: 1, flexDirection: "column" }}>

        {state.framing && (
          <FramingCard definition={state.framing.definition} questions={state.framing.questions} />
        )}

        {state.rounds.map((round: RoundData) => (
          <box key={round.num} style={{ width: "100%" }}>
            <RoundCard
              round={round}
              review={state.reviews.find((r: { decision: string; reason: string; round: number }) => r.round === round.num) ?? null}
              agentConfigs={config.agents}
            />
          </box>
        ))}

        {state.synthesis && <SynthesisCard synthesis={state.synthesis} />}

        {state.error && (
          <box style={{ borderStyle: "rounded", borderColor: C.red, padding: 1, flexDirection: "column" }}>
            <text fg={C.red}>⚠ Error</text>
            <text fg={C.text}>{state.error}</text>
          </box>
        )}

      </scrollbox>
    </box>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FramingCard({ definition, questions }: { definition: string; questions: string[] }) {
  return (
    <box
      style={{ flexDirection: "column", borderStyle: "rounded", borderColor: C.yellow, padding: 1, gap: 1, width: "100%" }}
      title=" ◈ framing "
    >
      <text fg={C.text}>{definition}</text>
      <box style={{ flexDirection: "column", gap: 0 }}>
        <text fg={C.yellow}>key questions:</text>
        {questions.map((q: string, i: number) => (
          <box key={i} style={{ flexDirection: "row", gap: 1, paddingLeft: 2 }}>
            <text fg={C.yellow}>{i + 1}.</text>
            <text fg={C.text}>{q}</text>
          </box>
        ))}
      </box>
    </box>
  )
}

function RoundCard({
  round,
  review,
  agentConfigs,
}: {
  round: RoundData
  review: { decision: string; reason: string; round: number } | null
  agentConfigs: SessionConfig["agents"]
}) {
  return (
    <box style={{ flexDirection: "column", gap: 1, width: "100%" }}>
      <box style={{ flexDirection: "row", gap: 2 }}>
        <text fg={C.muted}>───────</text>
        <text fg={C.blue}>Round {round.num}</text>
        <text fg={C.muted}>───────────────────────────────────────────────────</text>
      </box>

      {round.agents.map((agent: AgentEntry, i: number) => (
        <box key={agent.name} style={{ width: "100%" }}>
          <AgentCard agent={agent} color={AGENT_COLORS[i % AGENT_COLORS.length]} />
        </box>
      ))}

      {review && <ReviewCard review={review} />}
    </box>
  )
}

function AgentCard({ agent, color }: { agent: AgentEntry; color: string }) {
  return (
    <box
      style={{ flexDirection: "column", borderStyle: "single", borderColor: color, padding: 1, width: "100%" }}
      title={` ${agent.name} — ${agent.role} `}
    >
      {agent.thinking ? (
        <box style={{ flexDirection: "row", gap: 1 }}>
          <text fg={color}>⏳</text>
          <text fg={C.muted}>Thinking...</text>
        </box>
      ) : (
        <text fg={C.text}>{agent.content}</text>
      )}
    </box>
  )
}

function ReviewCard({ review }: { review: { decision: string; reason: string; round: number } }) {
  const isContinue = review.decision === "continue"
  const color      = isContinue ? C.orange : C.green
  const icon       = isContinue ? "↻" : "✓"
  const label      = isContinue ? "continue" : "synthesize"

  return (
    <box
      style={{ flexDirection: "row", gap: 2, borderStyle: "single", borderColor: color, padding: 1, alignItems: "center" }}
      title=" ⊹ review "
    >
      <text fg={color}>{icon} {label}</text>
      <text fg={C.muted}>—</text>
      <text fg={C.muted}>{review.reason}</text>
    </box>
  )
}

function SynthesisCard({ synthesis }: { synthesis: SynthesisOutput }) {
  return (
    <box
      style={{ flexDirection: "column", borderStyle: "rounded", borderColor: C.purple, padding: 1, gap: 1, width: "100%" }}
      title=" ◈ synthesis "
    >
      <box style={{ flexDirection: "column", gap: 0 }}>
        <text fg={C.purple}>executive summary</text>
        <text fg={C.text}>{synthesis.executive_summary}</text>
      </box>
      {synthesis.key_insights.length > 0 && (
        <BulletList label="key insights" items={synthesis.key_insights} color={C.blue} bullet="▸" />
      )}
      {synthesis.convergence_points.length > 0 && (
        <BulletList label="convergence" items={synthesis.convergence_points} color={C.green} bullet="✓" />
      )}
      {synthesis.divergence_points.length > 0 && (
        <BulletList label="divergence" items={synthesis.divergence_points} color={C.orange} bullet="⟷" />
      )}
      {synthesis.recommendations.length > 0 && (
        <BulletList label="recommendations" items={synthesis.recommendations} color={C.cyan} bullet="→" />
      )}
      {synthesis.open_questions.length > 0 && (
        <BulletList label="open questions" items={synthesis.open_questions} color={C.muted} bullet="?" />
      )}
    </box>
  )
}

function BulletList({ label, items, color, bullet }: {
  label: string; items: string[]; color: string; bullet: string
}) {
  return (
    <box style={{ flexDirection: "column", gap: 0 }}>
      <text fg={color}>{label}</text>
      {items.map((item: string, i: number) => (
        <box key={i} style={{ flexDirection: "row", gap: 1, paddingLeft: 2 }}>
          <text fg={color}>{bullet}</text>
          <text fg={C.text}>{item}</text>
        </box>
      ))}
    </box>
  )
}
