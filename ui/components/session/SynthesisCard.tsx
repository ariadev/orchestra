import { C, type SynthesisOutput } from "../../types"
import { CopyButton } from "./primitives"

export function SynthesisCard({ synthesis, isFocused, isCopied }: {
  synthesis: SynthesisOutput
  isFocused: boolean
  isCopied: boolean
}) {
  return (
    <box
      id="synthesis"
      style={{ flexDirection: "column", borderStyle: "rounded", borderColor: isFocused ? C.cyan : C.purple, padding: 1, gap: 1, width: "100%" }}
      title={` ◈ synthesis — ${synthesis.output_type}${synthesis.model ? ` • ${synthesis.model}` : ""}${synthesis.tokens ? ` • ${synthesis.tokens} tokens` : ""} `}
    >
      <SynthesisSection label="summary" body={synthesis.summary} bodyColor={C.muted} />
      <SynthesisSection label="deliverable" body={synthesis.deliverable} bodyColor={C.text} />
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

function SynthesisSection({ label, body, bodyColor }: {
  label: string
  body: string
  bodyColor: string
}) {
  return (
    <box style={{ flexDirection: "column", gap: 0 }}>
      <text fg={C.purple}>{label}</text>
      <text fg={bodyColor}>{body}</text>
    </box>
  )
}

function BulletList({ label, items, color, bullet }: {
  label: string
  items: string[]
  color: string
  bullet: string
}) {
  return (
    <box style={{ flexDirection: "column", gap: 0 }}>
      <text fg={color}>{label}</text>
      {items.map((item, i) => (
        <box key={i} style={{ flexDirection: "row", gap: 1, paddingLeft: 2 }}>
          <text fg={color}>{bullet}</text>
          <text fg={C.text}>{item}</text>
        </box>
      ))}
    </box>
  )
}
