import type { ReactNode } from "react"
import { C, type Model } from "../../types"

export function Card({ index, label, accent, active, done, meta, children }: {
  index: string
  label: string
  accent: string
  active: boolean
  done: boolean
  meta?: string
  children: ReactNode
}) {
  void done
  const borderColor = active ? accent : C.border
  const title       = ` ${index} · ${label}${meta ? ` — ${meta}` : ""} `
  return (
    <box
      style={{
        flexDirection: "column",
        borderStyle: active ? "rounded" : "single",
        borderColor,
        paddingLeft: 1,
        paddingRight: 1,
        paddingTop: 0,
        paddingBottom: 0,
        width: "100%",
      }}
      title={title}
      titleAlignment="left"
    >
      <box style={{ flexDirection: "column", paddingTop: 1, paddingBottom: 1, gap: 0, width: "100%" }}>
        {children}
      </box>
    </box>
  )
}

export function Pill({ active, activeColor, label }: {
  active: boolean
  activeColor: string
  label: string
}) {
  return (
    <text
      fg={active ? activeColor : C.muted}
      bg={active ? C.panel : undefined}
      style={{ paddingLeft: 1, paddingRight: 1 }}
    >
      {active ? `▶ ${label}` : `  ${label}`}
    </text>
  )
}

export function FieldLabel({ label, focused, width }: {
  label: string
  focused: boolean
  width: number
}) {
  return (
    <box style={{ width }}>
      <text fg={focused ? C.blue : C.muted}>{label}</text>
    </box>
  )
}

export function ModelChip({ model, dim }: { model: Model; dim?: boolean }) {
  return (
    <text
      fg={dim ? C.muted : C.text}
      bg={C.panel}
      style={{ paddingLeft: 1, paddingRight: 1 }}
    >
      {model}
    </text>
  )
}

export function Rule() {
  return (
    <box style={{ width: "100%", height: 1, overflow: "hidden" }}>
      <text fg={C.border}>{"─".repeat(400)}</text>
    </box>
  )
}
