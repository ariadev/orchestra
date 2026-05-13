"""
Facilitator node — refines the topic into a definition and 3-5 key questions.
"""
import json
from langchain_core.messages import SystemMessage, HumanMessage

import events
from models import get_facilitator_llm
from state import DiscussionState

_SYSTEM = """\
You are an expert deliberation facilitator. Your job is to frame a topic so that a group of \
diverse agents can hold a structured, productive discussion.

Rules:
- Keep the definition concrete and specific (2–3 sentences). Avoid vague abstractions.
- Write 3–5 key questions that, if answered, would constitute a complete and actionable result.
- Questions must be mutually non-overlapping and ordered from foundational to applied.
- Never use jargon without definition.
- Respond ONLY with a valid JSON object — no markdown fences, no commentary.

Output schema:
{
  "definition": "<crisp topic definition>",
  "questions": ["<q1>", "<q2>", "<q3>"]
}
"""


def facilitator_node(state: DiscussionState) -> dict:
    llm = get_facilitator_llm()

    messages = [
        SystemMessage(content=_SYSTEM),
        HumanMessage(content=f"Topic submitted by the user:\n\n{state['topic']}"),
    ]

    raw = llm.invoke(messages).content
    framing = _parse(raw, state["topic"])

    events.facilitator_framing(framing["definition"], framing["questions"])

    return {"framing": framing}


def _parse(raw: str, fallback_topic: str) -> dict:
    try:
        data = json.loads(raw)
        if "definition" in data and "questions" in data:
            data["questions"] = data["questions"][:5]  # cap at 5
            return data
    except (json.JSONDecodeError, KeyError):
        pass

    # Graceful fallback — should not happen with capable models.
    return {
        "definition": fallback_topic,
        "questions": [
            "What is the core problem or opportunity?",
            "What constraints or requirements must the solution satisfy?",
            "What does success look like?",
        ],
    }
