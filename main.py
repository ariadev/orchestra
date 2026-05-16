#!/usr/bin/env python3
"""
Orchestra — multi-agent deliberation backend for opentui.

Input  (stdin):  one JSON object (see schema below)
Output (stdout): newline-delimited JSON events, one per line

Input schema:
{
  "topic": "string — the question or problem to deliberate on",
  "agents": [
    {
      "name":    "string — agent display name",
      "role":    "string — professional or functional role",
      "persona": "string — behavioural description / perspective",
      "model":   "gpt-5.4" | "gpt-5.4-mini" | "gpt-5.4-nano"   (default: gpt-5.4)
    }
  ],
  "discussion_rounds": 3,   (optional, default 3, max 5)
  "output_type": "general"  (optional, default "general")
}
"""
import json
import sys

from dotenv import load_dotenv

load_dotenv()

import events
from graph import build_graph
from models import AVAILABLE_MODELS
from state import DiscussionState


_DEFAULT_ROUNDS = 3
_MAX_ROUNDS_CAP = 5
_VALID_OUTPUT_TYPES = {
    "content", "technical_report", "product_spec", "strategy", "decision_brief", "general"
}


def _validate(cfg: dict) -> str | None:
    if not cfg.get("topic", "").strip():
        return "Field 'topic' is required and must be non-empty."
    agents = cfg.get("agents", [])
    if not agents:
        return "Field 'agents' must contain at least one agent."
    if len(agents) > 10:
        return "A maximum of 10 agents is supported."
    for i, a in enumerate(agents):
        for field in ("name", "role", "persona"):
            if not a.get(field, "").strip():
                return f"Agent {i}: field '{field}' is required."
        model = a.get("model", "gpt-5.4")
        if model not in AVAILABLE_MODELS:
            return (
                f"Agent {i}: unknown model '{model}'. "
                f"Choose from: {', '.join(AVAILABLE_MODELS)}."
            )
    return None


def main() -> None:
    raw = sys.stdin.read()
    try:
        cfg = json.loads(raw)
    except json.JSONDecodeError as exc:
        events.error(f"Invalid JSON input: {exc}")
        sys.exit(1)

    err = _validate(cfg)
    if err:
        events.error(err)
        sys.exit(1)

    topic: str = cfg["topic"].strip()
    agents_config: list = cfg["agents"]
    discussion_rounds: int = min(
        int(cfg.get("discussion_rounds", _DEFAULT_ROUNDS)),
        _MAX_ROUNDS_CAP,
    )
    output_type: str = cfg.get("output_type", "general")
    if output_type not in _VALID_OUTPUT_TYPES:
        output_type = "general"

    for a in agents_config:
        a.setdefault("model", "gpt-5.4")

    events.session_start(topic, agents_config, discussion_rounds)

    initial_state: DiscussionState = {
        "topic": topic,
        "agents_config": agents_config,
        "output_type": output_type,
        "framing": None,
        "responses": [],
        "current_round": 0,
        "discussion_rounds": discussion_rounds,
        "synthesis": None,
        "round_summaries": [],
        "decision_log": [],
        "open_items": [],
        "current_agent_index": 0,
        "current_agent_draft": None,
        "current_agent_tokens": 0,
        "pending_clarification": None,
        "clarification_answer": None,
        "clarification_history": [],
    }

    try:
        graph = build_graph()
        graph.invoke(initial_state)
    except Exception as exc:  # noqa: BLE001
        events.error(str(exc))
        sys.exit(1)


if __name__ == "__main__":
    main()
