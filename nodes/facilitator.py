"""
Facilitator node — refines the topic into a definition and 3-5 key questions.
"""
import json
from langchain_core.messages import SystemMessage, HumanMessage

import events
from models import FACILITATOR_MODEL, get_facilitator_llm
from state import DiscussionState

_SYSTEM = """\
You are an expert deliberation facilitator. Your job is to frame a topic so that a group of \
diverse agents can hold a structured, productive discussion, and to identify what kind of \
deliverable the session should ultimately produce.

Rules:
- Keep the definition concrete and specific (2–3 sentences). Avoid vague abstractions.
- Write 3–5 key questions that, if answered, would constitute a complete and actionable result.
- Questions must be mutually non-overlapping and ordered from foundational to applied.
- Determine the output_type that best describes the deliverable this session should produce.
- Never use jargon without definition.
- Respond ONLY with a valid JSON object — no markdown fences, no commentary.

Output types — choose the best fit:
- "content"          : session goal is to produce finished written content (article, blog post, \
ad copy, script, social post, email, etc.)
- "technical_report" : session goal is a technical document (ADR, design doc, system design, \
technical decision memo, engineering spec)
- "product_spec"     : session goal is a product or UX specification (PRD, feature brief, \
design brief, user-story map)
- "strategy"         : session goal is a strategic plan (marketing strategy, SEO plan, \
go-to-market, campaign plan, content strategy)
- "decision_brief"   : session goal is a concise recommendation for a specific decision or \
course of action
- "general"          : none of the above — use generic deliberation synthesis

Output schema:
{
  "definition": "<crisp topic definition>",
  "questions": ["<q1>", "<q2>", "<q3>"],
  "output_type": "<one of the six types above>"
}
"""


def facilitator_node(state: DiscussionState) -> dict:
    llm = get_facilitator_llm()

    messages = [
        SystemMessage(content=_SYSTEM),
        HumanMessage(content=f"Topic submitted by the user:\n\n{state['topic']}"),
    ]

    result = llm.invoke(messages)
    raw = result.content
    tokens = (getattr(result, "usage_metadata", None) or {}).get("total_tokens", 0)
    framing = _parse(raw, state["topic"])

    # User-selected mode takes precedence over auto-detection.
    if state.get("output_type") and state["output_type"] in _VALID_OUTPUT_TYPES:
        framing["output_type"] = state["output_type"]

    events.facilitator_framing(
        framing["definition"], framing["questions"], framing["output_type"], FACILITATOR_MODEL, tokens
    )

    return {"framing": framing}


_VALID_OUTPUT_TYPES = {
    "content", "technical_report", "product_spec", "strategy", "decision_brief", "general"
}


def _parse(raw: str, fallback_topic: str) -> dict:
    try:
        data = json.loads(raw)
        if "definition" in data and "questions" in data:
            data["questions"] = data["questions"][:5]
            if data.get("output_type") not in _VALID_OUTPUT_TYPES:
                data["output_type"] = "general"
            return data
    except (json.JSONDecodeError, KeyError):
        pass

    return {
        "definition": fallback_topic,
        "questions": [
            "What is the core problem or opportunity?",
            "What constraints or requirements must the solution satisfy?",
            "What does success look like?",
        ],
        "output_type": "general",
    }
