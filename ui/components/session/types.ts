import type { SynthesisOutput } from "../../types"

export type Status = "waiting" | "framing" | "running" | "reviewing" | "synthesizing" | "done" | "error"
export type SaveState = "idle" | "saving" | "saved"

export type ReviewRecord = { decision: string; reason: string; round: number }

export type Action =
  | { type: "FRAMING";        definition: string; questions: string[]; model?: string; tokens?: number }
  | { type: "ROUND_START";    round: number }
  | { type: "AGENT_THINKING"; name: string; role: string }
  | { type: "AGENT_RESPONSE"; name: string; content: string; model?: string; tokens?: number }
  | { type: "REVIEW";         decision: string; reason: string; round: number }
  | { type: "SYNTHESIS";      output: SynthesisOutput }
  | { type: "DONE";           totalRounds: number }
  | { type: "ERROR";          message: string }
