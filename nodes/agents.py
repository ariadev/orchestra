"""
Participant agents node — runs each user-defined agent sequentially within a round.
Later agents in the same round see earlier agents' responses, enabling true deliberation.
"""
from langchain_core.messages import SystemMessage, HumanMessage

import events
from models import get_llm
from state import AgentConfig, AgentResponse, DiscussionState

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
## Topic definition
{definition}

## Key questions the discussion must answer
{questions}

## Discussion so far (previous rounds + current round)
{prior}

## Your turn
Contribute your perspective. Address at least two of the key questions directly. \
If others have raised good points, acknowledge and build on them. \
If you disagree, say so clearly and explain why.
"""


def run_agents_node(state: DiscussionState) -> dict:
    current_round = state["current_round"] + 1
    framing = state["framing"]
    definition = framing["definition"]
    questions_block = "\n".join(f"{i+1}. {q}" for i, q in enumerate(framing["questions"]))

    events.round_start(current_round)

    new_responses: list[AgentResponse] = []

    for agent_cfg in state["agents_config"]:
        events.agent_thinking(agent_cfg["name"], agent_cfg["role"])

        prior_block = _build_prior(state["responses"], new_responses)

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
                prior=prior_block or "(No prior discussion — you are the first to speak.)",
            )
        )

        llm = get_llm(agent_cfg.get("model", "gpt-5.4"), temperature=0.8)
        content = llm.invoke([system_msg, human_msg]).content

        resp: AgentResponse = {
            "agent_name": agent_cfg["name"],
            "role": agent_cfg["role"],
            "content": content,
            "round": current_round,
        }
        new_responses.append(resp)
        events.agent_response(agent_cfg["name"], agent_cfg["role"], content, current_round)

    events.round_end(current_round)

    return {
        "responses": new_responses,
        "current_round": current_round,
    }


def _build_prior(
    all_previous: list[AgentResponse],
    current_round_so_far: list[AgentResponse],
) -> str:
    """Format all past responses plus those already collected in the current round."""
    combined = all_previous + current_round_so_far
    if not combined:
        return ""

    lines: list[str] = []
    current_r = None
    for r in combined:
        if r["round"] != current_r:
            current_r = r["round"]
            lines.append(f"\n### Round {current_r}\n")
        lines.append(f"**{r['agent_name']} ({r['role']}):**\n{r['content']}\n")

    return "\n".join(lines).strip()
