import { useMemo, useReducer, useRef } from "react"
import { useKeyboard } from "@opentui/react"
import {
  C, type RoundData,
  type SessionConfig, type SessionState,
} from "../types"
import { generateKey } from "../storage"

import type { Status } from "./session/types"
import { INITIAL, reducer } from "./session/reducer"
import { collectCardIds, useAutoSave, useCardCopy, useSessionProcess } from "./session/hooks"
import { SessionHeader } from "./session/SessionHeader"
import { FramingCard } from "./session/FramingCard"
import { RoundCard } from "./session/RoundCard"
import { SynthesisCard } from "./session/SynthesisCard"
import { ErrorCard } from "./session/primitives"

interface Props {
  config: SessionConfig
  onBack: () => void
  initialState?: SessionState
  sessionMeta?: { key: string; name: string }
}

export function SessionScreen({ config, onBack, initialState, sessionMeta }: Props) {
  const isViewer = !!initialState

  const [state, dispatch] = useReducer(
    reducer,
    initialState ?? { ...INITIAL, topic: config.topic, discussionRounds: config.discussion_rounds },
  )

  const sessionKey = useRef(sessionMeta?.key ?? generateKey())

  const procRef = useSessionProcess(config, !isViewer, dispatch)
  const { saveState, savedName } = useAutoSave(
    !isViewer,
    state.status as Status,
    sessionKey.current,
    config,
    state,
    sessionMeta ? "saved" : "idle",
    sessionMeta?.name ?? "",
  )

  const cardIds = useMemo(() => collectCardIds(state),
    [state.framing, state.rounds, state.reviews, state.synthesis])
  const copy = useCardCopy(cardIds, state)

  useKeyboard((key) => {
    if (key.name === "b" && (state.status === "done" || isViewer)) onBack()
    if (key.ctrl && key.name === "c") { try { procRef.current?.kill() } catch {}; onBack() }

    if (key.name === "tab" && !key.shift) copy.focusNext()
    if (key.name === "tab" &&  key.shift) copy.focusPrev()
    if ((key.name === "y" || key.name === "return") && copy.focusedCardId) copy.triggerCopy(copy.focusedCardId)
    if (key.name === "escape") copy.clearFocus()
  })

  return (
    <box style={{ width: "100%", height: "100%", flexDirection: "column", backgroundColor: C.bg }}>
      <SessionHeader
        topic={config.topic}
        status={state.status as Status}
        currentRound={state.currentRound}
        totalRounds={state.rounds.length}
        saveState={saveState}
        savedName={savedName}
        sessionKey={sessionKey.current}
        focusedCardId={copy.focusedCardId}
      />

      <scrollbox ref={copy.scrollboxRef} style={{ flexGrow: 1, width: "100%" }}>
        <box style={{ width: "100%", flexDirection: "column", padding: 1, gap: 1 }}>
          {state.framing && (
            <FramingCard
              definition={state.framing.definition}
              questions={state.framing.questions}
              model={state.framing.model}
              tokens={state.framing.tokens}
              isFocused={copy.focusedCardId === "framing"}
              isCopied={copy.copiedCardId === "framing"}
            />
          )}

          {state.rounds.map((round: RoundData) => (
            <RoundCard
              key={round.num}
              round={round}
              review={state.reviews.find(r => r.round === round.num) ?? null}
              focusedCardId={copy.focusedCardId}
              copiedCardId={copy.copiedCardId}
            />
          ))}

          {state.synthesis && (
            <SynthesisCard
              synthesis={state.synthesis}
              isFocused={copy.focusedCardId === "synthesis"}
              isCopied={copy.copiedCardId === "synthesis"}
            />
          )}

          {state.error && <ErrorCard message={state.error} />}
        </box>
      </scrollbox>
    </box>
  )
}
