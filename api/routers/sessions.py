from __future__ import annotations
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from api.schemas import SessionRequest, SessionResponse
from api import runner

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.post("", response_model=SessionResponse, status_code=202)
async def create_session(req: SessionRequest) -> SessionResponse:
    config = req.model_dump()
    session_id, _ = runner.create_session()
    await runner.start_session(session_id, config)
    return SessionResponse(session_id=session_id)


@router.get("/{session_id}/events")
async def get_session_events(session_id: str) -> StreamingResponse:
    if not runner.session_exists(session_id):
        raise HTTPException(status_code=404, detail="session not found")

    return StreamingResponse(
        runner.stream_session(session_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
