"""
Streaming NDJSON event emitter for opentui.
Each call prints one JSON line to stdout.
"""
import json
import sys
from datetime import datetime

# UI labels for opentui rendering
_UI = {
    "session_start":       "◆ session init",
    "facilitator_framing": "⬡ framing",
    "round_start":         "▶ round",
    "agent_thinking":      "⠿ thinking",
    "agent_response":      "  response",
    "round_end":           "■ round complete",
    "round_extraction":    "⊛ extracting",
    "review":              "⊹ review",
    "synthesis":           "◈ synthesis",
    "session_end":         "◆ session end",
    "error":               "✗ error",
}


def _emit(payload: dict) -> None:
    payload["ts"] = datetime.utcnow().isoformat()
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def session_start(topic: str, agents: list, discussion_rounds: int) -> None:
    _emit({
        "type": "session_start",
        "topic": topic,
        "agents": [{"name": a["name"], "role": a["role"], "model": a["model"]} for a in agents],
        "discussion_rounds": discussion_rounds,
        "ui": {"label": _UI["session_start"], "topic_label": "Topic", "agents_label": "Members"},
    })


def facilitator_framing(definition: str, questions: list, output_type: str = "general") -> None:
    _emit({
        "type": "facilitator_framing",
        "definition": definition,
        "questions": questions,
        "output_type": output_type,
        "ui": {
            "label": _UI["facilitator_framing"],
            "definition_label": "Definition",
            "questions_label": "Key Questions",
            "output_type_label": "Output Type",
        },
    })


def round_start(round_num: int) -> None:
    _emit({
        "type": "round_start",
        "round": round_num,
        "ui": {"label": f"{_UI['round_start']} {round_num}"},
    })


def agent_thinking(agent_name: str, role: str) -> None:
    _emit({
        "type": "agent_thinking",
        "agent": agent_name,
        "role": role,
        "ui": {"label": f"{agent_name} — {_UI['agent_thinking']}"},
    })


def agent_response(agent_name: str, role: str, content: str, round_num: int) -> None:
    _emit({
        "type": "agent_response",
        "agent": agent_name,
        "role": role,
        "content": content,
        "round": round_num,
        "ui": {"label": f"{_UI['agent_response']}: {agent_name}", "role_label": role},
    })


def round_end(round_num: int) -> None:
    _emit({
        "type": "round_end",
        "round": round_num,
        "ui": {"label": f"Final Round {round_num}"},
    })


def round_extraction(
    round_num: int,
    summary: str,
    decisions_added: list,
    items_resolved: list,
    items_added: list,
    open_items: list,
) -> None:
    _emit({
        "type": "round_extraction",
        "round": round_num,
        "summary": summary,
        "decisions_added": decisions_added,
        "items_resolved": items_resolved,
        "items_added": items_added,
        "open_items": open_items,
        "ui": {
            "label": f"{_UI['round_extraction']} round {round_num}",
            "summary_label": "Round Summary",
            "decisions_label": "Decisions Reached",
            "open_items_label": "Active Tensions & Questions",
        },
    })


def review(decision: str, reason: str, round_num: int) -> None:
    decision_fa = "Continue" if decision == "continue" else "Synthesis"
    _emit({
        "type": "review",
        "decision": decision,
        "reason": reason,
        "round": round_num,
        "ui": {
            "label": _UI["review"],
            "decision_label": decision_fa,
            "reason_label": "Reason",
        },
    })


def synthesis(output: dict) -> None:
    _emit({
        "type": "synthesis",
        **output,
        "ui": {
            "label": _UI["synthesis"],
            "output_type_label": "output type",
            "deliverable_label": "deliverable",
            "summary_label": "summary",
            "key_decisions_label": "key decisions",
            "open_questions_label": "open questions",
        },
    })


def session_end(total_rounds: int) -> None:
    _emit({
        "type": "session_end",
        "total_rounds": total_rounds,
        "ui": {"label": _UI["session_end"], "rounds_label": f"Rounds: {total_rounds}"},
    })


def error(message: str) -> None:
    _emit({"type": "error", "message": message, "ui": {"label": _UI["error"]}})
