import { C } from "../../types"
import { CopyButton } from "./primitives"
import type { ReviewRecord } from "./types"

export function ReviewCard({ id, review, isFocused, isCopied }: {
  id: string
  review: ReviewRecord
  isFocused: boolean
  isCopied: boolean
}) {
  const isContinue = review.decision === "continue"
  const color = isContinue ? C.orange : C.green
  const icon  = isContinue ? "↻" : "✓"
  const label = isContinue ? "continue" : "synthesize"

  return (
    <box
      id={id}
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
