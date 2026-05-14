import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useKeyboard } from "@opentui/react"
import type { TextareaRenderable } from "@opentui/core"
import {
  C, MODELS, OUTPUT_MODES, MODE_LABELS,
  type AgentConfig, type OutputMode, type SessionConfig,
} from "../types"
import { generateAgentPersona, suggestAgents, type SuggestedAgent } from "../naming"

import {
  type FocusField, type Section, type SuggestionState, type MemberFormState,
  sectionOf, GENERATING_PERSONA_TEXT,
} from "./setup/types"
import { ContentArea, HeaderBar, SectionStepper, FooterBar } from "./setup/Chrome"
import { TopicSection } from "./setup/TopicSection"
import { MembersSection } from "./setup/MembersSection"
import { SettingsSection } from "./setup/SettingsSection"
import { LaunchButton } from "./setup/LaunchButton"

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

  const topicRef               = useRef<TextareaRenderable>(null)
  const personaRef             = useRef<TextareaRenderable>(null)
  const personaRequestIdRef    = useRef(0)
  const suggestionRequestIdRef = useRef(0)

  const model      = MODELS[modelIdx]
  const outputMode = OUTPUT_MODES[outputModeIdx]
  const section    = sectionOf(focus)

  const fieldOrder = useMemo((): FocusField[] => {
    const order: FocusField[] = ["topic"]
    if (agents.length > 0 && !formOpen) order.push("members")
    if (suggestionState === "ready") order.push("suggestAccept", "suggestDecline")
    order.push("addBtn")
    if (formOpen) order.push("name", "role", "persona", "model", "add", "cancel")
    order.push("outputMode", "discussionRounds", "start")
    return order
  }, [agents.length, formOpen, suggestionState])

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
    const normalized = value.replace(/\r\n?/g, "\n")
    setPersona(normalized)
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

    const currentTopic   = (topicRef.current?.plainText ?? topic).trim()
    const currentRole    = role.trim()
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
  }, [topic, agents, discussionRounds, outputMode, onStart])

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
      if (key.name === "up"   && !key.meta) { setSelectedMember(i => Math.max(0, i - 1)); return }
      if (key.name === "down" && !key.meta) { setSelectedMember(i => Math.min(agents.length - 1, i + 1)); return }
      if (key.ctrl && key.name === "d") { removeAgentAt(selectedMember, agents.length); return }
      if (key.ctrl && key.name === "e") { startEditing(selectedMember); return }
      if (key.meta && key.name === "up")   { moveAgentUp(selectedMember); return }
      if (key.meta && key.name === "down") { moveAgentDown(selectedMember, agents.length); return }
    }

    if (focus === "model") {
      if (key.name === "right" || key.name === "l") setModelIdx(i => (i + 1) % MODELS.length)
      if (key.name === "left"  || key.name === "h") setModelIdx(i => (i - 1 + MODELS.length) % MODELS.length)
    }

    if (focus === "outputMode") {
      if (key.name === "right" || key.name === "l") setOutputModeIdx(i => (i + 1) % OUTPUT_MODES.length)
      if (key.name === "left"  || key.name === "h") setOutputModeIdx(i => (i - 1 + OUTPUT_MODES.length) % OUTPUT_MODES.length)
    }

    if (focus === "discussionRounds") {
      if (key.name === "right" || key.name === "l") setDiscussionRounds(r => Math.min(5, r + 1))
      if (key.name === "left"  || key.name === "h") setDiscussionRounds(r => Math.max(1, r - 1))
    }

    if (key.name === "return") {
      if (focus === "suggestAccept")  { acceptSuggestions(); return }
      if (focus === "suggestDecline") { declineSuggestions(); return }
      if (focus === "role") {
        setFocus("persona")
        void maybeGeneratePersona()
        return
      }
      if (focus === "add")    { addOrUpdateAgent(); return }
      if (focus === "cancel") { cancelForm(agents.length); return }
      if (focus === "start")  { startSession(); return }
      if (!isTextareaFocus)   { nextFocus() }
    }
  })

  // ── Derived state ────────────────────────────────────────────────────────────

  const topicReady   = topic.trim().length > 0 || (topicRef.current?.plainText?.trim().length ?? 0) > 0
  const membersReady = agents.length > 0
  const allReady     = topicReady && membersReady

  const completed: Record<Section, boolean> = {
    topic: topicReady, members: membersReady, settings: true, launch: allReady,
  }

  const form: MemberFormState = {
    open: formOpen,
    editingIdx, formKey, personaEditorKey, isGeneratingPersona,
    name, role, persona, model,
    personaRef,
    setName, setRole,
  }

  return (
    <box style={{ width: "100%", height: "100%", flexDirection: "column", backgroundColor: C.bg }}>
      <HeaderBar
        agentCount={agents.length}
        outputModeLabel={MODE_LABELS[outputMode]}
        rounds={discussionRounds}
        ready={allReady}
      />
      <SectionStepper section={section} completed={completed} />

      <ContentArea>
        <TopicSection focus={focus} topicRef={topicRef} done={topicReady} />
        <MembersSection
          focus={focus}
          agents={agents}
          selectedMember={selectedMember}
          suggestionState={suggestionState}
          suggestedAgents={suggestedAgents}
          form={form}
        />
        <SettingsSection
          focus={focus}
          outputMode={outputMode}
          discussionRounds={discussionRounds}
        />
        <LaunchButton focus={focus} ready={allReady} />
      </ContentArea>

      <FooterBar focus={focus} error={error} formOpen={formOpen} membersCount={agents.length} />
    </box>
  )
}
