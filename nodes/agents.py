"""
Participant agents node — runs each user-defined agent sequentially within a round.
Later agents in the same round see earlier agents' responses, enabling true deliberation.

Inter-round context uses round summaries + structured artifacts (decision log, open items)
instead of raw history, keeping context lean and signal high across long deliberations.
"""
from langchain_core.messages import SystemMessage, HumanMessage

import events
from models import get_llm
from state import AgentConfig, AgentResponse, DiscussionState, RoundSummary

_SYSTEM_TMPL = """\
You are {name}, a {role} participating in a structured deliberation session.

Persona: {persona}

Your contribution style:
- Be specific and concrete. Avoid platitudes.
- Ground every claim in your role's domain expertise.
- Build on or respectfully challenge what others have said — don't just repeat.
- Limit your response to 3–5 focused paragraphs.
- Write in English.
"""

_HUMAN_TMPL = """\
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
Contribute your perspective. Address at least two active agenda items directly. \
If you agree with a settled conclusion, build on it rather than restating it. \
If you disagree with an active agenda item's framing, say so and explain why. \
If others in this round have raised good points, acknowledge and build on them.
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


def run_agents_node(state: DiscussionState) -> dict:
    current_round = state["current_round"] + 1
    total_rounds = state["discussion_rounds"]
    framing = state["framing"]
    definition = framing["definition"]
    questions_block = "\n".join(f"{i+1}. {q}" for i, q in enumerate(framing["questions"]))

    phase = _round_phase(current_round, total_rounds)
    round_guidance = _PHASE_GUIDANCE[phase]
    phase_label = _PHASE_LABELS[phase]

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
    prior_rounds_block = _build_prior_rounds(state["round_summaries"])

    events.round_start(current_round)

    new_responses: list[AgentResponse] = []

    for agent_cfg in state["agents_config"]:
        events.agent_thinking(agent_cfg["name"], agent_cfg["role"])

        current_round_block = _build_current_round(new_responses)
        agent_positions_block = _build_agent_positions(state["responses"], agent_cfg["name"])

        system_msg = SystemMessage(
            content=_SYSTEM_TMPL.format(
                name=agent_cfg["name"],
                role=agent_cfg["role"],
                persona=agent_cfg["persona"],
            )
        )
        human_msg = HumanMessage(
            content=_HUMAN_TMPL.format(
                definition=definition,
                questions=questions_block,
                decision_log_block=decision_log_block,
                open_items_block=open_items_block,
                prior_rounds_block=prior_rounds_block,
                current_round_block=current_round_block,
                agent_positions_block=agent_positions_block,
                current_round=current_round,
                total_rounds=total_rounds,
                phase_label=phase_label,
                round_guidance=round_guidance,
            )
        )

        model = agent_cfg.get("model", "gpt-5.4")
        llm = get_llm(model, temperature=0.8)
        result = llm.invoke([system_msg, human_msg])
        content = result.content
        tokens = (getattr(result, "usage_metadata", None) or {}).get("total_tokens", 0)

        resp: AgentResponse = {
            "agent_name": agent_cfg["name"],
            "role": agent_cfg["role"],
            "content": content,
            "round": current_round,
        }
        new_responses.append(resp)
        events.agent_response(agent_cfg["name"], agent_cfg["role"], content, current_round, model, tokens)

    events.round_end(current_round)

    return {
        "responses": new_responses,
        "current_round": current_round,
    }


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
