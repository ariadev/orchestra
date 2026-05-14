import { C } from "../../types"

export function CopyButton({ isFocused, isCopied }: {
  isFocused: boolean
  isCopied: boolean
}) {
  return (
    <box style={{ flexDirection: "row", justifyContent: "flex-end" }}>
      <text fg={isCopied ? C.green : isFocused ? C.text : C.border}>
        {isCopied ? "[ ✓ copied ]" : "[ copy ]"}
      </text>
    </box>
  )
}

export function ErrorCard({ message }: { message: string }) {
  return (
    <box style={{ borderStyle: "rounded", borderColor: C.red, padding: 1, flexDirection: "column" }}>
      <text fg={C.red}>⚠ Error</text>
      <text fg={C.text}>{message}</text>
    </box>
  )
}
