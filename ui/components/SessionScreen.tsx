import { useEffect, useMemo, useReducer, useRef, useState } from "react"
import { useKeyboard } from "@opentui/react"
import path from "path"
import {
  C, AGENT_COLORS,
  type AgentEntry, type OrchestraEvent, type RoundData,
  type SessionConfig, type SessionState, type SynthesisOutput,
} from "../types"
import { generateKey, saveSession } from "../storage"
import { generateSessionName } from "../naming"

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
  topic: "", discussionRounds: 3, status: "waiting",
  framing: null, rounds: [], currentRound: 0,
  reviews: [], synthesis: null, error: null,
}

// ── Clipboard ─────────────────────────────────────────────────────────────────

function writeClipboard(text: string) {
  const encoded = Buffer.from(text).toString("base64")
  process.stdout.write(`\x1b]52;c;${encoded}\x07`)
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  config: SessionConfig
  onBack: () => void
  initialState?: SessionState
  sessionMeta?: { key: string; name: string }
}

export function SessionScreen({ config, onBack, initialState, sessionMeta }: Props) {
  const isViewer = !!initialState

  const [state, dispatch] = useReducer(
    reducer,
    initialState ?? { ...INITIAL, topic: config.topic, discussionRounds: config.discussion_rounds },
  )
  const procRef    = useRef<ReturnType<typeof Bun.spawn> | null>(null)
  const hasSaved   = useRef(false)
  const sessionKey = useRef(sessionMeta?.key ?? generateKey())

  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">(
    sessionMeta ? "saved" : "idle"
  )
  const [savedName, setSavedName]       = useState<string>(sessionMeta?.name ?? "")
  const [focusedCardId, setFocusedCardId] = useState<string | null>(null)
  const [copiedCardId, setCopiedCardId]   = useState<string | null>(null)

  // ── Flat ordered list of copyable card IDs ────────────────────────────────────

  const cardIds = useMemo(() => {
    const ids: string[] = []
    if (state.framing) ids.push("framing")
    for (const round of state.rounds) {
      round.agents.forEach((agent, i) => {
        if (!agent.thinking) ids.push(`agent-${round.num}-${i}`)
      })
      if (state.reviews.some(r => r.round === round.num)) ids.push(`review-${round.num}`)
    }
    if (state.synthesis) ids.push("synthesis")
    return ids
  }, [state.framing, state.rounds, state.reviews, state.synthesis])

  // ── Subprocess (live mode only) ──────────────────────────────────────────────

  useEffect(() => {
    if (isViewer) return

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
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-save on completion (live mode only) ─────────────────────────────────

  useEffect(() => {
    if (isViewer || state.status !== "done" || hasSaved.current) return
    hasSaved.current = true
    setSaveState("saving")

    ;(async () => {
      const name = await generateSessionName(config.topic)
      setSavedName(name)
      await saveSession({
        key:    sessionKey.current,
        name,
        date:   new Date().toISOString(),
        config,
        state,
      })
      setSaveState("saved")
    })()
  }, [state.status]) // eslint-disable-line react-hooks/exhaustive-deps

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
          output_type:    ev.output_type,
          deliverable:    ev.deliverable,
          summary:        ev.summary,
          key_decisions:  ev.key_decisions,
          open_questions: ev.open_questions,
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

  // ── Copy helpers ──────────────────────────────────────────────────────────────

  function getCardContent(cardId: string): string {
    if (cardId === "framing" && state.framing) {
      return [state.framing.definition, ...state.framing.questions.map((q, i) => `${i + 1}. ${q}`)].join("\n")
    }
    if (cardId.startsWith("agent-")) {
      const [, roundStr, idxStr] = cardId.split("-")
      const round = state.rounds.find(r => r.num === parseInt(roundStr))
      const agent = round?.agents[parseInt(idxStr)]
      return agent?.content ?? ""
    }
    if (cardId.startsWith("review-")) {
      const roundNum = parseInt(cardId.split("-")[1])
      const review = state.reviews.find(r => r.round === roundNum)
      return review?.reason ?? ""
    }
    if (cardId === "synthesis" && state.synthesis) {
      const s = state.synthesis
      const parts = [`Summary:\n${s.summary}`, `Deliverable:\n${s.deliverable}`]
      if (s.key_decisions.length) parts.push(`Key decisions:\n${s.key_decisions.map(d => `→ ${d}`).join("\n")}`)
      if (s.open_questions.length) parts.push(`Open questions:\n${s.open_questions.map(q => `? ${q}`).join("\n")}`)
      return parts.join("\n\n")
    }
    return ""
  }

  function triggerCopy(cardId: string) {
    const content = getCardContent(cardId)
    if (!content) return
    writeClipboard(content)
    setCopiedCardId(cardId)
    setTimeout(() => setCopiedCardId(c => c === cardId ? null : c), 1500)
  }

  // ── Keyboard ──────────────────────────────────────────────────────────────────

  useKeyboard((key) => {
    if (key.name === "b" && (state.status === "done" || isViewer)) onBack()
    if (key.ctrl && key.name === "c") { try { procRef.current?.kill() } catch {}; onBack() }

    if (key.name === "tab" && !key.shift) {
      setFocusedCardId(curr => {
        if (!cardIds.length) return null
        const idx = curr !== null ? cardIds.indexOf(curr) : -1
        return cardIds[(idx + 1) % cardIds.length]
      })
    }
    if (key.name === "tab" && key.shift) {
      setFocusedCardId(curr => {
        if (!cardIds.length) return null
        const idx = curr !== null ? cardIds.indexOf(curr) : 0
        return cardIds[(idx - 1 + cardIds.length) % cardIds.length]
      })
    }
    if ((key.name === "y" || key.name === "return") && focusedCardId) {
      triggerCopy(focusedCardId)
    }
    if (key.name === "escape") {
      setFocusedCardId(null)
    }
  })

  // ── Status display ─────────────────────────────────────────────────────────────

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
    done:         `complete • ${state.rounds.length} rounds • b: exit • Tab: copy`,
    error:        "error",
  }

  const status      = state.status as Status
  const statusLabel = focusedCardId ? "Tab: next  •  y: copy  •  Esc: unfocus" : STATUS_LABEL[status]
  const statusColor = focusedCardId ? C.cyan : STATUS_COLOR[status]

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
          <text fg={C.text}>{config.topic.slice(0, 50)}{config.topic.length > 50 ? "…" : ""}</text>
          {saveState === "saving" && <text fg={C.muted}>• saving…</text>}
          {saveState === "saved" && (
            <>
              <text fg={C.muted}>•</text>
              <text fg={C.green}>{savedName}</text>
              <text fg={C.border}>[{sessionKey.current}]</text>
            </>
          )}
        </box>
        <text fg={statusColor}>{statusLabel}</text>
      </box>

      {/* Scrollable content */}
      <scrollbox style={{ flexGrow: 1, width: "100%" }}>
        <box style={{ width: "100%", flexDirection: "column", padding: 1, gap: 1 }}>

          {state.framing && (
            <FramingCard
              definition={state.framing.definition}
              questions={state.framing.questions}
              isFocused={focusedCardId === "framing"}
              isCopied={copiedCardId === "framing"}
            />
          )}

          {state.rounds.map((round: RoundData) => (
            <box key={round.num} style={{ width: "100%" }}>
              <RoundCard
                round={round}
                review={state.reviews.find((r: { decision: string; reason: string; round: number }) => r.round === round.num) ?? null}
                agentConfigs={config.agents}
                focusedCardId={focusedCardId}
                copiedCardId={copiedCardId}
              />
            </box>
          ))}

          {state.synthesis && (
            <SynthesisCard
              synthesis={state.synthesis}
              isFocused={focusedCardId === "synthesis"}
              isCopied={copiedCardId === "synthesis"}
            />
          )}

          {state.error && (
            <box style={{ borderStyle: "rounded", borderColor: C.red, padding: 1, flexDirection: "column" }}>
              <text fg={C.red}>⚠ Error</text>
              <text fg={C.text}>{state.error}</text>
            </box>
          )}

        </box>
      </scrollbox>
    </box>
  )
}

