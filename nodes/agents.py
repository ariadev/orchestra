"""
Per-agent-turn deliberation nodes.

The monolithic run_agents_node has been split into three nodes that execute once
per agent per round, enabling interruptible clarification mid-turn:

  agent_decide  →  [agent_clarify]  →  agent_commit
       ↑                                     │
       └───────────── (next agent) ──────────┘
                      (or round done → round_extractor)

agent_decide:  LLM call that produces either a completed response or a
               clarification request. Emits round_start (first agent only)
               and agent_thinking. Returns pending_clarification or
               current_agent_draft.

agent_clarify: Calls interrupt() immediately to pause the graph. On resume,
               receives the user's answer and records it in state. Code after
               interrupt() only runs after resume — so clarification_history
               and the answer are only written once, on resume.

agent_commit:  Finalizes the agent's response. If a clarification answer
               arrived, makes a second LLM call to complete the reasoning.
               Otherwise uses current_agent_draft directly. Emits
               agent_response and advances current_agent_index.
"""
import json

from langchain_core.messages import SystemMessage, HumanMessage
from langgraph.types import interrupt

import events
from models import get_llm
from state import (
    AgentConfig,
    AgentResponse,
    ClarificationRecord,
    ClarificationRequest,
    DiscussionState,
    RoundSummary,
)

# ── System prompt ──────────────────────────────────────────────────────────────

_SYSTEM_TMPL = """\
You are {name}, a {role} participating in a structured deliberation session.

Persona: {persona}

Your contribution style:
- Be specific and concrete. Avoid platitudes.
- Ground every claim in your role's domain expertise.
- Build on or respectfully challenge what others have said — don't just repeat.
- Limit your response to 3–5 focused paragraphs.
- Write in English.

Clarification policy:
- You may request ONE clarification per turn, but only when ambiguity is critical \
and would materially change your analysis.
- Default: reason from stated assumptions and proceed.
- Do NOT ask for clarification if the information is already provided, the topic is \
clear enough to reason about, or you could make a reasonable assumption instead.
"""

# ── Human prompt for the decide step (structured JSON response) ────────────────

_HUMAN_DECIDE_TMPL = """\
## Topic
{definition}

## Key questions the discussion must answer
{questions}

## Settled conclusions — do not revisit these
{decision_log_block}

## Active agenda — what this round must address
{open_items_block}

## Prior rounds
{prior_rounds_block}

## This round so far
{current_round_block}

## Your prior positions
{agent_positions_block}

## Round {current_round} of {total_rounds} — {phase_label}
{round_guidance}

## Your turn
Determine whether there is critical ambiguity that would materially alter your analysis.
If so, you may request exactly one clarification. Otherwise, contribute your response directly.

Respond ONLY with valid JSON — no markdown fences:

To contribute your response:
{{"needs_clarification": false, "response": "<your 3–5 paragraph deliberation response>"}}

To request clarification (use sparingly — only when the answer would meaningfully shift your position):
{{"needs_clarification": true, "clarification_question": "<one specific, high-signal question>", \
"clarification_why": "<one sentence: how the answer changes your analysis>"}}
"""

# ── Human prompt for finalization after a clarification answer ─────────────────

_HUMAN_FINALIZE_TMPL = """\
## Topic
{definition}

## Key questions the discussion must answer
{questions}

## Settled conclusions — do not revisit these
{decision_log_block}

## Active agenda — what this round must address
{open_items_block}

## Prior rounds
{prior_rounds_block}

## This round so far
{current_round_block}

## Your prior positions
{agent_positions_block}

## Round {current_round} of {total_rounds} — {phase_label}
{round_guidance}

## Clarification you requested
**Question:** {clarification_question}
**Why you needed it:** {clarification_why}

## User's answer
{user_answer}

## Your turn — finalize your response
You asked for clarification and received the answer above. Now provide your complete \
deliberation response. Address at least two active agenda items directly. Build on or \
challenge what others have said. Do not request further clarification — complete your \
contribution using what you now know.
"""

_PHASE_LABELS = {
    "explore":  "Explore",
    "deepen":   "Deepen",
    "converge": "Converge",
}

