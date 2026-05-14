import { C } from "../../types"
import { Card } from "./primitives"
import type { FocusField, TextareaRef } from "./types"

export function TopicSection({ focus, topicRef, done }: {
  focus: FocusField
  topicRef: TextareaRef
  done: boolean
}) {
  const active = focus === "topic"
  return (
    <Card index="1" label="topic" accent={C.blue} active={active} done={done}>
      <textarea
        ref={topicRef}
        placeholder="Describe what this room should deliberate on…"
        focused={active}
        width="100%"
        textColor={C.text}
        cursorColor={C.blue}
        wrapMode="word"
      />
    </Card>
  )
}
