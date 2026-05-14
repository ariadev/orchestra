import { C, MODELS, type AgentConfig, type Model } from "../../types"
import { FieldLabel, Pill, Rule } from "./primitives"
import type { FocusField, MemberFormState } from "./types"

export function MemberForm({ focus, agents, form }: {
  focus: FocusField
  agents: AgentConfig[]
  form: MemberFormState
}) {
  return (
    <box style={{ flexDirection: "column", gap: 1, paddingTop: 1 }}>
      <Rule />
      <MemberFormBadge editingIdx={form.editingIdx} agents={agents} />
      <NameRoleRow focus={focus} form={form} />
      <PersonaRow focus={focus} form={form} />
      <ModelActionsRow focus={focus} form={form} />
    </box>
  )
}

function MemberFormBadge({ editingIdx, agents }: {
  editingIdx: number
  agents: AgentConfig[]
}) {
  const isEditing = editingIdx >= 0
  return (
    <box style={{ flexDirection: "row", gap: 1 }}>
      <text fg={isEditing ? C.orange : C.green}>{isEditing ? "✎" : "+"}</text>
      <text fg={C.muted}>
        {isEditing ? `editing ${agents[editingIdx]?.name ?? ""}` : "new member"}
      </text>
    </box>
  )
}

function NameRoleRow({ focus, form }: { focus: FocusField; form: MemberFormState }) {
  return (
    <box style={{ flexDirection: "row", gap: 2, alignItems: "center", width: "100%" }}>
      <FieldLabel label="name" focused={focus === "name"} width={8} />
      <input
        placeholder="Agent Name"
        onInput={form.setName}
        focused={focus === "name"}
        value={form.name}
        width={22}
        textColor={C.text}
        cursorColor={C.blue}
        backgroundColor={C.panel}
        focusedBackgroundColor={C.panel}
      />
      <text fg={C.border}>│</text>
      <FieldLabel label="role" focused={focus === "role"} width={6} />
      <box style={{ flexGrow: 1 }}>
        <input
          placeholder="Professional role…"
          onInput={form.setRole}
          focused={focus === "role"}
          value={form.role}
          width="100%"
          textColor={C.text}
          cursorColor={C.blue}
          backgroundColor={C.panel}
          focusedBackgroundColor={C.panel}
        />
      </box>
    </box>
  )
}

function PersonaRow({ focus, form }: { focus: FocusField; form: MemberFormState }) {
  return (
    <box style={{ flexDirection: "row", gap: 2, alignItems: "flex-start", width: "100%" }}>
      <FieldLabel label="persona" focused={focus === "persona"} width={8} />
      <box style={{ flexGrow: 1 }}>
        <textarea
          key={`persona-${form.formKey}-${form.personaEditorKey}`}
          ref={form.personaRef}
          initialValue={form.persona}
          placeholder="Perspective, expertise, approach…"
          focused={focus === "persona" && !form.isGeneratingPersona}
          textColor={C.text}
          cursorColor={C.blue}
          backgroundColor={C.panel}
          focusedBackgroundColor={C.panel}
          width="100%"
          wrapMode="word"
        />
      </box>
    </box>
  )
}

function ModelActionsRow({ focus, form }: { focus: FocusField; form: MemberFormState }) {
  return (
    <box style={{ flexDirection: "row", gap: 2, alignItems: "center", width: "100%" }}>
      <FieldLabel label="model" focused={focus === "model"} width={8} />
      <ModelSelector selected={form.model} focused={focus === "model"} />
      <box style={{ flexGrow: 1 }} />
      <Pill
        active={focus === "add"}
        activeColor={form.editingIdx >= 0 ? C.orange : C.green}
        label={form.editingIdx >= 0 ? "✓ update" : "✓ add"}
      />
      <Pill active={focus === "cancel"} activeColor={C.red} label="✕ cancel" />
    </box>
  )
}

function ModelSelector({ selected, focused }: { selected: Model; focused: boolean }) {
  return (
    <box style={{ flexDirection: "row", gap: 1 }}>
      {MODELS.map((m: Model) => {
        const isSelected = selected === m
        return (
          <text
            key={m}
            fg={isSelected ? C.bg : (focused ? C.text : C.muted)}
            bg={isSelected ? (focused ? C.blue : C.border) : undefined}
            style={{ paddingLeft: 1, paddingRight: 1 }}
          >
            {m}
          </text>
        )
      })}
    </box>
  )
}
