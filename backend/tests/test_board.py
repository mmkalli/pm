import json
import os
import sqlite3
from pathlib import Path

from fastapi.testclient import TestClient

from app.db import init_db
from app.main import app


def test_missing_database_file_is_created_and_seeded():
    path = Path(os.environ["DATABASE_PATH"])
    assert not path.exists()
    init_db()
    assert path.exists()
    conn = sqlite3.connect(path)
    user = conn.execute(
        "SELECT username, password FROM users WHERE username = ?", ("user",)
    ).fetchone()
    board = conn.execute("SELECT data FROM boards").fetchone()
    conn.close()
    assert user == ("user", "password")
    data = json.loads(board[0])
    assert len(data["cards"]) == 8


def test_get_board_without_session_is_401():
    with TestClient(app) as client:
        response = client.get("/api/board")
        assert response.status_code == 401


def test_get_board_as_user_returns_seed_cards():
    with TestClient(app) as client:
        client.post("/api/login", json={"username": "user", "password": "password"})
        response = client.get("/api/board")
        assert response.status_code == 200
        assert len(response.json()["cards"]) == 8


def test_put_renamed_column_is_returned_by_get():
    with TestClient(app) as client:
        client.post("/api/login", json={"username": "user", "password": "password"})
        board = client.get("/api/board").json()
        board["columns"][0]["title"] = "Ideas"
        put = client.put("/api/board", json=board)
        assert put.status_code == 200
        assert client.get("/api/board").json()["columns"][0]["title"] == "Ideas"


def test_put_add_move_edit_delete_round_trips():
    with TestClient(app) as client:
        client.post("/api/login", json={"username": "user", "password": "password"})
        board = client.get("/api/board").json()
        board["cards"]["card-new"] = {
            "id": "card-new",
            "title": "New card",
            "details": "Added",
        }
        board["columns"][0]["cardIds"].append("card-new")
        board["columns"][0]["cardIds"].remove("card-1")
        board["columns"][3]["cardIds"].insert(0, "card-1")
        board["cards"]["card-new"]["title"] = "Renamed card"
        del board["cards"]["card-2"]
        board["columns"][0]["cardIds"].remove("card-2")
        put = client.put("/api/board", json=board)
        assert put.status_code == 200
        saved = client.get("/api/board").json()
        assert saved["cards"]["card-new"]["title"] == "Renamed card"
        assert "card-1" in saved["columns"][3]["cardIds"]
        assert "card-1" not in saved["columns"][0]["cardIds"]
        assert "card-2" not in saved["cards"]
        assert "card-2" not in saved["columns"][0]["cardIds"]


def test_put_invalid_board_is_400_and_unchanged():
    with TestClient(app) as client:
        client.post("/api/login", json={"username": "user", "password": "password"})
        original = client.get("/api/board").json()

        sixth = json.loads(json.dumps(original))
        sixth["columns"].append(
            {"id": "col-extra", "title": "Extra", "cardIds": []}
        )
        changed_id = json.loads(json.dumps(original))
        changed_id["columns"][0]["id"] = "col-other"
        duplicate = json.loads(json.dumps(original))
        duplicate["columns"][1]["cardIds"].append("card-1")
        empty_title = json.loads(json.dumps(original))
        empty_title["cards"]["card-1"]["title"] = ""

        for payload in (sixth, changed_id, duplicate, empty_title):
            response = client.put("/api/board", json=payload)
            assert response.status_code == 400
            assert client.get("/api/board").json() == original


def test_second_user_board_is_not_returned_for_user():
    init_db()
    path = os.environ["DATABASE_PATH"]
    conn = sqlite3.connect(path)
    cur = conn.execute(
        "INSERT INTO users (username, password) VALUES (?, ?)",
        ("other", "secret"),
    )
    conn.execute(
        "INSERT INTO boards (user_id, data) VALUES (?, ?)",
        (
            cur.lastrowid,
            json.dumps(
                {
                    "columns": [],
                    "cards": {
                        "other-card": {
                            "id": "other-card",
                            "title": "Other",
                            "details": "",
                        }
                    },
                }
            ),
        ),
    )
    conn.commit()
    conn.close()
    with TestClient(app) as client:
        client.post("/api/login", json={"username": "user", "password": "password"})
        board = client.get("/api/board").json()
        assert "other-card" not in board["cards"]
        assert len(board["cards"]) == 8
