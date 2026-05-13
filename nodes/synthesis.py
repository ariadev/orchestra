"""
Synthesis node — final agent that merges all rounds into a structured, de-duplicated output.
"""
import json
from langchain_core.messages import SystemMessage, HumanMessage

import events
from models import get_synthesis_llm
from state import DiscussionState, SynthesisOutput

_SYSTEM = """\
You are the synthesis agent for a multi-round AI deliberation session.

Your task:
1. Read the full discussion transcript across all rounds.
2. Identify the strongest, most specific ideas — discard repetition and filler.
3. Capture where agents agreed (convergence) and where they disagreed productively (divergence).
4. Produce crisp, actionable recommendations grounded in the discussion.
5. Surface any important questions that remain open.

Quality bar:
- Every bullet must be concrete and specific — no abstract generalities.
- Remove redundancy ruthlessly. If two agents said the same thing, list it once.
- The executive summary must stand alone as a 3–5 sentence brief.
- Write in English.

Respond ONLY with a valid JSON object:
{
  "executive_summary": "<3–5 sentence brief>",
  "key_insights": ["<insight 1>", "<insight 2>", ...],
  "convergence_points": ["<agreement 1>", ...],
  "divergence_points": ["<disagreement or tension 1>", ...],
  "recommendations": ["<actionable recommendation 1>", ...],
  "open_questions": ["<unresolved question 1>", ...]
}
"""

_HUMAN_TMPL = """\
## Topic definition
{definition}

## Key questions the discussion aimed to answer
{questions}

## Full discussion transcript ({total_rounds} round(s), {num_agents} agent(s))
{transcript}

## Facilitator review decisions
{review_decisions}

Synthesize the above into a structured output.
"""


def synthesis_node(state: DiscussionState) -> dict:
    framing = state["framing"]
    questions_block = "\n".join(f"{i+1}. {q}" for i, q in enumerate(framing["questions"]))
    transcript = _build_transcript(state["responses"])
    review_block = _build_reviews(state["review_decisions"])

    llm = get_synthesis_llm()
    messages = [
        SystemMessage(content=_SYSTEM),
        HumanMessage(
            content=_HUMAN_TMPL.format(
                definition=framing["definition"],
                questions=questions_block,
                transcript=transcript,
                review_decisions=review_block,
                total_rounds=state["current_round"],
                num_agents=len(state["agents_config"]),
            )
        ),
    ]

    raw = llm.invoke(messages).content
    output: SynthesisOutput = _parse(raw)

    events.synthesis(output)
    events.session_end(state["current_round"])

    return {"synthesis": output}


def _parse(raw: str) -> SynthesisOutput:
    try:
        data = json.loads(raw)
        required = {"executive_summary", "key_insights", "convergence_points",
                    "divergence_points", "recommendations", "open_questions"}
        if required.issubset(data.keys()):
            return data
    except (json.JSONDecodeError, KeyError):
        pass

    return {
        "executive_summary": raw[:500] if raw else "Synthesis failed.",
        "key_insights": [],
        "convergence_points": [],
        "divergence_points": [],
        "recommendations": [],
        "open_questions": [],
    }


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


def _build_reviews(decisions: list) -> str:
    if not decisions:
        return "(none)"
    return "\n".join(
        f"After round {d['round']}: {d['decision'].upper()} — {d['reason']}"
        for d in decisions
    )