_PHASE_GUIDANCE = {
    "explore": (
        "This is an early round. Prioritize breadth over depth. Surface your full perspective "
        "on the key questions. Raise important tensions and probe initial assumptions. "
        "Do not force conclusions — the goal is to open the space of ideas."
    ),
    "deepen": (
        "More rounds follow. Focus on depth over breadth. Challenge weak reasoning, test "
        "assumptions, and narrow the space of disagreement on the active agenda items. "
        "Be specific about where and why you agree or disagree."
    ),
    "converge": (
        "This is the final round. Drive toward concrete conclusions and commitments. "
        "Synthesize your position on each active agenda item. Be decisive — do not open "
        "new threads. Every claim should be something you are prepared to stand behind."
    ),
}


# ── agent_decide_node ──────────────────────────────────────────────────────────

def agent_decide_node(state: DiscussionState) -> dict:
    """
    LLM call: decide whether to respond directly or request clarification.

    Emits round_start (first agent of a round) and agent_thinking.
    Returns either pending_clarification (pause path) or current_agent_draft (commit path).
    """
    agent_idx = state["current_agent_index"]
    agent_cfg = state["agents_config"][agent_idx]
    total_rounds = state["discussion_rounds"]

    # Increment round on the first agent of each round
    is_first_agent = agent_idx == 0
    if is_first_agent:
        current_round = state["current_round"] + 1
        events.round_start(current_round)
    else:
        current_round = state["current_round"]

    events.agent_thinking(agent_cfg["name"], agent_cfg["role"])

    phase = _round_phase(current_round, total_rounds)

    # Build context blocks
    framing = state["framing"]
    definition = framing["definition"]
    questions_block = "\n".join(f"{i+1}. {q}" for i, q in enumerate(framing["questions"]))
    decision_log_block = (
        "\n".join(f"- {d}" for d in state["decision_log"])
        if state["decision_log"]
        else "(No decisions settled yet.)"
    )
    open_items_block = (
        "\n".join(f"{i+1}. {item}" for i, item in enumerate(state["open_items"]))
        if state["open_items"]
        else "(No active items yet — surface the most important questions and tensions.)"
    )

    # current_round_block: responses committed so far this round
    round_responses_so_far = [r for r in state["responses"] if r["round"] == current_round]
    current_round_block = _build_current_round(round_responses_so_far)
    agent_positions_block = _build_agent_positions(state["responses"], agent_cfg["name"])
    prior_rounds_block = _build_prior_rounds(state["round_summaries"])

    system_msg = SystemMessage(
        content=_SYSTEM_TMPL.format(
            name=agent_cfg["name"],
            role=agent_cfg["role"],
            persona=agent_cfg["persona"],
        )
    )
    human_msg = HumanMessage(
        content=_HUMAN_DECIDE_TMPL.format(
            definition=definition,
            questions=questions_block,
            decision_log_block=decision_log_block,
            open_items_block=open_items_block,
            prior_rounds_block=prior_rounds_block,
            current_round_block=current_round_block,
            agent_positions_block=agent_positions_block,
            current_round=current_round,
            total_rounds=total_rounds,
            phase_label=_PHASE_LABELS[phase],
            round_guidance=_PHASE_GUIDANCE[phase],
        )
    )

    model = agent_cfg.get("model", "gpt-5.4")
    llm = get_llm(model, temperature=0.8)
    result = llm.invoke([system_msg, human_msg])
    raw = result.content
    tokens = (getattr(result, "usage_metadata", None) or {}).get("total_tokens", 0)

    decision = _parse_decision(raw)

    update: dict = {}
    if is_first_agent:
        update["current_round"] = current_round

    if decision["needs_clarification"]:
        clarification: ClarificationRequest = {
            "agent_name": agent_cfg["name"],
            "agent_role": agent_cfg["role"],
            "question": decision["clarification_question"],
            "why_it_matters": decision["clarification_why"],
            "round": current_round,
        }
        events.clarification_request(
            agent_cfg["name"],
            agent_cfg["role"],
            decision["clarification_question"],
            decision["clarification_why"],
            current_round,
        )
        update.update({
            "pending_clarification": clarification,
            "current_agent_draft": None,
            "current_agent_tokens": 0,
        })
    else:
        update.update({
            "pending_clarification": None,
            "current_agent_draft": decision["response"],
            "current_agent_tokens": tokens,
        })

    return update


