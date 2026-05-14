import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useKeyboard } from "@opentui/react"
import type { TextareaRenderable } from "@opentui/core"
import { C, MODELS, OUTPUT_MODES, MODE_LABELS, MODE_SUBTITLES, type AgentConfig, type Model, type OutputMode, type SessionConfig } from "../types"
import { generateAgentPersona, suggestAgents, type SuggestedAgent } from "../naming"

const AGENT_COLORS = ["#58a6ff", "#3fb950", "#bc8cff", "#d29922", "#56d4dd", "#e3b341"]
const GENERATING_PERSONA_TEXT = "AI generating persona for you..."

const ROUND_SUBTITLES: Record<number, string> = {
  1: "Single pass — fast, lightweight, best for simple or well-defined topics",
  2: "One follow-up — quick refinement after the initial exchange",
  3: "Standard depth — agents revisit and challenge each other twice",
  4: "Extended deliberation — good for ambiguous or high-stakes topics",
  5: "Maximum depth — most thorough, expect longer runtime and higher cost",
}

type SuggestionState = "idle" | "loading" | "ready" | "dismissed"

type FocusField =
  | "topic" | "members" | "addBtn"
  | "suggestAccept" | "suggestDecline"
  | "name" | "role" | "persona" | "model" | "add" | "cancel"
  | "outputMode" | "discussionRounds" | "start"

interface Props {
  onStart: (config: SessionConfig) => void
}

