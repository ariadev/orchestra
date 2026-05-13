"""
Facilitator Review node — decides whether to run another round or move to synthesis.

Preference: synthesize when the discussion is coherent, non-repetitive, and specific.
Only continue if another round will materially improve the result.
"""
import json
from langchain_core.messages import SystemMessage, HumanMessage

import events
from models import get_reviewer_llm
from state import DiscussionState

_SYSTEM = """\
You are the facilitator review agent for a structured AI deliberation session.

Your ONLY job is to decide: does this discussion need another round, or is it ready for synthesis?

## Decision criteria

Synthesize (preferred) when ALL of the following hold:
1. The topic definition and key questions are fully addressed.
2. Agent responses show meaningful convergence or productive divergence — not repetition.
3. The material is specific enough that a synthesis agent could produce actionable output.
4. Another round is unlikely to add substantively new perspectives.

Continue only when at least ONE of the following is true:
1. Key questions remain entirely unaddressed.
2. Responses so far are too vague or abstract for actionable synthesis.
3. A clear and important perspective is missing that another round would surface.
4. There is unresolved confusion that a follow-up round could clarify.

Do NOT continue just because more could be said. Prefer synthesis over verbosity.

Respond ONLY with a valid JSON object — no markdown, no commentary:
{
  "decision": "synthesize" | "continue",
  "reason": "<one concise sentence explaining the decision>"
}
"""

_HUMAN_TMPL = """\
## Topic definition
{definition}

## Key questions
{questions}

## Full discussion transcript
{transcript}

## Round info
Current round: {current_round} of {max_rounds}

Evaluate the discussion and return your decision.
"""


def reviewer_node(state: DiscussionState) -> dict:
    framing = state["framing"]
    questions_block = "\n".join(f"{i+1}. {q}" for i, q in enumerate(framing["questions"]))
    transcript = _build_transcript(state["responses"])

    llm = get_reviewer_llm()
    messages = [
        SystemMessage(content=_SYSTEM),
        HumanMessage(
            content=_HUMAN_TMPL.format(
                definition=framing["definition"],
                questions=questions_block,
                transcript=transcript,
                current_round=state["current_round"],
                max_rounds=state["max_rounds"],
            )
        ),
    ]

    raw = llm.invoke(messages).content
    parsed = _parse(raw)
    decision = parsed["decision"]
    reason = parsed["reason"]

    # Force synthesize if we've hit the round cap.
    if state["current_round"] >= state["max_rounds"] and decision == "continue":
        decision = "synthesize"
        reason = f"Maximum rounds ({state['max_rounds']}) reached. " + reason

    review_record = {
        "decision": decision,
        "reason": reason,
        "round": state["current_round"],
    }

    events.review(decision, reason, state["current_round"])

    return {
        "review_decisions": [review_record],
        "should_continue": decision == "continue",
    }


def _parse(raw: str) -> dict:
    try:
        data = json.loads(raw)
        if data.get("decision") in ("continue", "synthesize"):
            return data
    except (json.JSONDecodeError, KeyError):
        pass
    return {"decision": "synthesize", "reason": "Could not parse reviewer output; defaulting to synthesis."}


def _build_transcript(responses: list) -> str:
    if not responses:
        return "(empty)"
    lines: list[str] = []
    current_r = None
    for r in responses:
        if r["round"] != current_r:
            current_r = r["round"]
            lines.append(f"\n=== Round {current_r} ===\n")
        lines.append(f"[{r['agent_name']} — {r['role']}]\n{r['content']}\n")
    return "\n".join(lines).strip()
