import { C, type AgentConfig } from "../../types"
import type { SuggestedAgent } from "../../naming"
import { Card, Rule } from "./primitives"
import { type FocusField, type MemberFormState, type SuggestionState, sectionOf } from "./types"
import { SuggestionLoadingRow, SuggestionPanel } from "./SuggestionPanel"
import { MemberList, EmptyMembersHint, MembersNavHint } from "./MemberList"
import { MemberForm } from "./MemberForm"

export function MembersSection({ focus, agents, selectedMember, suggestionState, suggestedAgents, form }: {
  focus: FocusField
  agents: AgentConfig[]
  selectedMember: number
  suggestionState: SuggestionState
  suggestedAgents: SuggestedAgent[]
  form: MemberFormState
}) {
  const active = sectionOf(focus) === "members"
  const meta   = agents.length > 0
    ? `${agents.length} participant${agents.length === 1 ? "" : "s"}`
    : "none yet"

  const showDivider = (agents.length > 0 || suggestionState === "ready") && !form.open

  return (
    <Card index="2" label="members" accent={C.green} active={active} done={agents.length > 0} meta={meta}>
      {suggestionState === "loading" && <SuggestionLoadingRow />}
      {suggestionState === "ready"   && <SuggestionPanel agents={suggestedAgents} focus={focus} />}

      {agents.length > 0
        ? <MemberList agents={agents} focus={focus} selectedMember={selectedMember} />
        : (suggestionState === "idle" || suggestionState === "dismissed") && <EmptyMembersHint />}

      {agents.length > 0 && focus === "members" && <MembersNavHint />}
      {showDivider && <DividerSpacer />}
      {!form.open && <AddMemberButton focused={focus === "addBtn"} hasAgents={agents.length > 0} />}
      {form.open  && <MemberForm focus={focus} agents={agents} form={form} />}
    </Card>
  )
}

function DividerSpacer() {
  return (
    <box style={{ paddingTop: 1, paddingBottom: 0 }}>
      <Rule />
    </box>
  )
}

function AddMemberButton({ focused, hasAgents }: {
  focused: boolean
  hasAgents: boolean
}) {
  return (
    <box style={{ flexDirection: "row", gap: 1, paddingTop: hasAgents ? 1 : 0 }}>
      <text fg={focused ? C.green : C.border}>{focused ? "▶" : " "}</text>
      <text fg={focused ? C.green : C.muted}>+ add new member</text>
      {focused && <text fg={C.border}>  (Enter)</text>}
    </box>
  )
}
