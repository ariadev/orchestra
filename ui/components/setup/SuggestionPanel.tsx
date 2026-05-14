import { C, AGENT_COLORS } from "../../types"
import type { SuggestedAgent } from "../../naming"
import { Pill } from "./primitives"
import type { FocusField } from "./types"

export function SuggestionLoadingRow() {
  return (
    <box style={{ flexDirection: "row", gap: 1, paddingBottom: 1 }}>
      <text fg={C.purple}>✦</text>
      <text fg={C.muted}>AI is suggesting agents for your discussion…</text>
    </box>
  )
}

export function SuggestionPanel({ agents, focus }: {
  agents: SuggestedAgent[]
  focus: FocusField
}) {
  return (
    <box style={{ flexDirection: "column", gap: 1, paddingBottom: 1, width: "100%" }}>
      <SuggestionHeader />
      {agents.map((a, i) => (
        <SuggestedAgentItem
          key={i}
          agent={a}
          color={AGENT_COLORS[i % AGENT_COLORS.length]}
        />
      ))}
      <SuggestionActions focus={focus} />
    </box>
  )
}

function SuggestionHeader() {
  return (
    <box style={{ flexDirection: "row", gap: 1 }}>
      <text fg={C.purple}>✦</text>
      <text fg={C.purple}>suggested agents</text>
      <text fg={C.muted}>— from your topic</text>
    </box>
  )
}

function SuggestedAgentItem({ agent, color }: {
  agent: SuggestedAgent
  color: string
}) {
  return (
    <box style={{ flexDirection: "column", width: "100%", paddingLeft: 2 }}>
      <box style={{ flexDirection: "row", gap: 1, width: "100%" }}>
        <text fg={color}>●</text>
        <text fg={C.text}>{agent.name}</text>
        <text fg={C.muted}>·</text>
        <text fg={C.muted}>{agent.role}</text>
      </box>
      <box style={{ width: "100%", paddingLeft: 3 }}>
        <text fg={C.muted} wrapMode="word">{agent.persona}</text>
      </box>
    </box>
  )
}

function SuggestionActions({ focus }: { focus: FocusField }) {
  return (
    <box style={{ flexDirection: "row", gap: 3, paddingLeft: 2, paddingTop: 1 }}>
      <Pill active={focus === "suggestAccept"}  activeColor={C.green} label="✓ use these agents" />
      <Pill active={focus === "suggestDecline"} activeColor={C.red}   label="✕ create manually" />
    </box>
  )
}
