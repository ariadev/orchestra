import type { ReactNode } from "react"
import { C } from "../../types"
import {
  type FocusField, type Section,
  SECTION_ORDER, SECTION_LABEL,
} from "./types"

// ── Content area ──────────────────────────────────────────────────────────────

export function ContentArea({ children }: { children: ReactNode }) {
  return (
    <box style={{ flexGrow: 1, width: "100%", flexDirection: "column", paddingLeft: 2, paddingRight: 2, paddingTop: 1, gap: 1 }}>
      {children}
    </box>
  )
}

// ── Header bar ────────────────────────────────────────────────────────────────

export function HeaderBar({ agentCount, outputModeLabel, rounds, ready }: {
  agentCount: number
  outputModeLabel: string
  rounds: number
  ready: boolean
}) {
  return (
    <box
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        backgroundColor: C.panel,
        borderStyle: "single",
        borderColor: C.border,
        paddingLeft: 2,
        paddingRight: 2,
        height: 3,
      }}
    >
      <box style={{ flexDirection: "row", gap: 2 }}>
        <text fg={C.purple}>◆ ORCHESTRA</text>
        <text fg={C.border}>│</text>
        <text fg={C.text}>discussion room</text>
        <text fg={C.muted}>setup</text>
      </box>
      <box style={{ flexDirection: "row", gap: 2 }}>
        <text fg={C.muted}>{agentCount} {agentCount === 1 ? "member" : "members"}</text>
        <text fg={C.border}>·</text>
        <text fg={C.muted}>{outputModeLabel}</text>
        <text fg={C.border}>·</text>
        <text fg={C.muted}>{rounds} round{rounds === 1 ? "" : "s"}</text>
        <text fg={C.border}>·</text>
        <text fg={ready ? C.green : C.orange}>{ready ? "● ready" : "○ incomplete"}</text>
      </box>
    </box>
  )
}

// ── Stepper ───────────────────────────────────────────────────────────────────

export function SectionStepper({ section, completed }: {
  section: Section
  completed: Record<Section, boolean>
}) {
  return (
    <box style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", paddingTop: 1, paddingBottom: 1, gap: 1 }}>
      {SECTION_ORDER.map((s, i) => (
        <SectionStepperItem
          key={s}
          name={s}
          isCurrent={s === section}
          isDone={completed[s]}
          showConnector={i > 0}
        />
      ))}
    </box>
  )
}

function SectionStepperItem({ name, isCurrent, isDone, showConnector }: {
  name: Section
  isCurrent: boolean
  isDone: boolean
  showConnector: boolean
}) {
  const glyph   = isCurrent ? "●" : isDone ? "✓" : "○"
  const color   = isCurrent ? C.blue : isDone ? C.green : C.border
  const labelFg = isCurrent ? C.text : isDone ? C.muted : C.border
  return (
    <box style={{ flexDirection: "row", alignItems: "center", gap: 1 }}>
      {showConnector && <text fg={C.border}>───</text>}
      <text fg={color}>{glyph}</text>
      <text fg={labelFg}>{SECTION_LABEL[name]}</text>
    </box>
  )
}

// ── Footer bar ────────────────────────────────────────────────────────────────

export function FooterBar({ focus, error, formOpen, membersCount }: {
  focus: FocusField
  error: string
  formOpen: boolean
  membersCount: number
}) {
  return (
    <box
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        backgroundColor: C.panel,
        borderStyle: "single",
        borderColor: error ? C.red : C.border,
        paddingLeft: 2,
        paddingRight: 2,
        height: 3,
      }}
    >
      {error
        ? <FooterError message={error} />
        : <FooterHint hint={contextualHint(focus, formOpen, membersCount)} />}
      <text fg={C.border}>tab next · shift+tab back · esc cancel · ctrl+c quit</text>
    </box>
  )
}

function FooterError({ message }: { message: string }) {
  return (
    <box style={{ flexDirection: "row", gap: 1, alignItems: "center" }}>
      <text fg={C.red}>⚠</text>
      <text fg={C.red}>{message}</text>
    </box>
  )
}

function FooterHint({ hint }: { hint: string }) {
  return (
    <box style={{ flexDirection: "row", gap: 1, alignItems: "center" }}>
      <text fg={C.cyan}>›</text>
      <text fg={C.muted}>{hint}</text>
    </box>
  )
}

function contextualHint(focus: FocusField, formOpen: boolean, membersCount: number): string {
  if (formOpen) {
    switch (focus) {
      case "name":    return "type the agent's name"
      case "role":    return "type the role — enter or tab triggers persona generation"
      case "persona": return "describe perspective, expertise, approach"
      case "model":   return "←→ pick a model"
      case "add":     return "enter to confirm the new member"
      case "cancel":  return "enter to discard changes"
    }
  }
  switch (focus) {
    case "topic":            return "describe the discussion topic — tab to get AI agent suggestions"
    case "members":          return "↑↓ navigate · ctrl+e edit · ctrl+d remove · alt+↑↓ reorder"
    case "addBtn":           return "enter to add a new member"
    case "suggestAccept":    return "enter to use suggested agents"
    case "suggestDecline":   return "enter to dismiss and create manually"
    case "outputMode":       return "←→ choose what the session should produce"
    case "discussionRounds": return "←→ pick how many deliberation rounds"
    case "start":            return membersCount === 0
      ? "add at least one member before starting"
      : "enter to launch the discussion"
  }
  return ""
}