// ── Copy button ───────────────────────────────────────────────────────────────

function CopyButton({ isFocused, isCopied }: { isFocused: boolean; isCopied: boolean }) {
  return (
    <box style={{ flexDirection: "row", justifyContent: "flex-end" }}>
      <text fg={isCopied ? C.green : isFocused ? C.text : C.border}>
        {isCopied ? "[ ✓ copied ]" : "[ copy ]"}
      </text>
    </box>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FramingCard({ definition, questions, isFocused, isCopied }: {
  definition: string
  questions: string[]
  isFocused: boolean
  isCopied: boolean
}) {
  return (
    <box
      style={{ flexDirection: "column", borderStyle: "rounded", borderColor: isFocused ? C.cyan : C.yellow, padding: 1, gap: 1, width: "100%" }}
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
      <CopyButton isFocused={isFocused} isCopied={isCopied} />
    </box>
  )
}

function RoundCard({
  round,
  review,
  agentConfigs,
  focusedCardId,
  copiedCardId,
}: {
  round: RoundData
  review: { decision: string; reason: string; round: number } | null
  agentConfigs: SessionConfig["agents"]
  focusedCardId: string | null
  copiedCardId: string | null
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
          <AgentCard
            agent={agent}
            color={AGENT_COLORS[i % AGENT_COLORS.length]}
            isFocused={focusedCardId === `agent-${round.num}-${i}`}
            isCopied={copiedCardId === `agent-${round.num}-${i}`}
          />
        </box>
      ))}

      {review && (
        <ReviewCard
          review={review}
          isFocused={focusedCardId === `review-${round.num}`}
          isCopied={copiedCardId === `review-${round.num}`}
        />
      )}
    </box>
  )
}

