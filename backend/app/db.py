import json
import os
import sqlite3
from contextlib import closing
from pathlib import Path

from app.auth import hash_password, verify_password
from app.board import INITIAL_BOARD, empty_board

SCHEMA_VERSION = 1
NOW = "(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))"
SCHEMA = f"""
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT UNIQUE NOT NULL COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT {NOW}
);
CREATE TABLE IF NOT EXISTS boards (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT {NOW},
    updated_at TEXT NOT NULL DEFAULT {NOW}
);
CREATE INDEX IF NOT EXISTS boards_user_id ON boards(user_id);
"""
USER_COLUMNS = "id, username, is_admin"
BOARD_SUMMARY = """
    id, name, created_at, updated_at,
    (SELECT count(*) FROM json_each(boards.data, '$.cards')) AS card_count
"""


def database_path() -> Path:
    return Path(os.environ.get("DATABASE_PATH", "/data/pm.sqlite3"))


def connect() -> sqlite3.Connection:
    path = database_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def migrate_mvp(conn: sqlite3.Connection) -> None:
    conn.execute("ALTER TABLE boards RENAME TO boards_mvp")
    conn.execute("ALTER TABLE users RENAME TO users_mvp")
    conn.executescript(SCHEMA)
    for row in conn.execute("SELECT id, username, password FROM users_mvp").fetchall():
        conn.execute(
            "INSERT INTO users (id, username, password_hash, is_admin) VALUES (?, ?, ?, ?)",
            (row["id"], row["username"], hash_password(row["password"]), row["username"] == "user"),
        )
    conn.execute(
        "INSERT INTO boards (user_id, name, data) SELECT user_id, 'My Board', data FROM boards_mvp"
    )
    conn.execute("DROP TABLE boards_mvp")
    conn.execute("DROP TABLE users_mvp")


def init_db() -> None:
    with closing(connect()) as conn, conn:
        version = conn.execute("PRAGMA user_version").fetchone()[0]
        legacy = conn.execute(
            "SELECT 1 FROM pragma_table_info('users') WHERE name = 'password'"
        ).fetchone()
        if version == 0 and legacy:
            migrate_mvp(conn)
        conn.executescript(SCHEMA)
        conn.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")
        if conn.execute("SELECT 1 FROM users").fetchone() is None:
            user = insert_user(conn, "user", "password", True)
            insert_board(conn, user["id"], "Product Roadmap", INITIAL_BOARD)


def user_dict(row: sqlite3.Row) -> dict:
    return {"id": row["id"], "username": row["username"], "isAdmin": bool(row["is_admin"])}


def insert_user(conn: sqlite3.Connection, username: str, password: str, is_admin: bool) -> dict:
    cursor = conn.execute(
        "INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, ?)",
        (username, hash_password(password), is_admin),
    )
    return {"id": cursor.lastrowid, "username": username, "isAdmin": is_admin}


def insert_board(conn: sqlite3.Connection, user_id: int, name: str, data: dict) -> int:
    cursor = conn.execute(
        "INSERT INTO boards (user_id, name, data) VALUES (?, ?, ?)",
        (user_id, name, json.dumps(data)),
    )
    return cursor.lastrowid


# Users


def create_user(username: str, password: str, is_admin: bool = False) -> dict | None:
    """Create a user with a starter board. Returns None when the username is taken."""
    with closing(connect()) as conn, conn:
        try:
            user = insert_user(conn, username, password, is_admin)
        except sqlite3.IntegrityError:
            return None
        insert_board(conn, user["id"], "My Board", empty_board())
    return user


def get_user(user_id: int) -> dict | None:
    with closing(connect()) as conn:
        row = conn.execute(f"SELECT {USER_COLUMNS} FROM users WHERE id = ?", (user_id,)).fetchone()
    return user_dict(row) if row else None


