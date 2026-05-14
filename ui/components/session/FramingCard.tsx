import { C } from "../../types"
import { CopyButton } from "./primitives"

export function FramingCard({ definition, questions, model, tokens, isFocused, isCopied }: {
  definition: string
  questions: string[]
  model?: string
  tokens?: number
  isFocused: boolean
  isCopied: boolean
}) {
  return (
    <box
      id="framing"
      style={{ flexDirection: "column", borderStyle: "rounded", borderColor: isFocused ? C.cyan : C.yellow, padding: 1, gap: 1, width: "100%" }}
      title={` ◈ framing${model ? ` — ${model}` : ""}${tokens ? ` • ${tokens} tokens` : ""} `}
    >
      <text fg={C.text}>{definition}</text>
      <QuestionList questions={questions} />
      <CopyButton isFocused={isFocused} isCopied={isCopied} />
    </box>
  )
}

function QuestionList({ questions }: { questions: string[] }) {
  return (
    <box style={{ flexDirection: "column", gap: 0 }}>
      <text fg={C.yellow}>key questions:</text>
      {questions.map((q, i) => (
        <box key={i} style={{ flexDirection: "row", gap: 1, paddingLeft: 2 }}>
          <text fg={C.yellow}>{i + 1}.</text>
          <text fg={C.text}>{q}</text>
        </box>
      ))}
    </box>
  )
}
