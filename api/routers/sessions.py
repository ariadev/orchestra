from __future__ import annotations
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from api.schemas import SessionRequest, SessionResponse, ClarifyRequest
from api import runner, db

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.post("", response_model=SessionResponse, status_code=202)
async def create_session(req: SessionRequest) -> SessionResponse:
    config = req.model_dump()
    session_id, _ = runner.create_session()
    await runner.start_session(session_id, config)
    return SessionResponse(session_id=session_id)


@router.post("/{session_id}/clarify", status_code=202)
async def clarify_session(session_id: str, req: ClarifyRequest) -> dict:
    """Submit a clarification answer to resume a paused deliberation graph."""
    if not runner.session_exists(session_id):
        raise HTTPException(status_code=404, detail="session not found")
    if not runner.session_is_interrupted(session_id):
        raise HTTPException(status_code=400, detail="session is not waiting for clarification")
    await runner.resume_session(session_id, req.answer)
    return {"status": "resumed"}


@router.get("")
async def list_sessions() -> list[dict]:
    return await db.list_sessions()


@router.get("/{session_id}")
async def get_session(session_id: str) -> dict:
    session = await db.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="session not found")
    return session


@router.delete("/{session_id}", status_code=204)
async def delete_session(session_id: str) -> None:
    found = await db.delete_session(session_id)
    if not found:
        raise HTTPException(status_code=404, detail="session not found")


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
