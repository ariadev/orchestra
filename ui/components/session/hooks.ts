import { useEffect, useRef, useState } from "react"
import type { ScrollBoxRenderable } from "@opentui/core"
import type { OrchestraEvent, SessionConfig, SessionState } from "../../types"
import { saveSession } from "../../storage"
import { generateSessionName } from "../../naming"
import type { Action, SaveState, Status } from "./types"
import { handleEvent } from "./reducer"

// ── API ───────────────────────────────────────────────────────────────────────

const API_BASE = process.env.ORCHESTRA_API_URL ?? "http://localhost:7890"

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

// ── SSE session hook ──────────────────────────────────────────────────────────

export function useSessionProcess(
  config: SessionConfig,
  enabled: boolean,
  dispatch: (action: Action) => void,
) {
  const ctrlRef = useRef<{ kill: () => void } | null>(null)

  useEffect(() => {
    if (!enabled) return
    let mounted = true
    const controller = new AbortController()

    ctrlRef.current = {
      kill: () => {
        mounted = false
        controller.abort()
      },
    }

    ;(async () => {
      try {
        const res = await fetch(`${API_BASE}/sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(config),
          signal: controller.signal,
        })

        if (!res.ok) {
          const text = await res.text()
          throw new Error(`API error ${res.status}: ${text}`)
        }

        const { session_id } = await res.json() as { session_id: string }

        const eventsRes = await fetch(`${API_BASE}/sessions/${session_id}/events`, {
          signal: controller.signal,
        })

        if (!eventsRes.ok || !eventsRes.body) {
          throw new Error(`Failed to connect to event stream (${eventsRes.status})`)
        }

        const decoder = new TextDecoder()
        let buffer = ""
        const reader = eventsRes.body.getReader()

        while (true) {
          const { done, value } = await reader.read()
          if (done || !mounted) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() ?? ""
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue
            const text = line.slice(6).trim()
            if (!text) continue
            try { handleEvent(dispatch, JSON.parse(text) as OrchestraEvent) } catch {}
          }
        }

        if (mounted) dispatch({ type: "DONE", totalRounds: 0 })
      } catch (err: unknown) {
        if (mounted && !controller.signal.aborted) {
          dispatch({ type: "ERROR", message: String(err) })
        }
      }
    })()

    return () => {
      mounted = false
      controller.abort()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return ctrlRef
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
