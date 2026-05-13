import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useKeyboard } from "@opentui/react"
import type { TextareaRenderable } from "@opentui/core"
import { C, MODELS, type AgentConfig, type Model, type SessionConfig } from "../types"

const AGENT_COLORS = ["#58a6ff", "#3fb950", "#bc8cff", "#d29922", "#56d4dd", "#e3b341"]

type FocusField =
  | "topic" | "members" | "addBtn"
  | "name" | "role" | "persona" | "model" | "add" | "cancel"
  | "maxRounds" | "start"

interface Props {
  onStart: (config: SessionConfig) => void
}

export function SetupScreen({ onStart }: Props) {
  const [focus, setFocus]               = useState<FocusField>("topic")
  const [topic, setTopic]               = useState("")
  const [agents, setAgents]             = useState<AgentConfig[]>([])
  const [name, setName]                 = useState("")
  const [role, setRole]                 = useState("")
  const [persona, setPersona]           = useState("")
  const [modelIdx, setModelIdx]         = useState(0)
  const [maxRounds, setMaxRounds]       = useState(3)
  const [error, setError]               = useState("")
  const [selectedMember, setSelectedMember] = useState(0)
  const [editingIdx, setEditingIdx]     = useState(-1)
  const [formOpen, setFormOpen]         = useState(false)
  const [formKey, setFormKey]           = useState(0)

  const topicRef   = useRef<TextareaRenderable>(null)
  const personaRef = useRef<TextareaRenderable>(null)

  const model = MODELS[modelIdx]

  // Auto-grow: height tracks newlines in the text
  const topicHeight   = Math.max(1, topic.split("\n").length)
  const personaHeight = Math.max(1, persona.split("\n").length)

  const fieldOrder = useMemo((): FocusField[] => {
    const order: FocusField[] = ["topic"]
    if (agents.length > 0 && !formOpen) order.push("members")
    order.push("addBtn")
    if (formOpen) order.push("name", "role", "persona", "model", "add", "cancel")
    order.push("maxRounds", "start")
    return order
  }, [agents.length, formOpen])

  // Snap focus to a valid field when fieldOrder changes
  useEffect(() => {
    setFocus(f => fieldOrder.includes(f) ? f : fieldOrder[0])
  }, [fieldOrder]) // eslint-disable-line react-hooks/exhaustive-deps

  const nextFocus = useCallback(() => {
    setFocus((f: FocusField) => {
      const idx = fieldOrder.indexOf(f)
      return fieldOrder[(idx + 1) % fieldOrder.length]
    })
  }, [fieldOrder])

  const prevFocus = useCallback(() => {
    setFocus((f: FocusField) => {
      const idx = fieldOrder.indexOf(f)
      return fieldOrder[(idx - 1 + fieldOrder.length) % fieldOrder.length]
    })
  }, [fieldOrder])

  const openForm = useCallback((editIdx = -1) => {
    setEditingIdx(editIdx)
    setFormOpen(true)
    setFormKey(k => k + 1)
    setFocus("name")
  }, [])

  const cancelForm = useCallback((agentCount: number) => {
    setName("")
    setRole("")
    setPersona("")
    setModelIdx(0)
    setEditingIdx(-1)
    setFormOpen(false)
    if (personaRef.current) personaRef.current.setText("")
    setFocus(agentCount > 0 ? "members" : "addBtn")
  }, [])

  useEffect(() => {
    if (agents.length === 0 && focus === "members") setFocus("addBtn")
    else if (agents.length > 0) setSelectedMember(i => Math.min(i, agents.length - 1))
  }, [agents.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const addOrUpdateAgent = useCallback(() => {
    const currentName    = name.trim()
    const currentRole    = role.trim()
    const currentPersona = (personaRef.current?.plainText ?? persona).trim()

    if (!currentName || !currentRole || !currentPersona) {
      setError("name, role and persona are required")
      return
    }

    const agentData: AgentConfig = { name: currentName, role: currentRole, persona: currentPersona, model }

    let nextSelected = 0
    if (editingIdx >= 0) {
      setAgents(prev => prev.map((a, i) => i === editingIdx ? agentData : a))
      nextSelected = editingIdx
    } else {
      nextSelected = agents.length
      setAgents(prev => [...prev, agentData])
    }

    setName("")
    setRole("")
    setPersona("")
    setModelIdx(0)
    setEditingIdx(-1)
    setFormOpen(false)
    setError("")
    setSelectedMember(nextSelected)
    if (personaRef.current) personaRef.current.setText("")
    setFocus("members")
  }, [name, role, persona, model, editingIdx, agents.length])

  const startEditing = useCallback((idx: number) => {
    const a = agents[idx]
    setName(a.name)
    setRole(a.role)
    setPersona(a.persona)
    setModelIdx(MODELS.indexOf(a.model))
    setEditingIdx(idx)
    if (personaRef.current) personaRef.current.setText(a.persona)
    openForm(idx)
  }, [agents, openForm])

  const removeAgentAt = useCallback((idx: number, agentCount: number) => {
    setAgents(prev => prev.filter((_, i) => i !== idx))
    setSelectedMember(prev => Math.max(0, Math.min(prev, agentCount - 2)))
  }, [])

  const moveAgentUp = useCallback((idx: number) => {
    if (idx <= 0) return
    setAgents(prev => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
      return next
    })
    setSelectedMember(idx - 1)
  }, [])

  const moveAgentDown = useCallback((idx: number, agentCount: number) => {
    if (idx >= agentCount - 1) return
    setAgents(prev => {
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
      return next
    })
    setSelectedMember(idx + 1)
  }, [])

  const startSession = useCallback(() => {
    const currentTopic = (topicRef.current?.plainText ?? topic).trim()
    if (!currentTopic)       { setError("topic is required"); setFocus("topic"); return }
    if (agents.length === 0) { setError("add at least one participant"); setFocus("addBtn"); return }
    setError("")
    onStart({ topic: currentTopic, agents, max_rounds: maxRounds })
  }, [topic, agents, maxRounds, onStart])

  const isTextareaFocus = focus === "topic" || focus === "persona"

  useKeyboard((key) => {
    if (key.name === "tab" && !key.shift) { nextFocus(); return }
    if (key.name === "tab" && key.shift)  { prevFocus(); return }

    if (key.name === "escape" && formOpen) { cancelForm(agents.length); return }

    if (focus === "addBtn" && key.name === "return") { openForm(); return }

    if (focus === "members") {
      if (key.name === "up"   && !key.meta) { setSelectedMember(i => Math.max(0, i - 1)); return }
      if (key.name === "down" && !key.meta) { setSelectedMember(i => Math.min(agents.length - 1, i + 1)); return }
      if (key.ctrl && key.name === "d")     { removeAgentAt(selectedMember, agents.length); return }
      if (key.ctrl && key.name === "e")     { startEditing(selectedMember); return }
      if (key.meta && key.name === "up")    { moveAgentUp(selectedMember); return }
      if (key.meta && key.name === "down")  { moveAgentDown(selectedMember, agents.length); return }
    }

    if (focus === "model") {
      if (key.name === "right" || key.name === "l") setModelIdx(i => (i + 1) % MODELS.length)
      if (key.name === "left"  || key.name === "h") setModelIdx(i => (i - 1 + MODELS.length) % MODELS.length)
    }

    if (focus === "maxRounds") {
      if (key.name === "right" || key.name === "l") setMaxRounds(r => Math.min(5, r + 1))
      if (key.name === "left"  || key.name === "h") setMaxRounds(r => Math.max(1, r - 1))
    }

    if (key.name === "return") {
      if (focus === "add")    { addOrUpdateAgent();           return }
      if (focus === "cancel") { cancelForm(agents.length);    return }
      if (focus === "start")  { startSession();               return }
      if (!isTextareaFocus)   { nextFocus() }
    }
  })

  const membersBoxFocused = focus === "members" || focus === "addBtn" || formOpen

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

      {/* Topic — auto-growing textarea */}
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
        <textarea
          ref={topicRef}
          placeholder="Describe the topic you want to create this room for..."
          onContentChange={() => setTopic(topicRef.current?.plainText ?? "")}
          focused={focus === "topic"}
          width="100%"
          height={topicHeight}
          textColor={C.text}
          cursorColor={C.blue}
          backgroundColor={C.panel}
          focusedBackgroundColor={C.panel}
          wrapMode="word"
        />
      </box>

      {/* Members — unified box: list + add button + inline form */}
      <box
        style={{
          flexDirection: "column",
          borderStyle: membersBoxFocused ? "rounded" : "single",
          borderColor: membersBoxFocused ? C.blue : C.border,
          padding: 1,
          width: "100%",
        }}
        title=" Members "
      >
        {/* Agent rows */}
        {agents.map((a: AgentConfig, i: number) => {
          const isSel = focus === "members" && i === selectedMember
          return (
            <box key={i} style={{ flexDirection: "row", gap: 2 }}>
              <text fg={isSel ? C.blue : C.muted}>{isSel ? "▶" : " "}</text>
              <text fg={AGENT_COLORS[i % AGENT_COLORS.length]}>●</text>
              <text fg={isSel ? C.bg : C.text} bg={isSel ? C.blue : undefined}>{a.name}</text>
              <text fg={C.muted}>—</text>
              <text fg={C.muted}>{a.role.slice(0, 36)}{a.role.length > 36 ? "…" : ""}</text>
              <text fg={C.border}>[{a.model}]</text>
            </box>
          )
        })}

        {/* Member navigation hint */}
        {agents.length > 0 && focus === "members" && (
          <text fg={C.muted} style={{ marginTop: 1 }}>
            ↑↓ navigate  •  Ctrl+E edit  •  Ctrl+D remove  •  Alt+↑↓ reorder
          </text>
        )}

        {/* Separator before add button */}
        {agents.length > 0 && (
          <text fg={C.border} style={{ marginTop: 1 }}>{"─".repeat(120)}</text>
        )}

        {/* Add new member button (shown when form is closed) */}
        {!formOpen && (
          <box style={{ flexDirection: "row", gap: 1, marginTop: agents.length > 0 ? 0 : 0 }}>
            <text fg={focus === "addBtn" ? C.green : C.muted}>
              {focus === "addBtn" ? "▶ + Add new member" : "  + Add new member"}
            </text>
          </box>
        )}

        {/* Compact inline form */}
        {formOpen && (
          <box style={{ flexDirection: "column", gap: 1 }}>
            {/* Form label */}
            <text fg={C.muted}>
              {editingIdx >= 0
                ? `  ✎ editing ${agents[editingIdx]?.name ?? ""}`
                : "  + new member"}
            </text>

            {/* name + role */}
            <box style={{ flexDirection: "row", gap: 2, alignItems: "center" }}>
              <text fg={focus === "name" ? C.blue : C.muted}>name</text>
              <input
                placeholder="Agent Name"
                onInput={setName}
                focused={focus === "name"}
                value={name}
                width={24}
                textColor={C.text}
                cursorColor={C.blue}
                backgroundColor={C.panel}
                focusedBackgroundColor={C.panel}
              />
              <text fg={C.border}>│</text>
              <text fg={focus === "role" ? C.blue : C.muted}>role</text>
              <box style={{ flexGrow: 1 }}>
                <input
                  placeholder="Professional role..."
                  onInput={setRole}
                  focused={focus === "role"}
                  value={role}
                  width="100%"
                  textColor={C.text}
                  cursorColor={C.blue}
                  backgroundColor={C.panel}
                  focusedBackgroundColor={C.panel}
                />
              </box>
            </box>

            {/* persona */}
            <box style={{ flexDirection: "row", gap: 2, alignItems: "flex-start" }}>
              <text fg={focus === "persona" ? C.blue : C.muted}>persona</text>
              <box style={{ flexGrow: 1 }}>
                <textarea
                  key={`persona-${formKey}`}
                  ref={personaRef}
                  initialValue={persona}
                  placeholder="Perspective, expertise, approach…"
                  onContentChange={() => setPersona(personaRef.current?.plainText ?? "")}
                  focused={focus === "persona"}
                  textColor={C.text}
                  cursorColor={C.blue}
                  backgroundColor={C.panel}
                  focusedBackgroundColor={C.panel}
                  width="100%"
                  height={personaHeight}
                  wrapMode="word"
                />
              </box>
            </box>

            {/* model + add + cancel */}
            <box style={{ flexDirection: "row", gap: 2, alignItems: "center" }}>
              <text fg={focus === "model" ? C.text : C.muted}>model</text>
              {MODELS.map((m: Model) => (
                <text
                  key={m}
                  fg={model === m ? C.text : C.muted}
                  bg={model === m ? (focus === "model" ? C.blue : C.border) : undefined}
                  style={{ paddingLeft: 1, paddingRight: 1 }}
                >
                  {m}
                </text>
              ))}
              <box style={{ flexGrow: 1 }} />
              <text fg={focus === "add" ? C.green : C.muted}>
                {editingIdx >= 0 ? "✓ update" : "+ add"}
              </text>
              <text fg={C.muted}>  </text>
              <text fg={focus === "cancel" ? C.red : C.muted}>✕ cancel</text>
            </box>
          </box>
        )}
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
        <text fg={C.muted}>← →</text>

        <box style={{ flexGrow: 1 }} />

        <box
          style={{
            borderStyle: "rounded",
            borderColor: focus === "start" ? C.purple : C.border,
            paddingLeft: 3,
            paddingRight: 3,
          }}
        >
          <text fg={focus === "start" ? C.purple : C.muted}>▶ Start Discussion</text>
        </box>
      </box>

      {/* Error / hint */}
      {error ? (
        <text fg={C.red}>⚠ {error}</text>
      ) : (
        <text fg={C.muted}>
          Tab: move  •  Enter: open/confirm  •  Esc: close form  •  Ctrl+C: quit
        </text>
      )}
    </box>
  )
}