export function SetupScreen({ onStart }: Props) {
  const [focus, setFocus] = useState<FocusField>("topic")
  const [topic, setTopic] = useState("")
  const [agents, setAgents] = useState<AgentConfig[]>([])
  const [name, setName] = useState("")
  const [role, setRole] = useState("")
  const [persona, setPersona] = useState("")
  const [modelIdx, setModelIdx] = useState(0)
  const [outputModeIdx, setOutputModeIdx] = useState(OUTPUT_MODES.indexOf("general" as OutputMode))
  const [discussionRounds, setDiscussionRounds] = useState(3)
  const [error, setError] = useState("")
  const [selectedMember, setSelectedMember] = useState(0)
  const [editingIdx, setEditingIdx] = useState(-1)
  const [formOpen, setFormOpen] = useState(false)
  const [formKey, setFormKey] = useState(0)
  const [personaEditorKey, setPersonaEditorKey] = useState(0)
  const [isGeneratingPersona, setIsGeneratingPersona] = useState(false)
  const [suggestionState, setSuggestionState] = useState<SuggestionState>("idle")
  const [suggestedAgents, setSuggestedAgents] = useState<SuggestedAgent[]>([])

  const topicRef = useRef<TextareaRenderable>(null)
  const personaRef = useRef<TextareaRenderable>(null)
  const personaRequestIdRef = useRef(0)
  const suggestionRequestIdRef = useRef(0)

  const model = MODELS[modelIdx]
  const outputMode = OUTPUT_MODES[outputModeIdx]

  // Auto-grow: height tracks newlines in the text
  const topicHeight = Math.max(1, topic.split("\n").length)
  const personaHeight = Math.max(1, persona.split("\n").length)

  const fieldOrder = useMemo((): FocusField[] => {
    const order: FocusField[] = ["topic"]
    if (agents.length > 0 && !formOpen) order.push("members")
    if (suggestionState === "ready") order.push("suggestAccept", "suggestDecline")
    order.push("addBtn")
    if (formOpen) order.push("name", "role", "persona", "model", "add", "cancel")
    order.push("outputMode", "discussionRounds", "start")
    return order
  }, [agents.length, formOpen, suggestionState])

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

  const setPersonaValue = useCallback((value: string) => {
    setPersona(value.replace(/\r\n?/g, "\n"))
    setPersonaEditorKey(k => k + 1)
  }, [])

  const cancelPendingPersonaGeneration = useCallback(() => {
    personaRequestIdRef.current += 1
    setIsGeneratingPersona(false)
  }, [])

  const triggerAgentSuggestion = useCallback(async (topicText: string) => {
    const requestId = suggestionRequestIdRef.current + 1
    suggestionRequestIdRef.current = requestId
    setSuggestionState("loading")
    setError("")
    try {
      const suggestions = await suggestAgents(topicText)
      if (suggestionRequestIdRef.current !== requestId) return
      if (suggestions.length === 0) { setSuggestionState("dismissed"); return }
      setSuggestedAgents(suggestions)
      setSuggestionState("ready")
      setFocus("suggestAccept")
    } catch (e) {
      if (suggestionRequestIdRef.current !== requestId) return
      setSuggestionState("dismissed")
      setError(e instanceof Error ? e.message : "agent suggestion failed")
    }
  }, [])

  const acceptSuggestions = useCallback(() => {
    setAgents(suggestedAgents.map(a => ({ ...a, model: MODELS[0] })))
    setSuggestionState("dismissed")
    setFocus("members")
  }, [suggestedAgents])

  const declineSuggestions = useCallback(() => {
    setSuggestionState("dismissed")
    setFocus("addBtn")
  }, [])

  const openForm = useCallback((editIdx = -1) => {
    cancelPendingPersonaGeneration()
    setEditingIdx(editIdx)
    setFormOpen(true)
    setFormKey(k => k + 1)
    setFocus("name")
  }, [cancelPendingPersonaGeneration])

  const cancelForm = useCallback((agentCount: number) => {
    cancelPendingPersonaGeneration()
    setName("")
    setRole("")
    setPersonaValue("")
    setModelIdx(0)
    setEditingIdx(-1)
    setFormOpen(false)
    setFocus(agentCount > 0 ? "members" : "addBtn")
  }, [cancelPendingPersonaGeneration, setPersonaValue])

  useEffect(() => {
    if (agents.length === 0 && focus === "members") setFocus("addBtn")
    else if (agents.length > 0) setSelectedMember(i => Math.min(i, agents.length - 1))
  }, [agents.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const maybeGeneratePersona = useCallback(async () => {
    if (!formOpen || editingIdx >= 0 || isGeneratingPersona) return

    const currentTopic = (topicRef.current?.plainText ?? topic).trim()
    const currentRole = role.trim()
    const currentPersona = (personaRef.current?.plainText ?? persona).trim()

    if (!currentTopic || !currentRole || currentPersona) return

    const requestId = personaRequestIdRef.current + 1
    personaRequestIdRef.current = requestId
    setIsGeneratingPersona(true)
    setError("")
    setPersonaValue(GENERATING_PERSONA_TEXT)

    try {
      const generatedPersona = await generateAgentPersona(currentTopic, currentRole)
      if (personaRequestIdRef.current !== requestId) return
      setPersonaValue(generatedPersona)
    } finally {
      if (personaRequestIdRef.current === requestId) {
        setIsGeneratingPersona(false)
      }
    }
  }, [editingIdx, formOpen, isGeneratingPersona, persona, role, setPersonaValue, topic])

  const addOrUpdateAgent = useCallback(() => {
    if (isGeneratingPersona) {
      setError("wait for persona generation to finish")
      setFocus("persona")
      return
    }

    const currentName = name.trim()
    const currentRole = role.trim()
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

    cancelPendingPersonaGeneration()
    setName("")
    setRole("")
    setPersonaValue("")
    setModelIdx(0)
    setEditingIdx(-1)
    setFormOpen(false)
    setError("")
    setSelectedMember(nextSelected)
    setFocus("members")
  }, [name, role, persona, model, editingIdx, agents.length, isGeneratingPersona, cancelPendingPersonaGeneration, setPersonaValue])

  const startEditing = useCallback((idx: number) => {
    cancelPendingPersonaGeneration()
    const a = agents[idx]
    setName(a.name)
    setRole(a.role)
    setPersonaValue(a.persona)
    setModelIdx(MODELS.indexOf(a.model))
    setEditingIdx(idx)
    openForm(idx)
  }, [agents, cancelPendingPersonaGeneration, openForm, setPersonaValue])

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
    if (!currentTopic) { setError("topic is required"); setFocus("topic"); return }
    if (agents.length === 0) { setError("add at least one participant"); setFocus("addBtn"); return }
    setError("")
    onStart({ topic: currentTopic, agents, discussion_rounds: discussionRounds, output_type: outputMode })
  }, [topic, agents, discussionRounds, onStart])

  const isTextareaFocus = focus === "topic" || focus === "persona"

  useKeyboard((key) => {
    if (key.name === "tab" && !key.shift) {
      if (focus === "topic") {
        const currentTopic = (topicRef.current?.plainText ?? topic).trim()
        if (currentTopic && agents.length === 0 && suggestionState === "idle") {
          void triggerAgentSuggestion(currentTopic)
        }
        nextFocus()
        return
      }
      if (focus === "role") {
        setFocus("persona")
        void maybeGeneratePersona()
        return
      }
      nextFocus()
      return
    }
    if (key.name === "tab" && key.shift) { prevFocus(); return }

    if (key.name === "escape" && suggestionState === "ready") { declineSuggestions(); return }
    if (key.name === "escape" && formOpen) { cancelForm(agents.length); return }

    if (focus === "addBtn" && key.name === "return") { openForm(); return }

    if (focus === "members") {
      if (key.name === "up" && !key.meta) { setSelectedMember(i => Math.max(0, i - 1)); return }
      if (key.name === "down" && !key.meta) { setSelectedMember(i => Math.min(agents.length - 1, i + 1)); return }
      if (key.ctrl && key.name === "d") { removeAgentAt(selectedMember, agents.length); return }
      if (key.ctrl && key.name === "e") { startEditing(selectedMember); return }
      if (key.meta && key.name === "up") { moveAgentUp(selectedMember); return }
      if (key.meta && key.name === "down") { moveAgentDown(selectedMember, agents.length); return }
    }

    if (focus === "model") {
      if (key.name === "right" || key.name === "l") setModelIdx(i => (i + 1) % MODELS.length)
      if (key.name === "left" || key.name === "h") setModelIdx(i => (i - 1 + MODELS.length) % MODELS.length)
    }

    if (focus === "outputMode") {
      if (key.name === "right" || key.name === "l") setOutputModeIdx(i => (i + 1) % OUTPUT_MODES.length)
      if (key.name === "left" || key.name === "h") setOutputModeIdx(i => (i - 1 + OUTPUT_MODES.length) % OUTPUT_MODES.length)
    }

    if (focus === "discussionRounds") {
      if (key.name === "right" || key.name === "l") setDiscussionRounds(r => Math.min(5, r + 1))
      if (key.name === "left" || key.name === "h") setDiscussionRounds(r => Math.max(1, r - 1))
    }

    if (key.name === "return") {
      if (focus === "suggestAccept") { acceptSuggestions(); return }
      if (focus === "suggestDecline") { declineSuggestions(); return }
      if (focus === "role") {
        setFocus("persona")
        void maybeGeneratePersona()
        return
      }
      if (focus === "add") { addOrUpdateAgent(); return }
      if (focus === "cancel") { cancelForm(agents.length); return }
      if (focus === "start") { startSession(); return }
      if (!isTextareaFocus) { nextFocus() }
    }
  })

  const membersBoxFocused = focus === "members" || focus === "addBtn" || formOpen
    || focus === "suggestAccept" || focus === "suggestDecline"
  const settingsBoxFocused = focus === "outputMode" || focus === "discussionRounds"

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
        {/* Agent suggestion panel */}
        {suggestionState === "loading" && (
          <box style={{ flexDirection: "row", gap: 1, marginBottom: 1 }}>
            <text fg={C.purple}>✦</text>
            <text fg={C.muted}>AI is suggesting agents for your discussion…</text>
          </box>
        )}
        {suggestionState === "ready" && (
          <box style={{ flexDirection: "column", gap: 1, marginBottom: 1 }}>
            <text fg={C.purple}>✦ AI suggests these agents for your topic:</text>
            {suggestedAgents.map((a: SuggestedAgent, i: number) => (
              <box key={i} style={{ flexDirection: "column" }}>
                <box style={{ flexDirection: "row", gap: 2, paddingLeft: 2 }}>
                  <text fg={AGENT_COLORS[i % AGENT_COLORS.length]}>●</text>
                  <text fg={C.text}>{a.name}</text>
                  <text fg={C.muted}>—</text>
                  <text fg={C.muted}>{a.role}</text>
                </box>
                <text fg={C.muted} style={{ paddingLeft: 5 }}>
                  {a.persona.length > 100 ? a.persona.slice(0, 100) + "…" : a.persona}
                </text>
              </box>
            ))}
            <box style={{ flexDirection: "row", gap: 3, marginTop: 1, paddingLeft: 2 }}>
              <text fg={focus === "suggestAccept" ? C.green : C.muted}>
                {focus === "suggestAccept" ? "▶ ✓ Use these agents" : "  ✓ Use these agents"}
              </text>
              <text fg={focus === "suggestDecline" ? C.red : C.muted}>
                {focus === "suggestDecline" ? "▶ ✕ Create manually" : "  ✕ Create manually"}
              </text>
            </box>
            <text fg={C.muted} style={{ paddingLeft: 2 }}>Tab: navigate  •  Enter: select  •  Esc: dismiss</text>
          </box>
        )}
        {(suggestionState === "loading" || suggestionState === "ready") && agents.length === 0 && (
          <text fg={C.border}>{"─".repeat(120)}</text>
        )}

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
                  key={`persona-${formKey}-${personaEditorKey}`}
                  ref={personaRef}
                  initialValue={persona}
                  placeholder="Perspective, expertise, approach…"
                  onContentChange={() => {
                    if (!isGeneratingPersona) {
                      setPersona((personaRef.current?.plainText ?? "").replace(/\r\n?/g, "\n"))
                    }
                  }}
                  focused={focus === "persona" && !isGeneratingPersona}
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

      {/* Settings: Mode + Max Rounds */}
      <box
        style={{
          flexDirection: "column",
          borderStyle: settingsBoxFocused ? "rounded" : "single",
          borderColor: settingsBoxFocused ? C.blue : C.border,
          padding: 1,
          width: "100%",
          gap: 1,
        }}
        title=" Settings "
      >
        {/* Mode selector */}
        <box style={{ flexDirection: "row", gap: 2 }}>
          <box style={{ width: 18 }}>
            <text fg={focus === "outputMode" ? C.text : C.muted}>Mode</text>
          </box>
          <box style={{ flexDirection: "column", gap: 0 }}>
            <box style={{ flexDirection: "row", gap: 1, alignItems: "center" }}>
              <text fg={focus === "outputMode" ? C.blue : C.border}>‹</text>
              <text
                fg={focus === "outputMode" ? C.text : C.muted}
                bg={focus === "outputMode" ? C.panel : undefined}
                style={{ paddingLeft: 1, paddingRight: 1 }}
              >
                {MODE_LABELS[outputMode]}
              </text>
              <text fg={focus === "outputMode" ? C.blue : C.border}>›</text>
            </box>
            <text fg={C.muted}>{MODE_SUBTITLES[outputMode]}</text>
          </box>
        </box>

        {/* Discussion Rounds */}
        <box style={{ flexDirection: "row", gap: 2 }}>
          <box style={{ width: 18 }}>
            <text fg={focus === "discussionRounds" ? C.text : C.muted}>Discussion Rounds</text>
          </box>
          <box style={{ flexDirection: "column", gap: 0 }}>
            <box style={{ flexDirection: "row", gap: 1, alignItems: "center" }}>
              <text fg={focus === "discussionRounds" ? C.blue : C.border}>‹</text>
              <text
                fg={focus === "discussionRounds" ? C.text : C.muted}
                bg={focus === "discussionRounds" ? C.panel : undefined}
                style={{ paddingLeft: 1, paddingRight: 1 }}
              >
                {discussionRounds}
              </text>
              <text fg={focus === "discussionRounds" ? C.blue : C.border}>›</text>
            </box>
            <text fg={C.muted}>{ROUND_SUBTITLES[discussionRounds]}</text>
          </box>
        </box>
      </box>

      {/* Start */}
      <box style={{ flexDirection: "row", justifyContent: "flex-end" }}>
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
