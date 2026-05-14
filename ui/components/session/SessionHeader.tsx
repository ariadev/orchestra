import { C } from "../../types"
import type { SaveState, Status } from "./types"

export function SessionHeader({
  topic, status, currentRound, totalRounds,
  saveState, savedName, sessionKey,
  focusedCardId,
}: {
  topic: string
  status: Status
  currentRound: number
  totalRounds: number
  saveState: SaveState
  savedName: string
  sessionKey: string
  focusedCardId: string | null
}) {
  return (
    <box
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        backgroundColor: C.panel,
        borderStyle: "single",
        borderColor: C.border,
        paddingLeft: 2,
        paddingRight: 2,
        height: 3,
        alignItems: "center",
      }}
    >
      <SessionTitle topic={topic} saveState={saveState} savedName={savedName} sessionKey={sessionKey} />
      <StatusDisplay
        status={status}
        currentRound={currentRound}
        totalRounds={totalRounds}
        focusedCardId={focusedCardId}
      />
    </box>
  )
}

function SessionTitle({ topic, saveState, savedName, sessionKey }: {
  topic: string
  saveState: SaveState
  savedName: string
  sessionKey: string
}) {
  const display = topic.length > 50 ? topic.slice(0, 50) + "…" : topic
  return (
    <box style={{ flexDirection: "row", gap: 2 }}>
      <text fg={C.purple}>◆ ORCHESTRA</text>
      <text fg={C.muted}>•</text>
      <text fg={C.text}>{display}</text>
      {saveState === "saving" && <text fg={C.muted}>• saving…</text>}
      {saveState === "saved" && (
        <>
          <text fg={C.muted}>•</text>
          <text fg={C.green}>{savedName}</text>
          <text fg={C.border}>[{sessionKey}]</text>
        </>
      )}
    </box>
  )
}

function StatusDisplay({ status, currentRound, totalRounds, focusedCardId }: {
  status: Status
  currentRound: number
  totalRounds: number
  focusedCardId: string | null
}) {
  if (focusedCardId) {
    return <text fg={C.cyan}>Tab: next  •  y: copy  •  Esc: unfocus</text>
  }
  return <text fg={STATUS_COLOR[status]}>{statusLabel(status, currentRound, totalRounds)}</text>
}

const STATUS_COLOR: Record<Status, string> = {
  waiting:      C.muted,
  framing:      C.yellow,
  running:      C.blue,
  reviewing:    C.orange,
  synthesizing: C.purple,
  done:         C.green,
  error:        C.red,
}

function statusLabel(status: Status, currentRound: number, totalRounds: number): string {
  switch (status) {
    case "waiting":      return "waiting..."
    case "framing":      return "framing topic..."
    case "running":      return `round ${currentRound} — deliberating`
    case "reviewing":    return "reviewing..."
    case "synthesizing": return "synthesizing..."
    case "done":         return `complete • ${totalRounds} rounds • b: exit • Tab: copy`
    case "error":        return "error"
  }
}
