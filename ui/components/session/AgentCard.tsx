import { C, type AgentEntry } from "../../types"
import { CopyButton } from "./primitives"

export function AgentCard({ id, agent, color, isFocused, isCopied }: {
  id: string
  agent: AgentEntry
  color: string
  isFocused: boolean
  isCopied: boolean
}) {
  return (
    <box
      id={id}
      style={{ flexDirection: "column", borderStyle: "single", borderColor: isFocused ? C.cyan : color, padding: 1, width: "100%" }}
      title={` ${agent.name} — ${agent.role}${agent.model ? ` • ${agent.model}` : ""}${agent.tokens ? ` • ${agent.tokens} tokens` : ""} `}
    >
      {agent.thinking
        ? <ThinkingIndicator color={color} />
        : <AgentBody content={agent.content} isFocused={isFocused} isCopied={isCopied} />}
    </box>
  )
}

function ThinkingIndicator({ color }: { color: string }) {
  return (
    <box style={{ flexDirection: "row", gap: 1 }}>
      <text fg={color}>⏳</text>
      <text fg={C.muted}>Thinking...</text>
    </box>
  )
}

function AgentBody({ content, isFocused, isCopied }: {
  content: string
  isFocused: boolean
  isCopied: boolean
}) {
  return (
    <>
      <text fg={C.text}>{content}</text>
      <CopyButton isFocused={isFocused} isCopied={isCopied} />
    </>
  )
}