# ── agent_clarify_node ─────────────────────────────────────────────────────────

def agent_clarify_node(state: DiscussionState) -> dict:
    """
    Pauses graph execution to collect a clarification answer from the user.

    interrupt() is the FIRST operation — only a state read precedes it, which is
    idempotent on resume. Code after interrupt() runs only on resume, so the
    clarification_history record is written exactly once.
    """
    pending: ClarificationRequest = state["pending_clarification"]

    # Pause: graph suspends here. On resume, user_answer is Command(resume=...) value.
    user_answer: str = interrupt(pending)

    # Only executes on resume:
    record: ClarificationRecord = {
        "agent_name": pending["agent_name"],
        "agent_role": pending["agent_role"],
        "question": pending["question"],
        "why_it_matters": pending["why_it_matters"],
        "answer": user_answer,
        "round": pending["round"],
    }
    events.clarification_answer(
        pending["agent_name"],
        pending["question"],
        user_answer,
        pending["round"],
    )
    return {
        "pending_clarification": None,
        "clarification_answer": user_answer,
        "clarification_history": [record],
    }


# ── agent_commit_node ──────────────────────────────────────────────────────────

def agent_commit_node(state: DiscussionState) -> dict:
    """
    Finalizes the agent's response and commits it to the transcript.

    If a clarification answer is present, makes a second LLM call that weaves
    the Q&A into the reasoning before completing the response. Otherwise uses
    the draft produced by agent_decide directly.
    """
    agent_idx = state["current_agent_index"]
    agent_cfg = state["agents_config"][agent_idx]
    current_round = state["current_round"]
    clarification_answer = state.get("clarification_answer")

    if clarification_answer:
        content, tokens = _finalize_with_clarification(agent_cfg, state, clarification_answer)
    else:
        content = state["current_agent_draft"] or ""
        tokens = state.get("current_agent_tokens", 0)

    model = agent_cfg.get("model", "gpt-5.4")
    resp: AgentResponse = {
        "agent_name": agent_cfg["name"],
        "role": agent_cfg["role"],
        "content": content,
        "round": current_round,
    }
    events.agent_response(agent_cfg["name"], agent_cfg["role"], content, current_round, model, tokens)

    return {
        "responses": [resp],
        "current_agent_index": agent_idx + 1,
        "current_agent_draft": None,
        "current_agent_tokens": 0,
        "clarification_answer": None,
    }


# ── Finalization helper ────────────────────────────────────────────────────────

