import json
import os
import sqlite3
from contextlib import closing
from pathlib import Path

from app.board import INITIAL_BOARD


def database_path() -> Path:
    return Path(os.environ.get("DATABASE_PATH", "/data/pm.sqlite3"))


def connect() -> sqlite3.Connection:
    path = database_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with closing(connect()) as conn, conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS boards (
                user_id INTEGER PRIMARY KEY REFERENCES users(id),
                data TEXT NOT NULL
            );
            """
        )
        row = conn.execute(
            "SELECT id FROM users WHERE username = ?", ("user",)
        ).fetchone()
        if row is None:
            cursor = conn.execute(
                "INSERT INTO users (username, password) VALUES (?, ?)",
                ("user", "password"),
            )
            conn.execute(
                "INSERT INTO boards (user_id, data) VALUES (?, ?)",
                (cursor.lastrowid, json.dumps(INITIAL_BOARD)),
            )


def check_user(username: str, password: str) -> bool:
    with closing(connect()) as conn:
        row = conn.execute(
            "SELECT 1 FROM users WHERE username = ? AND password = ?",
            (username, password),
        ).fetchone()
    return row is not None


def get_board(username: str) -> dict:
    with closing(connect()) as conn:
        row = conn.execute(
            """
            SELECT boards.data FROM boards
            JOIN users ON users.id = boards.user_id
            WHERE users.username = ?
            """,
            (username,),
        ).fetchone()
    if row is None:
        raise KeyError(username)
    return json.loads(row["data"])


def save_board(username: str, data: dict) -> dict:
    with closing(connect()) as conn, conn:
        conn.execute(
            """
            UPDATE boards SET data = ?
            WHERE user_id = (SELECT id FROM users WHERE username = ?)
            """,
            (json.dumps(data), username),
        )
    return data
