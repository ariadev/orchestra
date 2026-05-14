import { C, MODE_LABELS, MODE_SUBTITLES, type OutputMode } from "../../types"
import { Card } from "./primitives"
import { type FocusField, ROUND_LABEL, ROUND_SUBTITLES, sectionOf } from "./types"

export function SettingsSection({ focus, outputMode, discussionRounds }: {
  focus: FocusField
  outputMode: OutputMode
  discussionRounds: number
}) {
  const active = sectionOf(focus) === "settings"
  return (
    <Card index="3" label="settings" accent={C.purple} active={active} done>
      <SettingsRow
        label="output mode"
        focused={focus === "outputMode"}
        value={MODE_LABELS[outputMode]}
        subtitle={MODE_SUBTITLES[outputMode]}
      />
      <SettingsRow
        label="rounds"
        focused={focus === "discussionRounds"}
        value={`${discussionRounds} · ${ROUND_LABEL[discussionRounds]}`}
        subtitle={ROUND_SUBTITLES[discussionRounds]}
      />
    </Card>
  )
}

function SettingsRow({ label, focused, value, subtitle }: {
  label: string
  focused: boolean
  value: string
  subtitle: string
}) {
  return (
    <box style={{ flexDirection: "row", gap: 2, alignItems: "flex-start", paddingTop: 0, paddingBottom: 0 }}>
      <box style={{ width: 14 }}>
        <text fg={focused ? C.text : C.muted}>{label}</text>
      </box>
      <box style={{ flexDirection: "column", gap: 0, flexGrow: 1 }}>
        <box style={{ flexDirection: "row", gap: 1, alignItems: "center" }}>
          <text fg={focused ? C.blue : C.border}>‹</text>
          <text
            fg={focused ? C.text : C.muted}
            bg={focused ? C.panel : undefined}
            style={{ paddingLeft: 1, paddingRight: 1 }}
          >
            {value}
          </text>
          <text fg={focused ? C.blue : C.border}>›</text>
          {focused && <text fg={C.border}>  ←→ adjust</text>}
        </box>
        <text fg={C.border}>{subtitle}</text>
      </box>
    </box>
  )
}
