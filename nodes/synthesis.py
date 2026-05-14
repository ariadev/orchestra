"""
Synthesis node — produces the final deliverable from the deliberation transcript.

The output type is determined by the facilitator. Each type has its own system prompt
so the synthesis writes an actual artifact (finished content, spec, report, etc.)
rather than generic meeting notes.
"""
import json
from langchain_core.messages import SystemMessage, HumanMessage

import events
from models import SYNTHESIS_MODEL, get_synthesis_llm
from state import DiscussionState, SynthesisOutput

# ------------------------------------------------------------------
# Shared output schema instruction appended to every type-specific prompt
# ------------------------------------------------------------------
_SCHEMA_INSTRUCTION = """
Respond ONLY with a valid JSON object — no markdown fences, no commentary:
{
  "output_type": "<same type as instructed>",
  "deliverable": "<the artifact in full, formatted in Markdown>",
  "summary": "<2–3 sentences describing what was produced and the key choices made>",
  "key_decisions": ["<decision 1>", "<decision 2>", ...],
  "open_questions": ["<unresolved issue 1>", ...]
}

Rules for all types:
- "deliverable" is the primary output — the actual artifact, not a summary of a discussion.
- Write "deliverable" in clean Markdown with proper headings, lists, and structure.
- "key_decisions" captures notable choices made during deliberation (3–6 bullets, specific).
- "open_questions" lists only genuinely unresolved issues that need follow-up (omit if none).
- "summary" stands alone as a brief description of the artifact and how it was shaped.
"""

# ------------------------------------------------------------------
# Type-specific system prompts
# ------------------------------------------------------------------
_SYSTEM_CONTENT = """\
You are the synthesis agent for a content-creation deliberation session.
Your role team deliberated on what to write, how to structure it, what angle to take, \
and what key messages to include. Now you must write the actual finished piece.

Your task:
1. Read the full transcript to understand the agreed structure, angle, tone, and key points.
2. Write the complete, publish-ready content in "deliverable" — the full article, ad copy, \
script, social post, email, or whatever form fits the topic.
3. The content should reflect the strongest ideas from the deliberation, not summarise them.
4. Match the tone and register the team converged on (professional, casual, persuasive, etc.).
5. Do NOT describe what the content should contain — write the content itself.
""" + _SCHEMA_INSTRUCTION

_SYSTEM_TECHNICAL_REPORT = """\
You are the synthesis agent for a technical deliberation session.
Your role team deliberated on a technical problem, design choice, or architecture decision. \
Now you must produce the technical document.

Your task:
1. Read the full transcript and extract the agreed design, decision, or recommendation.
2. Write a complete technical document in "deliverable" with these sections (as relevant):
   ## Background & Problem Statement
   ## Proposed Solution / Decision
   ## Alternatives Considered
   ## Trade-offs & Risks
   ## Implementation Guidance
   ## References & Prior Art
3. Be precise and concrete — use specific names, interfaces, constraints, and numbers where available.
4. Surface unresolved technical questions in "open_questions".
""" + _SCHEMA_INSTRUCTION

_SYSTEM_PRODUCT_SPEC = """\
You are the synthesis agent for a product specification deliberation session.
Your role team deliberated on a product idea, feature, or UX direction. \
Now you must produce the structured specification document.

Your task:
1. Read the full transcript and extract agreed requirements, constraints, and design direction.
2. Write a complete product/UX specification in "deliverable" with these sections (as relevant):
   ## Product Overview
   ## User Needs & Jobs-to-be-Done
   ## Features & Requirements
   ## UX & Design Considerations
   ## Out of Scope
   ## Success Metrics
   ## Open Questions
3. Write requirements as concrete, testable statements, not aspirations.
4. Capture UX principles and design decisions the team agreed on.
""" + _SCHEMA_INSTRUCTION

_SYSTEM_STRATEGY = """\
You are the synthesis agent for a strategy deliberation session.
Your role team deliberated on a strategic question — marketing, growth, content, go-to-market, \
SEO, or similar. Now you must produce the strategy document.

Your task:
1. Read the full transcript and extract the agreed strategic direction and tactics.
2. Write a complete strategy document in "deliverable" with these sections (as relevant):
   ## Situation & Context
   ## Objectives
   ## Target Audience
   ## Strategic Approach
   ## Key Tactics & Initiatives
   ## Measurement & Success Metrics
   ## Timeline & Priorities
3. Be specific — name channels, tactics, audiences, and measurable goals where possible.
4. Avoid generic strategy filler; every section must reflect what the team actually discussed.
""" + _SCHEMA_INSTRUCTION