def _finalize_with_clarification(
    agent_cfg: AgentConfig,
    state: DiscussionState,
    user_answer: str,
) -> tuple[str, int]:
    """Second LLM call: completes the agent's response after clarification."""
    total_rounds = state["discussion_rounds"]
    current_round = state["current_round"]
    phase = _round_phase(current_round, total_rounds)
    framing = state["framing"]

    # Find the clarification record for this agent in this round
    # (most recent pending_clarification was cleared, so read from clarification_history)
    pending = state.get("pending_clarification")  # already cleared, fallback to history
    if pending is None:
        # Read from clarification_history (last record for this agent)
        history = state.get("clarification_history") or []
        matching = [
            r for r in history
            if r["agent_name"] == agent_cfg["name"] and r["round"] == current_round
        ]
        record = matching[-1] if matching else None
        clarification_question = record["question"] if record else "(question unavailable)"
        clarification_why = record["why_it_matters"] if record else ""
    else:
        clarification_question = pending["question"]
        clarification_why = pending["why_it_matters"]

    questions_block = "\n".join(f"{i+1}. {q}" for i, q in enumerate(framing["questions"]))
    decision_log_block = (
        "\n".join(f"- {d}" for d in state["decision_log"])
        if state["decision_log"]
        else "(No decisions settled yet.)"
    )
    open_items_block = (
        "\n".join(f"{i+1}. {item}" for i, item in enumerate(state["open_items"]))
        if state["open_items"]
        else "(No active items yet.)"
    )
    round_responses_so_far = [r for r in state["responses"] if r["round"] == current_round]
    current_round_block = _build_current_round(round_responses_so_far)
    agent_positions_block = _build_agent_positions(state["responses"], agent_cfg["name"])
    prior_rounds_block = _build_prior_rounds(state["round_summaries"])

    system_msg = SystemMessage(
        content=_SYSTEM_TMPL.format(
            name=agent_cfg["name"],
            role=agent_cfg["role"],
            persona=agent_cfg["persona"],
        )
    )
    human_msg = HumanMessage(
        content=_HUMAN_FINALIZE_TMPL.format(
            definition=framing["definition"],
            questions=questions_block,
            decision_log_block=decision_log_block,
            open_items_block=open_items_block,
            prior_rounds_block=prior_rounds_block,
            current_round_block=current_round_block,
            agent_positions_block=agent_positions_block,
            current_round=current_round,
            total_rounds=total_rounds,
            phase_label=_PHASE_LABELS[phase],
            round_guidance=_PHASE_GUIDANCE[phase],
            clarification_question=clarification_question,
            clarification_why=clarification_why,
            user_answer=user_answer,
        )
    )

    model = agent_cfg.get("model", "gpt-5.4")
    llm = get_llm(model, temperature=0.8)
    result = llm.invoke([system_msg, human_msg])
    content = result.content
    tokens = (getattr(result, "usage_metadata", None) or {}).get("total_tokens", 0)
    return content, tokens


# ── Parsing ────────────────────────────────────────────────────────────────────

def _parse_decision(raw: str) -> dict:
    """Parse the LLM's JSON decision. Falls back to treating the output as a direct response."""
    try:
        text = raw.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1] if "\n" in text else text[3:]
            text = text.rsplit("```", 1)[0].strip()
        data = json.loads(text)
        if not isinstance(data.get("needs_clarification"), bool):
            raise ValueError("missing needs_clarification")

        if data["needs_clarification"]:
            q = str(data.get("clarification_question") or "").strip()
            why = str(data.get("clarification_why") or "").strip()
            if q:
                return {
                    "needs_clarification": True,
                    "clarification_question": q,
                    "clarification_why": why or "Ambiguity affects my analysis.",
                    "response": None,
                }
        else:
            response = str(data.get("response") or "").strip()
            if response:
                return {"needs_clarification": False, "response": response,
                        "clarification_question": None, "clarification_why": None}
    except (json.JSONDecodeError, ValueError, AttributeError):
        pass

    # Fallback: treat the raw output as the agent's response
    return {
        "needs_clarification": False,
        "response": raw.strip() or "(no response)",
        "clarification_question": None,
        "clarification_why": None,
    }


# ── Context block builders ─────────────────────────────────────────────────────

def _round_phase(current: int, total: int) -> str:
    if total == 1 or current == total:
        return "converge"
    if current <= max(1, total // 3):
        return "explore"
    return "deepen"


def _build_prior_rounds(summaries: list[RoundSummary]) -> str:
    if not summaries:
        return "(No prior rounds.)"
    parts = []
    for rs in summaries:
        parts.append(f"### Round {rs['round']} Summary\n{rs['summary']}")
    return "\n\n".join(parts)


def _build_current_round(responses: list[AgentResponse]) -> str:
    if not responses:
        return "(You are the first to speak this round.)"
    parts = []
    for r in responses:
        parts.append(f"**{r['agent_name']} ({r['role']}):**\n{r['content']}")
    return "\n\n".join(parts)


def _build_agent_positions(all_responses: list[AgentResponse], agent_name: str) -> str:
    own = [r for r in all_responses if r["agent_name"] == agent_name]
    if not own:
        return "(You have not spoken in previous rounds.)"
    parts = []
    for r in own:
        parts.append(f"Round {r['round']}:\n{r['content']}")
    return "\n\n---\n\n".join(parts)
