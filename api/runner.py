from __future__ import annotations
import asyncio
import contextvars
import uuid
from concurrent.futures import ThreadPoolExecutor
from typing import AsyncGenerator

import events as ev_module
from graph import build_graph
from state import DiscussionState

_executor = ThreadPoolExecutor(max_workers=10)
_sessions: dict[str, asyncio.Queue] = {}

_VALID_OUTPUT_TYPES = {
    "content", "technical_report", "product_spec",
    "strategy", "decision_brief", "general",
}


def create_session() -> tuple[str, asyncio.Queue]:
    session_id = str(uuid.uuid4())
    queue: asyncio.Queue = asyncio.Queue()
    _sessions[session_id] = queue
    return session_id, queue


def session_exists(session_id: str) -> bool:
    return session_id in _sessions


async def start_session(session_id: str, config: dict) -> None:
    queue = _sessions.get(session_id)
    if queue is None:
        return
    loop = asyncio.get_running_loop()

    async def _run() -> None:
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
    queue = _sessions.get(session_id)
    if queue is None:
        return

    try:
        while True:
            item = await queue.get()
            if item is None:
                break
            yield f"data: {item}\n\n"
    finally:
        _sessions.pop(session_id, None)