def authenticate(username: str, password: str) -> dict | None:
    with closing(connect()) as conn:
        row = conn.execute(
            f"SELECT {USER_COLUMNS}, password_hash FROM users WHERE username = ?",
            (username,),
        ).fetchone()
    if row is None or not verify_password(password, row["password_hash"]):
        return None
    return user_dict(row)


def check_password(user_id: int, password: str) -> bool:
    with closing(connect()) as conn:
        row = conn.execute("SELECT password_hash FROM users WHERE id = ?", (user_id,)).fetchone()
    return verify_password(password, row["password_hash"])


def list_users() -> list[dict]:
    with closing(connect()) as conn:
        rows = conn.execute(
            f"""
            SELECT {USER_COLUMNS}, created_at,
                (SELECT count(*) FROM boards WHERE boards.user_id = users.id) AS board_count
            FROM users ORDER BY id
            """
        ).fetchall()
    return [
        {**user_dict(row), "boardCount": row["board_count"], "createdAt": row["created_at"]}
        for row in rows
    ]


def update_user(user_id: int, password: str | None = None, is_admin: bool | None = None) -> dict | None:
    with closing(connect()) as conn, conn:
        if password is not None:
            conn.execute(
                "UPDATE users SET password_hash = ? WHERE id = ?",
                (hash_password(password), user_id),
            )
        if is_admin is not None:
            conn.execute("UPDATE users SET is_admin = ? WHERE id = ?", (is_admin, user_id))
    return get_user(user_id)


def delete_user(user_id: int) -> bool:
    with closing(connect()) as conn, conn:
        return conn.execute("DELETE FROM users WHERE id = ?", (user_id,)).rowcount > 0


# Boards


def summary_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "cardCount": row["card_count"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def list_boards(user_id: int) -> list[dict]:
    with closing(connect()) as conn:
        rows = conn.execute(
            f"SELECT {BOARD_SUMMARY} FROM boards WHERE user_id = ? ORDER BY id", (user_id,)
        ).fetchall()
    return [summary_dict(row) for row in rows]


def board_summary(user_id: int, board_id: int) -> dict | None:
    with closing(connect()) as conn:
        row = conn.execute(
            f"SELECT {BOARD_SUMMARY} FROM boards WHERE id = ? AND user_id = ?",
            (board_id, user_id),
        ).fetchone()
    return summary_dict(row) if row else None


def create_board(user_id: int, name: str, data: dict) -> dict:
    with closing(connect()) as conn, conn:
        board_id = insert_board(conn, user_id, name, data)
    return board_summary(user_id, board_id)


def get_board(user_id: int, board_id: int) -> dict | None:
    with closing(connect()) as conn:
        row = conn.execute(
            "SELECT id, name, data, created_at, updated_at FROM boards WHERE id = ? AND user_id = ?",
            (board_id, user_id),
        ).fetchone()
    if row is None:
        return None
    return {
        "id": row["id"],
        "name": row["name"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
        "data": json.loads(row["data"]),
    }


def rename_board(user_id: int, board_id: int, name: str) -> dict | None:
    with closing(connect()) as conn, conn:
        conn.execute(
            f"UPDATE boards SET name = ?, updated_at = {NOW} WHERE id = ? AND user_id = ?",
            (name, board_id, user_id),
        )
    return board_summary(user_id, board_id)


def save_board(user_id: int, board_id: int, data: dict) -> bool:
    with closing(connect()) as conn, conn:
        cursor = conn.execute(
            f"UPDATE boards SET data = ?, updated_at = {NOW} WHERE id = ? AND user_id = ?",
            (json.dumps(data), board_id, user_id),
        )
    return cursor.rowcount > 0


def delete_board(user_id: int, board_id: int) -> bool:
    with closing(connect()) as conn, conn:
        cursor = conn.execute(
            "DELETE FROM boards WHERE id = ? AND user_id = ?", (board_id, user_id)
        )
    return cursor.rowcount > 0
