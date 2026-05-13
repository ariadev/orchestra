import { useCallback, useState } from "react"
import { useKeyboard } from "@opentui/react"
import { C, MODELS, type AgentConfig, type Model, type SessionConfig } from "../types"

const AGENT_COLORS = ["#58a6ff", "#3fb950", "#bc8cff", "#d29922", "#56d4dd", "#e3b341"]

type FocusField = "topic" | "name" | "role" | "persona" | "model" | "add" | "maxRounds" | "start"
const FIELD_ORDER: FocusField[] = ["topic", "name", "role", "persona", "model", "add", "maxRounds", "start"]

interface Props {
  onStart: (config: SessionConfig) => void
}

export function SetupScreen({ onStart }: Props) {
  const [focus, setFocus]       = useState<FocusField>("topic")
  const [topic, setTopic]       = useState("")
  const [agents, setAgents]     = useState<AgentConfig[]>([])
  const [name, setName]         = useState("")
  const [role, setRole]         = useState("")
  const [persona, setPersona]   = useState("")
  const [modelIdx, setModelIdx] = useState(0)
  const [maxRounds, setMaxRounds] = useState(3)
  const [error, setError]       = useState("")

  const model = MODELS[modelIdx]

  const nextFocus = useCallback(() => {
    setFocus((f: FocusField) => FIELD_ORDER[(FIELD_ORDER.indexOf(f) + 1) % FIELD_ORDER.length])
  }, [])

  const prevFocus = useCallback(() => {
    setFocus((f: FocusField) => {
      const idx = FIELD_ORDER.indexOf(f)
      return FIELD_ORDER[(idx - 1 + FIELD_ORDER.length) % FIELD_ORDER.length]
    })
  }, [])

  const addAgent = useCallback(() => {
    if (!name.trim() || !role.trim() || !persona.trim()) {
      setError("name, role and persona is required")
      return
    }
    setAgents((prev: AgentConfig[]) => [
      ...prev,
      { name: name.trim(), role: role.trim(), persona: persona.trim(), model },
    ])
    setName("")
    setRole("")
    setPersona("")
    setModelIdx(0)
    setError("")
    setFocus("name")
  }, [name, role, persona, model])

  const removeLastAgent = useCallback(() => {
    setAgents((prev: AgentConfig[]) => prev.slice(0, -1))
  }, [])

  const startSession = useCallback(() => {
    if (!topic.trim())       { setError("topic is required"); setFocus("topic"); return }
    if (agents.length === 0) { setError("add at least one participant"); setFocus("name"); return }
    setError("")
    onStart({ topic: topic.trim(), agents, max_rounds: maxRounds })
  }, [topic, agents, maxRounds, onStart])

  useKeyboard((key) => {
    if (key.name === "tab" && !key.shift) { nextFocus(); return }
    if (key.name === "tab" && key.shift)  { prevFocus(); return }

    if (focus === "model") {
      if (key.name === "right" || key.name === "l")
        setModelIdx((i: number) => (i + 1) % MODELS.length)
      if (key.name === "left" || key.name === "h")
        setModelIdx((i: number) => (i - 1 + MODELS.length) % MODELS.length)
    }

    if (focus === "maxRounds") {
      if (key.name === "right" || key.name === "l") setMaxRounds((r: number) => Math.min(5, r + 1))
      if (key.name === "left"  || key.name === "h") setMaxRounds((r: number) => Math.max(1, r - 1))
    }

    if (key.name === "return") {
      if (focus === "add")   { addAgent();    return }
      if (focus === "start") { startSession(); return }
      nextFocus()
    }

    if (key.ctrl && key.name === "d" && focus === "name" && !name && agents.length > 0) {
      removeLastAgent()
    }
  })

  return (
    <box
      style={{
        width: "100%",
        height: "100%",
        flexDirection: "column",
        backgroundColor: C.bg,
        padding: 1,
        gap: 1,
      }}
    >
      {/* Header */}
      <box style={{ flexDirection: "row", gap: 2, paddingBottom: 1 }}>
        <text fg={C.purple}>◆ ORCHESTRA</text>
        <text fg={C.muted}>•</text>
        <text fg={C.text}>AI Discussion Room</text>
        <text fg={C.muted}>•</text>
        <text fg={C.muted}>Multi-Agent Deliberation</text>
      </box>

      {/* Topic */}
      <box
        style={{
          flexDirection: "column",
          borderStyle: focus === "topic" ? "rounded" : "single",
          borderColor: focus === "topic" ? C.blue : C.border,
          padding: 1,
          width: "100%",
        }}
        title=" Discussion Topic "
      >
        <input
          placeholder="Decscribe the topic you want to create this room for..."
          onInput={setTopic}
          focused={focus === "topic"}
          width="100%"
          textColor={C.text}
          cursorColor={C.blue}
          backgroundColor={C.panel}
          focusedBackgroundColor={C.panel}
          value={topic}
        />
      </box>

      {/* Agent list */}
      {agents.length > 0 && (
        <box
          style={{
            flexDirection: "column",
            borderStyle: "single",
            borderColor: C.border,
            padding: 1,
            width: "100%",
            gap: 0,
          }}
          title=" Members "
        >
          {agents.map((a: AgentConfig, i: number) => (
            <box key={i} style={{ flexDirection: "row", gap: 2 }}>
              <text fg={AGENT_COLORS[i % AGENT_COLORS.length]}>●</text>
              <text fg={C.text}>{a.name}</text>
              <text fg={C.muted}>—</text>
              <text fg={C.muted}>{a.role}</text>
              <text fg={C.border}>  [{a.model}]</text>
            </box>
          ))}
          <text fg={C.muted} style={{ marginTop: 1 }}>
            Ctrl+D to remove last member
          </text>
        </box>
      )}

      {/* Add agent form */}
      <box
        style={{
          flexDirection: "column",
          borderStyle: "single",
          borderColor: C.border,
          padding: 1,
          width: "100%",
          gap: 1,
        }}
        title=" Add New Member "
      >
        {/* Row 1: name + role */}
        <box style={{ flexDirection: "row", gap: 3 }}>
          <box style={{ flexDirection: "row", gap: 1, alignItems: "center" }}>
            <text fg={focus === "name" ? C.blue : C.muted}>Name</text>
            <box
              style={{
                borderStyle: focus === "name" ? "rounded" : "single",
                borderColor: focus === "name" ? C.blue : C.border,
                width: 22,
                height: 3,
              }}
            >
              <input
                placeholder="ex. UX Agent"
                onInput={setName}
                focused={focus === "name"}
                textColor={C.text}
                cursorColor={C.blue}
                backgroundColor={C.panel}
                focusedBackgroundColor={C.panel}
                value={name}
                width={20}
              />
            </box>
          </box>

          <box style={{ flexDirection: "row", gap: 1, alignItems: "center" }}>
            <text fg={focus === "role" ? C.blue : C.muted}>Role</text>
            <box
              style={{
                borderStyle: focus === "role" ? "rounded" : "single",
                borderColor: focus === "role" ? C.blue : C.border,
                width: 35,
                height: 3,
              }}
            >
              <input
                placeholder="Professional UX designer"
                onInput={setRole}
                focused={focus === "role"}
                textColor={C.text}
                cursorColor={C.blue}
                backgroundColor={C.panel}
                focusedBackgroundColor={C.panel}
                value={role}
                width={33}
              />
            </box>
          </box>
        </box>

        {/* Row 2: persona */}
        <box style={{ flexDirection: "row", gap: 1, alignItems: "center" }}>
          <text fg={focus === "persona" ? C.blue : C.muted}>Persona</text>
          <box
            style={{
              borderStyle: focus === "persona" ? "rounded" : "single",
              borderColor: focus === "persona" ? C.blue : C.border,
              flexGrow: 1,
              height: 3,
            }}
          >
            <input
              placeholder="Describe this participant’s perspective, expertise, and approach…"
              onInput={setPersona}
              focused={focus === "persona"}
              textColor={C.text}
              cursorColor={C.blue}
              backgroundColor={C.panel}
              focusedBackgroundColor={C.panel}
              value={persona}
              width="100%"
            />
          </box>
        </box>

        {/* Row 3: model selector + add button */}
        <box style={{ flexDirection: "row", gap: 3, alignItems: "center" }}>
          <text fg={focus === "model" ? C.blue : C.muted}>Model</text>
          <box style={{ flexDirection: "row", gap: 1 }}>
            {MODELS.map((m: Model) => (
              <text
                key={m}
                fg={model === m ? C.bg : C.muted}
                bg={model === m ? (focus === "model" ? C.blue : C.purple) : C.panel}
                style={{ paddingLeft: 1, paddingRight: 1 }}
              >
                {m}
              </text>
            ))}
          </box>
          <text fg={C.muted}>← → For switching</text>

          <box style={{ flexGrow: 1 }} />

          {/* Add button */}
          <box
            style={{
              borderStyle: "rounded",
              borderColor: C.green,
              backgroundColor: focus === "add" ? C.green : C.panel,
              paddingLeft: 2,
              paddingRight: 2,
            }}
          >
            <text fg={focus === "add" ? C.bg : C.green}>+ Add to members</text>
          </box>
        </box>
      </box>

      {/* Max rounds + start */}
      <box style={{ flexDirection: "row", gap: 4, alignItems: "center" }}>
        <text fg={focus === "maxRounds" ? C.blue : C.muted}>Max Rounds</text>
        <box style={{ flexDirection: "row", gap: 1 }}>
          {[1, 2, 3, 4, 5].map((n: number) => (
            <text
              key={n}
              fg={maxRounds === n ? C.bg : C.muted}
              bg={maxRounds === n ? (focus === "maxRounds" ? C.blue : C.border) : C.panel}
              style={{ paddingLeft: 1, paddingRight: 1 }}
            >
              {n}
            </text>
          ))}
        </box>
        <text fg={C.muted}>← → For switching</text>

        <box style={{ flexGrow: 1 }} />

        {/* Start button */}
        <box
          style={{
            borderStyle: "rounded",
            borderColor: C.purple,
            backgroundColor: focus === "start" ? C.purple : C.panel,
            paddingLeft: 3,
            paddingRight: 3,
          }}
        >
          <text fg={focus === "start" ? C.bg : C.purple}>▶ Start Discussion</text>
        </box>
      </box>

      {/* Error / hint */}
      {error ? (
        <text fg={C.red}>⚠ {error}</text>
      ) : (
        <text fg={C.muted}>
          Tab: Move section  •  Enter: Submit  •  ←→: Configuration  •  Ctrl+C: Quit
        </text>
      )}
    </box>
  )
}
