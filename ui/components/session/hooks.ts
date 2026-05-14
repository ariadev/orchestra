import { useEffect, useRef, useState } from "react"
import path from "path"
import type { ScrollBoxRenderable } from "@opentui/core"
import type { OrchestraEvent, SessionConfig, SessionState } from "../../types"
import { saveSession } from "../../storage"
import { generateSessionName } from "../../naming"
import type { Action, SaveState, Status } from "./types"
import { handleEvent } from "./reducer"

// ── Paths ─────────────────────────────────────────────────────────────────────

const ORCH_DIR = path.resolve(import.meta.dir, "../../..")
const PYTHON   = path.join(ORCH_DIR, ".venv", "bin", "python3")
const MAIN_PY  = path.join(ORCH_DIR, "main.py")

// ── Clipboard ─────────────────────────────────────────────────────────────────

export function writeClipboard(text: string) {
  const encoded = Buffer.from(text).toString("base64")
  process.stdout.write(`\x1b]52;c;${encoded}\x07`)
}

// ── Card content extraction ───────────────────────────────────────────────────

export function getCardContent(state: SessionState, cardId: string): string {
  if (cardId === "framing" && state.framing) {
    return [state.framing.definition, ...state.framing.questions.map((q, i) => `${i + 1}. ${q}`)].join("\n")
  }
  if (cardId.startsWith("agent-")) {
    const [, roundStr, idxStr] = cardId.split("-")
    const round = state.rounds.find(r => r.num === parseInt(roundStr))
    const agent = round?.agents[parseInt(idxStr)]
    return agent?.content ?? ""
  }
  if (cardId.startsWith("review-")) {
    const roundNum = parseInt(cardId.split("-")[1])
    const review = state.reviews.find(r => r.round === roundNum)
    return review?.reason ?? ""
  }
  if (cardId === "synthesis" && state.synthesis) {
    const s = state.synthesis
    const parts = [`Summary:\n${s.summary}`, `Deliverable:\n${s.deliverable}`]
    if (s.key_decisions.length) parts.push(`Key decisions:\n${s.key_decisions.map(d => `→ ${d}`).join("\n")}`)
    if (s.open_questions.length) parts.push(`Open questions:\n${s.open_questions.map(q => `? ${q}`).join("\n")}`)
    return parts.join("\n\n")
  }
  return ""
}

export function collectCardIds(state: SessionState): string[] {
  const ids: string[] = []
  if (state.framing) ids.push("framing")
  for (const round of state.rounds) {
    round.agents.forEach((agent, i) => {
      if (!agent.thinking) ids.push(`agent-${round.num}-${i}`)
    })
    if (state.reviews.some(r => r.round === round.num)) ids.push(`review-${round.num}`)
  }
  if (state.synthesis) ids.push("synthesis")
  return ids
}

// ── Subprocess hook ───────────────────────────────────────────────────────────

export function useSessionProcess(
  config: SessionConfig,
  enabled: boolean,
  dispatch: (action: Action) => void,
) {
  const procRef = useRef<ReturnType<typeof Bun.spawn> | null>(null)

  useEffect(() => {
    if (!enabled) return
    let mounted = true

    const proc = Bun.spawn([PYTHON, MAIN_PY], {
      stdin:  "pipe",
      stdout: "pipe",
      stderr: "pipe",
      cwd:    ORCH_DIR,
    })
    procRef.current = proc

    proc.stdin.write(new TextEncoder().encode(JSON.stringify(config)))
    proc.stdin.end()

    ;(async () => {
      const decoder = new TextDecoder()
      let buffer = ""
      try {
        const reader = proc.stdout.getReader()
        while (true) {
          const { done, value } = await reader.read()
          if (done || !mounted) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() ?? ""
          for (const line of lines) {
            const t = line.trim()
            if (!t) continue
            try { handleEvent(dispatch, JSON.parse(t) as OrchestraEvent) } catch {}
          }
        }
        if (mounted) dispatch({ type: "DONE", totalRounds: 0 })
      } catch (err: unknown) {
        if (mounted) dispatch({ type: "ERROR", message: String(err) })
      }
    })()

    return () => {
      mounted = false
      try { proc.kill() } catch {}
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return procRef
}

// ── Auto-save hook ────────────────────────────────────────────────────────────

export function useAutoSave(
  enabled: boolean,
  status: Status,
  sessionKey: string,
  config: SessionConfig,
  state: SessionState,
  initialSaveState: SaveState,
  initialName: string,
) {
  const hasSaved = useRef(false)
  const [saveState, setSaveState] = useState<SaveState>(initialSaveState)
  const [savedName, setSavedName] = useState<string>(initialName)

  useEffect(() => {
    if (!enabled || status !== "done" || hasSaved.current) return
    hasSaved.current = true
    setSaveState("saving")

    ;(async () => {
      const name = await generateSessionName(config.topic)
      setSavedName(name)
      await saveSession({
        key: sessionKey,
        name,
        date: new Date().toISOString(),
        config,
        state,
      })
      setSaveState("saved")
    })()
  }, [status]) // eslint-disable-line react-hooks/exhaustive-deps

  return { saveState, savedName }
}

// ── Card copy navigation hook ─────────────────────────────────────────────────

export function useCardCopy(cardIds: string[], state: SessionState) {
  const [focusedCardId, setFocusedCardId] = useState<string | null>(null)
  const [copiedCardId,  setCopiedCardId]  = useState<string | null>(null)
  const scrollboxRef = useRef<ScrollBoxRenderable>(null)

  useEffect(() => {
    if (focusedCardId) scrollboxRef.current?.scrollChildIntoView(focusedCardId)
  }, [focusedCardId])

  function focusNext() {
    setFocusedCardId(curr => {
      if (!cardIds.length) return null
      const idx = curr !== null ? cardIds.indexOf(curr) : -1
      return cardIds[(idx + 1) % cardIds.length]
    })
  }

  function focusPrev() {
    setFocusedCardId(curr => {
      if (!cardIds.length) return null
      const idx = curr !== null ? cardIds.indexOf(curr) : 0
      return cardIds[(idx - 1 + cardIds.length) % cardIds.length]
    })
  }

  function triggerCopy(cardId: string) {
    const content = getCardContent(state, cardId)
    if (!content) return
    writeClipboard(content)
    setCopiedCardId(cardId)
    setTimeout(() => setCopiedCardId(c => c === cardId ? null : c), 1500)
  }

  function clearFocus() { setFocusedCardId(null) }

  return {
    focusedCardId, copiedCardId, scrollboxRef,
    focusNext, focusPrev, triggerCopy, clearFocus,
  }
}
