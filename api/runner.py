from __future__ import annotations
import asyncio
import contextvars
import json
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from typing import AsyncGenerator

import events as ev_module
from graph import build_graph
from state import DiscussionState
from api import db

_executor = ThreadPoolExecutor(max_workers=10)

# Each entry: {"queue": Queue, "config": dict | None, "created_at": str}
_sessions: dict[str, dict] = {}

_VALID_OUTPUT_TYPES = {
    "content", "technical_report", "product_spec",
    "strategy", "decision_brief", "general",
}


def create_session() -> tuple[str, asyncio.Queue]:
    session_id = str(uuid.uuid4())
    queue: asyncio.Queue = asyncio.Queue()
    _sessions[session_id] = {
        "queue": queue,
        "config": None,
        "created_at": datetime.utcnow().isoformat(),
    }
    return session_id, queue


def session_exists(session_id: str) -> bool:
    return session_id in _sessions


async def start_session(session_id: str, config: dict) -> None:
    session = _sessions.get(session_id)
    if session is None:
        return
    session["config"] = config

    loop = asyncio.get_running_loop()

    async def _run() -> None:
        queue = session["queue"]
        token = ev_module._queue_ctx.set((queue, loop))
        ctx = contextvars.copy_context()
        try:
            await loop.run_in_executor(_executor, ctx.run, _execute_graph, config)
        finally:
            ev_module._queue_ctx.reset(token)
            await queue.put(None)

    asyncio.create_task(_run())


def _execute_graph(config: dict) -> None:
    topic: str = config["topic"].strip()
    agents_config: list = [dict(a) for a in config["agents"]]
    discussion_rounds: int = min(int(config.get("discussion_rounds", 3)), 5)
    output_type: str = config.get("output_type", "general")
    if output_type not in _VALID_OUTPUT_TYPES:
        output_type = "general"

    for a in agents_config:
        a.setdefault("model", "gpt-5.4")

    ev_module.session_start(topic, agents_config, discussion_rounds)

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
    }

    try:
        graph = build_graph()
        graph.invoke(initial_state)
    except Exception as exc:  # noqa: BLE001
        ev_module.error(str(exc))


async def stream_session(session_id: str) -> AsyncGenerator[str, None]:
    session = _sessions.get(session_id)
    if session is None:
        return

    queue = session["queue"]
    collected: list[str] = []
    final_status = "done"

    try:
        while True:
            item = await queue.get()
            if item is None:
                break
            collected.append(item)
            try:
                if json.loads(item).get("type") == "error":
                    final_status = "error"
            except Exception:
                pass
            yield f"data: {item}\n\n"
    finally:
        config = session.get("config") or {}
        created_at = session.get("created_at", datetime.utcnow().isoformat())
        _sessions.pop(session_id, None)

        if collected and config:
            asyncio.create_task(
                db.save_session(
                    session_id,
                    config.get("topic", ""),
                    config,
                    collected,
                    final_status,
                    created_at,
                )
            )
