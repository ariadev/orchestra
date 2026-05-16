"""
Round extractor node — runs after each deliberation round.

Reads the raw agent responses for the completed round and produces:
  - A compact round summary (replaces raw text in subsequent rounds)
  - New settled decisions to append to the decision log
  - An updated open items list (resolved items drop off, new ones added)

This is the core of the inter-round memory architecture. Subsequent agents
receive summaries + structured artifacts instead of the full raw transcript.
"""
import json
from langchain_core.messages import SystemMessage, HumanMessage

import events
from models import get_extractor_llm
from state import AgentResponse, DiscussionState, RoundSummary

_SYSTEM = """\
You are a deliberation analyst. You have just observed one round of a structured multi-agent \
deliberation session. Your job is to extract a compact structured record of what happened for \
use in subsequent rounds.

Rules:
- summary: 3-4 sentences. Capture what was argued, what shifted, what emerged, what remains \
contested. Write in past tense. Be specific — name the agents and positions. Discard pleasantries.
- decisions: Only conclusions the agents clearly converged on. If something is still contested, \
it is NOT a decision. Do not duplicate items already in the decision log. Return an empty list \
if nothing was settled.
- open_items: The complete updated list of unresolved tensions and questions. Remove items from \
the previous list that were answered or dissolved this round. Add genuinely new unresolved \
tensions or questions. Keep each item as one precise sentence. Limit to the 6 most important items.
- Respond ONLY with valid JSON — no markdown fences, no commentary.

Output schema:
{
  "summary": "<3-4 sentence round digest>",
  "decisions": ["<new settled conclusion>", ...],
  "open_items": ["<unresolved tension or question>", ...]
}
"""

_HUMAN_TMPL = """\
## Topic
{definition}

## Key questions
{questions}

## Current decision log (do not duplicate these)
{decision_log_block}

## Current open items (update this list — resolve answered ones, add new ones)
{open_items_block}

## Round {round_num} agent responses
{responses_block}

Extract the structured round record now.
"""


def round_extractor_node(state: DiscussionState) -> dict:
    current_round = state["current_round"]
    events.round_end(current_round)
    framing = state["framing"]

    round_responses = [r for r in state["responses"] if r["round"] == current_round]

    decision_log_block = (
        "\n".join(f"- {d}" for d in state["decision_log"])
        if state["decision_log"]
        else "(none yet)"
    )
    open_items_block = (
        "\n".join(f"- {item}" for item in state["open_items"])
        if state["open_items"]
        else "(none yet)"
    )
    responses_block = _format_responses(round_responses)

    questions_block = "\n".join(
        f"{i+1}. {q}" for i, q in enumerate(framing["questions"])
    )

    llm = get_extractor_llm()
    messages = [
        SystemMessage(content=_SYSTEM),
        HumanMessage(
            content=_HUMAN_TMPL.format(
                definition=framing["definition"],
                questions=questions_block,
                decision_log_block=decision_log_block,
                open_items_block=open_items_block,
                round_num=current_round,
                responses_block=responses_block,
            )
        ),
    ]

    raw = llm.invoke(messages).content
    extracted = _parse(raw)

    previous_items = set(state["open_items"])
    new_items = set(extracted["open_items"])
    items_resolved = sorted(previous_items - new_items)
    items_added = sorted(new_items - previous_items)

    summary: RoundSummary = {
        "round": current_round,
        "summary": extracted["summary"],
        "decisions_added": extracted["decisions"],
        "items_resolved": items_resolved,
        "items_added": items_added,
    }

    events.round_extraction(
        round_num=current_round,
        summary=extracted["summary"],
        decisions_added=extracted["decisions"],
        items_resolved=items_resolved,
        items_added=items_added,
        open_items=extracted["open_items"],
    )

    return {
        "round_summaries": [summary],
        "decision_log": extracted["decisions"],
        "open_items": extracted["open_items"],
        "current_agent_index": 0,  # reset for next round
    }


def _format_responses(responses: list[AgentResponse]) -> str:
    if not responses:
        return "(no responses)"
    lines = []
    for r in responses:
        lines.append(f"[{r['agent_name']} — {r['role']}]\n{r['content']}")
    return "\n\n---\n\n".join(lines)


def _parse(raw: str) -> dict:
    try:
        text = raw.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1] if "\n" in text else text[3:]
            text = text.rsplit("```", 1)[0].strip()
        data = json.loads(text)
        if "summary" in data and "decisions" in data and "open_items" in data:
            return {
                "summary": str(data["summary"]),
                "decisions": [str(d) for d in data.get("decisions", [])],
                "open_items": [str(i) for i in data.get("open_items", [])],
            }
    except (json.JSONDecodeError, KeyError, ValueError):
        pass

    return {"summary": raw[:500] if raw else "(extraction failed)", "decisions": [], "open_items": []}
