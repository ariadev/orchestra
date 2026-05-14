import type { RefObject } from "react"
import type { TextareaRenderable } from "@opentui/core"
import type { Model } from "../../types"

export type SuggestionState = "idle" | "loading" | "ready" | "dismissed"

export type FocusField =
  | "topic" | "members" | "addBtn"
  | "suggestAccept" | "suggestDecline"
  | "name" | "role" | "persona" | "model" | "add" | "cancel"
  | "outputMode" | "discussionRounds" | "start"

export type Section = "topic" | "members" | "settings" | "launch"

export type TextareaRef = RefObject<TextareaRenderable | null>

export interface MemberFormState {
  open: boolean
  editingIdx: number
  formKey: number
  personaEditorKey: number
  isGeneratingPersona: boolean
  name: string
  role: string
  persona: string
  model: Model
  personaRef: TextareaRef
  setName: (v: string) => void
  setRole: (v: string) => void
}

export const SECTION_ORDER = ["topic", "members", "settings", "launch"] as const

export const SECTION_LABEL: Record<Section, string> = {
  topic: "topic", members: "members", settings: "settings", launch: "launch",
}

export function sectionOf(f: FocusField): Section {
  if (f === "topic") return "topic"
  if (f === "outputMode" || f === "discussionRounds") return "settings"
  if (f === "start") return "launch"
  return "members"
}

export const GENERATING_PERSONA_TEXT = "AI generating persona for you..."

export const ROUND_LABEL: Record<number, string> = {
  1: "minimal", 2: "light", 3: "standard", 4: "extended", 5: "maximum",
}

export const ROUND_SUBTITLES: Record<number, string> = {
  1: "Single pass — fast, lightweight, best for simple or well-defined topics",
  2: "One follow-up — quick refinement after the initial exchange",
  3: "Standard depth — agents revisit and challenge each other twice",
  4: "Extended deliberation — good for ambiguous or high-stakes topics",
  5: "Maximum depth — most thorough, expect longer runtime and higher cost",
}
