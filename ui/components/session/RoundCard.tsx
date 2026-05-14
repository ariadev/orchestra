import { C, AGENT_COLORS, type RoundData } from "../../types"
import { AgentCard } from "./AgentCard"
import { ReviewCard } from "./ReviewCard"
import type { ReviewRecord } from "./types"

export function RoundCard({ round, review, focusedCardId, copiedCardId }: {
  round: RoundData
  review: ReviewRecord | null
  focusedCardId: string | null
  copiedCardId: string | null
}) {
  return (
    <box style={{ flexDirection: "column", gap: 1, width: "100%" }}>
      <RoundSeparator num={round.num} />
      {round.agents.map((agent, i) => (
        <AgentCard
          key={agent.name}
          id={`agent-${round.num}-${i}`}
          agent={agent}
          color={AGENT_COLORS[i % AGENT_COLORS.length]}
          isFocused={focusedCardId === `agent-${round.num}-${i}`}
          isCopied={copiedCardId === `agent-${round.num}-${i}`}
        />
      ))}
      {review && (
        <ReviewCard
          id={`review-${round.num}`}
          review={review}
          isFocused={focusedCardId === `review-${round.num}`}
          isCopied={copiedCardId === `review-${round.num}`}
        />
      )}
    </box>
  )
}

function RoundSeparator({ num }: { num: number }) {
  return (
    <box style={{ flexDirection: "row", gap: 2 }}>
      <text fg={C.muted}>───────</text>
      <text fg={C.blue}>Round {num}</text>
      <text fg={C.muted}>───────────────────────────────────────────────────</text>
    </box>
  )
}
