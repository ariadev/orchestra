import { C } from "../../types"
import type { FocusField } from "./types"

export function LaunchButton({ focus, ready }: { focus: FocusField; ready: boolean }) {
  const focused     = focus === "start"
  const accent      = ready ? C.purple : C.red
  const borderColor = focused ? accent : C.border
  const arrowFg     = focused ? accent : C.muted
  const labelFg     = focused ? C.text  : C.muted

  return (
    <box style={{ flexDirection: "row", justifyContent: "flex-end", paddingTop: 0 }}>
      <box
        style={{
          borderStyle: "rounded",
          borderColor,
          paddingLeft: 3,
          paddingRight: 3,
          flexDirection: "row",
          gap: 1,
        }}
      >
        <text fg={arrowFg}>▶</text>
        <text fg={labelFg}>start discussion</text>
        {focused && ready && <text fg={C.border}>(Enter)</text>}
      </box>
    </box>
  )
}
