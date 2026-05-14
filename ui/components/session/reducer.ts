import type { AgentEntry, OrchestraEvent, SessionState } from "../../types"
import type { Action } from "./types"

export const INITIAL: SessionState = {
  topic: "", discussionRounds: 3, status: "waiting",
  framing: null, rounds: [], currentRound: 0,
  reviews: [], synthesis: null, error: null,
}

export function reducer(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case "FRAMING":
      return {
        ...state,
        status: "framing",
        framing: { definition: action.definition, questions: action.questions, model: action.model, tokens: action.tokens },
      }

    case "ROUND_START":
      return {
        ...state,
        status: "running",
        currentRound: action.round,
        rounds: [...state.rounds, { num: action.round, agents: [] }],
      }

    case "AGENT_THINKING": {
      const rounds = [...state.rounds]
      const last = { ...rounds[rounds.length - 1] }
      last.agents = [...last.agents, { name: action.name, role: action.role, thinking: true, content: "" }]
      rounds[rounds.length - 1] = last
      return { ...state, rounds }
    }

    case "AGENT_RESPONSE": {
      const rounds = [...state.rounds]
      const last = { ...rounds[rounds.length - 1] }
      last.agents = last.agents.map((a: AgentEntry) =>
        a.name === action.name ? { ...a, thinking: false, content: action.content, model: action.model, tokens: action.tokens } : a
      )
      rounds[rounds.length - 1] = last
      return { ...state, rounds }
    }

    case "REVIEW":
      return {
        ...state,
        status: "reviewing",
        reviews: [...state.reviews, { decision: action.decision, reason: action.reason, round: action.round }],
      }

    case "SYNTHESIS":
      return { ...state, status: "synthesizing", synthesis: action.output }

    case "DONE":
      return { ...state, status: "done" }

    case "ERROR":
      return { ...state, status: "error", error: action.message }

    default:
      return state
  }
}

export function handleEvent(dispatch: (a: Action) => void, ev: OrchestraEvent) {
  switch (ev.type) {
    case "facilitator_framing":
      dispatch({ type: "FRAMING", definition: ev.definition, questions: ev.questions, model: ev.model, tokens: ev.tokens })
      break
    case "round_start":
      dispatch({ type: "ROUND_START", round: ev.round })
      break
    case "agent_thinking":
      dispatch({ type: "AGENT_THINKING", name: ev.agent, role: ev.role })
      break
    case "agent_response":
      dispatch({ type: "AGENT_RESPONSE", name: ev.agent, content: ev.content, model: ev.model, tokens: ev.tokens })
      break
    case "review":
      dispatch({ type: "REVIEW", decision: ev.decision, reason: ev.reason, round: ev.round })
      break
    case "synthesis":
      dispatch({ type: "SYNTHESIS", output: {
        output_type:    ev.output_type,
        deliverable:    ev.deliverable,
        summary:        ev.summary,
        key_decisions:  ev.key_decisions,
        open_questions: ev.open_questions,
        model:          ev.model,
        tokens:         ev.tokens,
      }})
      break
    case "session_end":
      dispatch({ type: "DONE", totalRounds: ev.total_rounds })
      break
    case "error":
      dispatch({ type: "ERROR", message: ev.message })
      break
  }
}
