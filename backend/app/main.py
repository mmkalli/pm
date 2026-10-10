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


class MemberBody(BaseModel):
    username: str


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


def board_for(user: dict, board_id: int, owner: bool = False) -> dict:
    """The board if the user owns it or is a member; 403 for a member when owner is required."""
    board = db.get_board(user["id"], board_id)
    if board is None:
        raise HTTPException(status_code=404)
    if owner and board["role"] != "owner":
        raise HTTPException(status_code=403, detail="Only the owner can do that")
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

STALE = "This board was changed by someone else. Reload to see the latest version."


@app.get("/api/boards")
def boards(user: CurrentUser) -> list[dict]:
    return db.list_boards(user["id"])


@app.post("/api/boards", status_code=201)
def create_board(body: BoardNameBody, user: CurrentUser) -> dict:
    return db.create_board(user["id"], body.name, empty_board())


@app.get("/api/boards/{board_id}")
def read_board(board_id: int, user: CurrentUser) -> dict:
    return board_for(user, board_id)


@app.patch("/api/boards/{board_id}")
def rename_board(board_id: int, body: BoardNameBody, user: CurrentUser) -> dict:
    board_for(user, board_id, owner=True)
    db.rename_board(board_id, body.name)
    return db.board_summary(user["id"], board_id)


@app.put("/api/boards/{board_id}/data")
def write_board(board_id: int, body: dict, user: CurrentUser, version: int | None = None) -> dict:
    board_for(user, board_id)
    if not valid_board(body):
        raise HTTPException(status_code=400, detail="Invalid board")
    saved = db.save_board(board_id, body, version)
    if saved is None:
        raise HTTPException(status_code=409, detail=STALE)
    return {"data": body, "version": saved}


@app.delete("/api/boards/{board_id}", status_code=204)
def delete_board(board_id: int, user: CurrentUser) -> None:
    board_for(user, board_id, owner=True)
    db.delete_board(board_id)


@app.post("/api/boards/{board_id}/chat")
def post_chat(board_id: int, body: ChatBody, user: CurrentUser) -> dict:
    board = board_for(user, board_id)
    try:
        reply, returned = chat(
            board["data"], [item.model_dump() for item in body.history], body.message
        )
    except (RuntimeError, ValueError, KeyError, TypeError) as error:
        raise HTTPException(status_code=502, detail="The assistant is unavailable") from error
    if not valid_board(returned):
        return {"reply": reply, "board": None, "version": board["version"]}
    saved = db.save_board(board_id, returned, board["version"])
    if saved is None:
        raise HTTPException(status_code=409, detail=STALE)
    return {"reply": reply, "board": returned, "version": saved}


# Members


@app.get("/api/boards/{board_id}/members")
def members(board_id: int, user: CurrentUser) -> list[dict]:
    board_for(user, board_id)
    return db.list_members(board_id)


@app.post("/api/boards/{board_id}/members", status_code=201)
def add_member(board_id: int, body: MemberBody, user: CurrentUser) -> dict:
    board_for(user, board_id, owner=True)
    member = db.find_user(body.username)
    if member is None:
        raise HTTPException(status_code=404, detail="No user with that name")
    if member["id"] == user["id"] or not db.add_member(board_id, member["id"]):
        raise HTTPException(status_code=409, detail="That user already has this board")
    return member


@app.delete("/api/boards/{board_id}/members/{member_id}", status_code=204)
def remove_member(board_id: int, member_id: int, user: CurrentUser) -> None:
    board_for(user, board_id, owner=member_id != user["id"])
    if not db.remove_member(board_id, member_id):
        raise HTTPException(status_code=404)


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
    user = db.update_user(user_id, body.password, body.isAdmin)
    if user is None:
        raise HTTPException(status_code=404)
    return user


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
