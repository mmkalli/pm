import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, StringConstraints
from starlette.middleware.sessions import SessionMiddleware

from app import db
from app.ai import chat
from app.board import empty_board, valid_board


@asynccontextmanager
async def lifespan(_app: FastAPI):
    db.init_db()
    yield


app = FastAPI(lifespan=lifespan)
app.add_middleware(
    SessionMiddleware,
    secret_key=os.environ.get("SESSION_SECRET", "pm-local-session"),
    session_cookie="session",
    https_only=False,
    same_site="lax",
)

Username = Annotated[
    str, StringConstraints(min_length=3, max_length=32, pattern=r"^[A-Za-z0-9._-]+$")
]
Password = Annotated[str, Field(min_length=8, max_length=128)]
BoardName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]


class LoginBody(BaseModel):
    username: str
    password: str


class RegisterBody(BaseModel):
    username: Username
    password: Password


class PasswordChangeBody(BaseModel):
    currentPassword: str
    newPassword: Password


class DeleteAccountBody(BaseModel):
    password: str


class NewUserBody(BaseModel):
    username: Username
    password: Password
    isAdmin: bool = False


class UserUpdateBody(BaseModel):
    password: Password | None = None
    isAdmin: bool | None = None


class BoardNameBody(BaseModel):
    name: BoardName


class HistoryItem(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatBody(BaseModel):
    message: str
    history: list[HistoryItem]


def current_user(request: Request) -> dict:
    user_id = request.session.get("user_id")
    user = db.get_user(user_id) if user_id else None
    if user is None:
        request.session.clear()
        raise HTTPException(status_code=401)
    return user


def admin_user(user: Annotated[dict, Depends(current_user)]) -> dict:
    if not user["isAdmin"]:
        raise HTTPException(status_code=403)
    return user


CurrentUser = Annotated[dict, Depends(current_user)]
AdminUser = Annotated[dict, Depends(admin_user)]


def owned_board(user: dict, board_id: int) -> dict:
    board = db.get_board(user["id"], board_id)
    if board is None:
        raise HTTPException(status_code=404)
    return board


@app.get("/api/health")
def health() -> dict[str, bool]:
    return {"ok": True}


# Account


@app.post("/api/register", status_code=201)
def register(body: RegisterBody, request: Request) -> dict:
    user = db.create_user(body.username, body.password)
    if user is None:
        raise HTTPException(status_code=409, detail="Username is taken")
    request.session["user_id"] = user["id"]
    return user


@app.post("/api/login")
def login(body: LoginBody, request: Request) -> dict:
    user = db.authenticate(body.username, body.password)
    if user is None:
        raise HTTPException(status_code=401)
    request.session["user_id"] = user["id"]
    return user


@app.post("/api/logout")
def logout(request: Request) -> dict[str, bool]:
    request.session.clear()
    return {"ok": True}


@app.get("/api/me")
def me(user: CurrentUser) -> dict:
    return user


@app.put("/api/me/password")
def change_password(body: PasswordChangeBody, user: CurrentUser) -> dict[str, bool]:
    if not db.check_password(user["id"], body.currentPassword):
        raise HTTPException(status_code=403, detail="Current password is wrong")
    db.update_user(user["id"], password=body.newPassword)
    return {"ok": True}


@app.delete("/api/me", status_code=204)
def delete_account(body: DeleteAccountBody, user: CurrentUser, request: Request) -> None:
    if not db.check_password(user["id"], body.password):
        raise HTTPException(status_code=403, detail="Password is wrong")
    db.delete_user(user["id"])
    request.session.clear()


# Boards


@app.get("/api/boards")
def boards(user: CurrentUser) -> list[dict]:
    return db.list_boards(user["id"])


@app.post("/api/boards", status_code=201)
def create_board(body: BoardNameBody, user: CurrentUser) -> dict:
    return db.create_board(user["id"], body.name, empty_board())


@app.get("/api/boards/{board_id}")
def read_board(board_id: int, user: CurrentUser) -> dict:
    return owned_board(user, board_id)


@app.patch("/api/boards/{board_id}")
def rename_board(board_id: int, body: BoardNameBody, user: CurrentUser) -> dict:
    summary = db.rename_board(user["id"], board_id, body.name)
    if summary is None:
        raise HTTPException(status_code=404)
    return summary


@app.put("/api/boards/{board_id}/data")
def write_board(board_id: int, body: dict, user: CurrentUser) -> dict:
    owned_board(user, board_id)
    if not valid_board(body):
        raise HTTPException(status_code=400, detail="Invalid board")
    db.save_board(user["id"], board_id, body)
    return body


@app.delete("/api/boards/{board_id}", status_code=204)
def delete_board(board_id: int, user: CurrentUser) -> None:
    if not db.delete_board(user["id"], board_id):
        raise HTTPException(status_code=404)


@app.post("/api/boards/{board_id}/chat")
def post_chat(board_id: int, body: ChatBody, user: CurrentUser) -> dict:
    board = owned_board(user, board_id)
    try:
        reply, returned = chat(
            board["data"], [item.model_dump() for item in body.history], body.message
        )
    except (RuntimeError, ValueError, KeyError, TypeError) as error:
        raise HTTPException(status_code=502, detail="The assistant is unavailable") from error
    if valid_board(returned):
        db.save_board(user["id"], board_id, returned)
        return {"reply": reply, "board": returned}
    return {"reply": reply, "board": None}


# Admin


@app.get("/api/users")
def users(_admin: AdminUser) -> list[dict]:
    return db.list_users()


@app.post("/api/users", status_code=201)
def create_user(body: NewUserBody, _admin: AdminUser) -> dict:
    user = db.create_user(body.username, body.password, body.isAdmin)
    if user is None:
        raise HTTPException(status_code=409, detail="Username is taken")
    return user


@app.patch("/api/users/{user_id}")
def update_user(user_id: int, body: UserUpdateBody, admin: AdminUser) -> dict:
    if user_id == admin["id"] and body.isAdmin is False:
        raise HTTPException(status_code=400, detail="You cannot remove your own admin role")
    if db.get_user(user_id) is None:
        raise HTTPException(status_code=404)
    return db.update_user(user_id, body.password, body.isAdmin)


@app.delete("/api/users/{user_id}", status_code=204)
def delete_user(user_id: int, admin: AdminUser) -> None:
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="You cannot delete yourself")
    if not db.delete_user(user_id):
        raise HTTPException(status_code=404)


static_dir = Path(
    os.environ.get(
        "STATIC_DIR",
        Path(__file__).resolve().parents[2] / "frontend" / "out",
    )
)
app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