function AgentCard({ agent, color, isFocused, isCopied }: {
  agent: AgentEntry
  color: string
  isFocused: boolean
  isCopied: boolean
}) {
  return (
    <box
      style={{ flexDirection: "column", borderStyle: "single", borderColor: isFocused ? C.cyan : color, padding: 1, width: "100%" }}
      title={` ${agent.name} — ${agent.role} `}
    >
      {agent.thinking ? (
        <box style={{ flexDirection: "row", gap: 1 }}>
          <text fg={color}>⏳</text>
          <text fg={C.muted}>Thinking...</text>
        </box>
      ) : (
        <>
          <text fg={C.text}>{agent.content}</text>
          <CopyButton isFocused={isFocused} isCopied={isCopied} />
        </>
      )}
    </box>
  )
}

function ReviewCard({ review, isFocused, isCopied }: {
  review: { decision: string; reason: string; round: number }
  isFocused: boolean
  isCopied: boolean
}) {
  const isContinue = review.decision === "continue"
  const color      = isContinue ? C.orange : C.green
  const icon       = isContinue ? "↻" : "✓"
  const label      = isContinue ? "continue" : "synthesize"

  return (
    <box
      style={{ flexDirection: "column", borderStyle: "single", borderColor: isFocused ? C.cyan : color, padding: 1 }}
      title=" ⊹ review "
    >
      <box style={{ flexDirection: "row", gap: 2, alignItems: "center" }}>
        <text fg={color}>{icon} {label}</text>
        <text fg={C.muted}>—</text>
        <text fg={C.muted}>{review.reason}</text>
      </box>
      <CopyButton isFocused={isFocused} isCopied={isCopied} />
    </box>
  )
}

function SynthesisCard({ synthesis, isFocused, isCopied }: {
  synthesis: SynthesisOutput
  isFocused: boolean
  isCopied: boolean
}) {
  return (
    <box
      style={{ flexDirection: "column", borderStyle: "rounded", borderColor: isFocused ? C.cyan : C.purple, padding: 1, gap: 1, width: "100%" }}
      title={` ◈ synthesis — ${synthesis.output_type} `}
    >
      <box style={{ flexDirection: "column", gap: 0 }}>
        <text fg={C.purple}>summary</text>
        <text fg={C.muted}>{synthesis.summary}</text>
      </box>
      <box style={{ flexDirection: "column", gap: 0 }}>
        <text fg={C.purple}>deliverable</text>
        <text fg={C.text}>{synthesis.deliverable}</text>
      </box>
      {synthesis.key_decisions.length > 0 && (
        <BulletList label="key decisions" items={synthesis.key_decisions} color={C.cyan} bullet="→" />
      )}
      {synthesis.open_questions.length > 0 && (
        <BulletList label="open questions" items={synthesis.open_questions} color={C.muted} bullet="?" />
      )}
      <CopyButton isFocused={isFocused} isCopied={isCopied} />
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
