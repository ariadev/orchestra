from __future__ import annotations
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routers import sessions, ai


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(title="Orchestra API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sessions.router)
app.include_router(ai.router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
