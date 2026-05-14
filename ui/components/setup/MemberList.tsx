import { C, AGENT_COLORS, type AgentConfig } from "../../types"
import { ModelChip } from "./primitives"
import type { FocusField } from "./types"

export function MemberList({ agents, focus, selectedMember }: {
  agents: AgentConfig[]
  focus: FocusField
  selectedMember: number
}) {
  return (
    <box style={{ flexDirection: "column", width: "100%" }}>
      {agents.map((a, i) => (
        <MemberListItem
          key={i}
          agent={a}
          index={i}
          selected={focus === "members" && i === selectedMember}
          color={AGENT_COLORS[i % AGENT_COLORS.length]}
        />
      ))}
    </box>
  )
}

function MemberListItem({ agent, index, selected, color }: {
  agent: AgentConfig
  index: number
  selected: boolean
  color: string
}) {
  const role = agent.role.length > 38 ? agent.role.slice(0, 37) + "…" : agent.role
  const idx  = String(index + 1).padStart(2, " ")
  return (
    <box style={{ flexDirection: "row", gap: 1, alignItems: "center", width: "100%" }}>
      <text fg={selected ? C.blue : C.border}>{selected ? "▶" : " "}</text>
      <text fg={selected ? C.blue : C.muted}>{idx}</text>
      <text fg={color}>●</text>
      <box style={{ width: 18 }}>
        <text fg={C.text}>{agent.name}</text>
      </box>
      <text fg={C.border}>·</text>
      <box style={{ flexGrow: 1 }}>
        <text fg={C.muted}>{role}</text>
      </box>
      <ModelChip model={agent.model} dim />
    </box>
  )
}

export function EmptyMembersHint() {
  return (
    <text fg={C.border}>
      no participants yet — add one below, or press Tab on your topic for AI suggestions
    </text>
  )
}

export function MembersNavHint() {
  return (
    <text fg={C.border} style={{ paddingTop: 1 }}>
      ↑↓ navigate · Ctrl+E edit · Ctrl+D remove · Alt+↑↓ reorder
    </text>
  )
}
