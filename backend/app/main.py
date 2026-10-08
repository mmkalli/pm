import os
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.middleware.sessions import SessionMiddleware

app = FastAPI()
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
    username = request.session.get("username")
    if not username:
        raise HTTPException(status_code=401)
    return {"username": username}


static_dir = Path(
    os.environ.get(
        "STATIC_DIR",
        Path(__file__).resolve().parents[2] / "frontend" / "out",
    )
)
app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
