import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.middleware.sessions import SessionMiddleware

from app.board import valid_board
from app.db import get_board, init_db, save_board


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


app = FastAPI(lifespan=lifespan)
app.add_middleware(
    SessionMiddleware,
    secret_key="pm-local-session",
    session_cookie="session",
    https_only=False,
    same_site="lax",
)


class LoginBody(BaseModel):
    username: str
    password: str


def current_username(request: Request) -> str:
    username = request.session.get("username")
    if not username:
        raise HTTPException(status_code=401)
    return username


@app.get("/api/health")
def health() -> dict[str, bool]:
    return {"ok": True}


@app.post("/api/login")
def login(body: LoginBody, request: Request) -> dict[str, str]:
    if body.username != "user" or body.password != "password":
        raise HTTPException(status_code=401)
    request.session["username"] = body.username
    return {"username": body.username}


@app.post("/api/logout")
def logout(request: Request) -> dict[str, bool]:
    request.session.clear()
    return {"ok": True}


@app.get("/api/me")
def me(request: Request) -> dict[str, str]:
    return {"username": current_username(request)}


@app.get("/api/board")
def read_board(request: Request) -> dict:
    return get_board(current_username(request))


@app.put("/api/board")
def write_board(body: dict, request: Request) -> dict:
    username = current_username(request)
    if not valid_board(body):
        raise HTTPException(status_code=400)
    return save_board(username, body)


static_dir = Path(
    os.environ.get(
        "STATIC_DIR",
        Path(__file__).resolve().parents[2] / "frontend" / "out",
    )
)
app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
