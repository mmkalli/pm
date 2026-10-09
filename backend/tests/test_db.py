import json
import os
import sqlite3
from pathlib import Path

from app import db
from app.board import INITIAL_BOARD


def query(sql: str, *args):
    conn = sqlite3.connect(os.environ["DATABASE_PATH"])
    try:
        return conn.execute(sql, args).fetchall()
    finally:
        conn.close()


def test_missing_database_file_is_created_and_seeded():
    path = Path(os.environ["DATABASE_PATH"])
    assert not path.exists()
    db.init_db()
    assert path.exists()
    assert query("PRAGMA user_version") == [(db.SCHEMA_VERSION,)]
    [(username, password_hash, is_admin)] = query(
        "SELECT username, password_hash, is_admin FROM users"
    )
    assert (username, is_admin) == ("user", 1)
    assert password_hash.startswith("pbkdf2_sha256$")
    [(name, data)] = query("SELECT name, data FROM boards")
    assert name == "Product Roadmap"
    assert json.loads(data) == INITIAL_BOARD


def test_init_is_idempotent():
    db.init_db()
    db.init_db()
    assert query("SELECT count(*) FROM users") == [(1,)]
    assert query("SELECT count(*) FROM boards") == [(1,)]


def test_seed_is_skipped_when_any_user_exists():
    db.init_db()
    db.create_user("alice", "alice-pass")
    db.delete_user(1)
    db.init_db()
    assert query("SELECT username FROM users") == [("alice",)]


def test_mvp_database_is_migrated():
    other_board = {
        "columns": [{"id": "col-a", "title": "A", "cardIds": []}],
        "cards": {},
    }
    conn = sqlite3.connect(os.environ["DATABASE_PATH"])
    conn.executescript(
        """
        CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL);
        CREATE TABLE boards (user_id INTEGER PRIMARY KEY REFERENCES users(id), data TEXT NOT NULL);
        """
    )
    conn.execute("INSERT INTO users VALUES (1, 'user', 'password'), (2, 'other', 'other-pass')")
    conn.execute(
        "INSERT INTO boards VALUES (1, ?), (2, ?)",
        (json.dumps(INITIAL_BOARD), json.dumps(other_board)),
    )
    conn.commit()
    conn.close()

    db.init_db()

    assert query("SELECT name FROM sqlite_master WHERE name LIKE '%_mvp'") == []
    assert query("SELECT id, username, is_admin FROM users ORDER BY id") == [
        (1, "user", 1),
        (2, "other", 0),
    ]
    assert db.authenticate("user", "password")["isAdmin"] is True
    assert db.authenticate("other", "other-pass")["username"] == "other"
    assert db.authenticate("other", "password") is None
    assert [b["name"] for b in db.list_boards(1)] == ["My Board"]
    assert db.get_board(1, db.list_boards(1)[0]["id"])["data"] == INITIAL_BOARD
    assert db.get_board(2, db.list_boards(2)[0]["id"])["data"] == other_board


def test_deleting_user_cascades_to_boards():
    db.init_db()
    alice = db.create_user("alice", "alice-pass")
    db.create_board(alice["id"], "Second", INITIAL_BOARD)
    assert len(db.list_boards(alice["id"])) == 2
    db.delete_user(alice["id"])
    assert query("SELECT count(*) FROM boards WHERE user_id = ?", alice["id"]) == [(0,)]


def test_board_queries_are_scoped_to_owner():
    db.init_db()
    alice = db.create_user("alice", "alice-pass")
    board_id = db.list_boards(1)[0]["id"]
    assert db.get_board(alice["id"], board_id) is None
    assert db.rename_board(alice["id"], board_id, "Mine") is None
    assert not db.save_board(alice["id"], board_id, INITIAL_BOARD)
    assert not db.delete_board(alice["id"], board_id)
    assert db.get_board(1, board_id)["name"] == "Product Roadmap"