_SYSTEM_DECISION_BRIEF = """\
You are the synthesis agent for a decision-making deliberation session.
Your role team deliberated on a specific decision. Now you must produce a crisp decision brief.

Your task:
1. Read the full transcript and identify the recommended course of action with its rationale.
2. Write a complete decision brief in "deliverable" with these sections:
   ## Decision
   ## Context & Background
   ## Options Considered
   ## Recommendation & Rationale
   ## Key Risks & Mitigations
   ## Next Steps
3. The "Decision" section must be a single, unambiguous statement of what is recommended.
4. Keep the brief tight — decision-makers should be able to read it in under 5 minutes.
""" + _SCHEMA_INSTRUCTION

_SYSTEM_GENERAL = """\
You are the synthesis agent for a multi-round AI deliberation session.

Your task:
1. Read the full discussion transcript across all rounds.
2. Identify the strongest, most specific ideas — discard repetition and filler.
3. Produce a well-structured synthesis document in "deliverable" that captures:
   - The key findings and conclusions
   - Areas of agreement and productive disagreement
   - Concrete, actionable recommendations
4. Write "deliverable" in clean Markdown — it should be useful on its own, not just a summary.
""" + _SCHEMA_INSTRUCTION

_SYSTEM_BY_TYPE = {
    "content":          _SYSTEM_CONTENT,
    "technical_report": _SYSTEM_TECHNICAL_REPORT,
    "product_spec":     _SYSTEM_PRODUCT_SPEC,
    "strategy":         _SYSTEM_STRATEGY,
    "decision_brief":   _SYSTEM_DECISION_BRIEF,
    "general":          _SYSTEM_GENERAL,
}

_HUMAN_TMPL = """\
## Output type
{output_type}

## Topic definition
{definition}

## Key questions the discussion aimed to answer
{questions}

## Settled decisions from deliberation
{decision_log_block}

## Unresolved items entering synthesis
{open_items_block}

## Full discussion transcript ({total_rounds} round(s), {num_agents} agent(s))
{transcript}

Produce the deliverable now.
"""


def synthesis_node(state: DiscussionState) -> dict:
    framing = state["framing"]
    output_type = framing.get("output_type", "general")
    system_prompt = _SYSTEM_BY_TYPE.get(output_type, _SYSTEM_GENERAL)

    questions_block = "\n".join(f"{i+1}. {q}" for i, q in enumerate(framing["questions"]))
    transcript = _build_transcript(state["responses"])

    decision_log_block = (
        "\n".join(f"- {d}" for d in state.get("decision_log", []))
        or "(No decisions were explicitly settled.)"
    )
    open_items_block = (
        "\n".join(f"- {item}" for item in state.get("open_items", []))
        or "(No unresolved items.)"
    )

    llm = get_synthesis_llm()
    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(
            content=_HUMAN_TMPL.format(
                output_type=output_type,
                definition=framing["definition"],
                questions=questions_block,
                decision_log_block=decision_log_block,
                open_items_block=open_items_block,
                transcript=transcript,
                total_rounds=state["current_round"],
                num_agents=len(state["agents_config"]),
            )
        ),
    ]

    result = llm.invoke(messages)
    raw = result.content
    tokens = (getattr(result, "usage_metadata", None) or {}).get("total_tokens", 0)
    output: SynthesisOutput = _parse(raw, output_type)

    events.synthesis(output, SYNTHESIS_MODEL, tokens)
    events.session_end(state["current_round"])

    return {"synthesis": output}


def _parse(raw: str, output_type: str) -> SynthesisOutput:
    try:
        # Strip markdown fences if the model wrapped the JSON anyway
        text = raw.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1] if "\n" in text else text[3:]
            text = text.rsplit("```", 1)[0].strip()
        data = json.loads(text)
        required = {"output_type", "deliverable", "summary", "key_decisions", "open_questions"}
        if required.issubset(data.keys()):
            return data
    except (json.JSONDecodeError, KeyError, ValueError):
        pass

    return {
        "output_type": output_type,
        "deliverable": raw if raw else "Synthesis failed.",
        "summary": "Synthesis output could not be parsed into structured form.",
        "key_decisions": [],
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


