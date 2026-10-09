import copy
import io
import json
import os
import urllib.error
import urllib.request
from http.cookiejar import CookieJar

import pytest
from fastapi.testclient import TestClient

from app.main import app

MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free"


def fake_model(monkeypatch, result: dict) -> dict:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    captured = {}
    raw = json.dumps(
        {"choices": [{"message": {"content": json.dumps(result)}}]}
    ).encode()

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def read(self):
            return raw

    def fake_urlopen(request, timeout=None):
        captured["body"] = json.loads(request.data.decode())
        return FakeResponse()

    monkeypatch.setattr("app.ai.urllib.request.urlopen", fake_urlopen)
    return captured


def login(client: TestClient) -> None:
    client.post("/api/login", json={"username": "user", "password": "password"})


def test_chat_sends_board_history_message_and_model(monkeypatch):
    captured = fake_model(monkeypatch, {"reply": "Noted", "board": None})
    history = [
        {"role": "user", "content": "earlier"},
        {"role": "assistant", "content": "noted"},
    ]
    with TestClient(app) as client:
        login(client)
        board = client.get("/api/board").json()
        response = client.post(
            "/api/chat",
            json={"message": "What is in Backlog?", "history": history},
        )

    assert response.status_code == 200
    sent = captured["body"]
    assert sent["model"] == MODEL
    text = "\n".join(item["content"] for item in sent["messages"])
    assert json.dumps(board) in text
    assert ("user", "earlier") in [
        (item["role"], item["content"]) for item in sent["messages"]
    ]
    assert ("assistant", "noted") in [
        (item["role"], item["content"]) for item in sent["messages"]
    ]
    assert sent["messages"][-1] == {"role": "user", "content": "What is in Backlog?"}


def test_chat_saves_valid_board(monkeypatch):
    with TestClient(app) as client:
        login(client)
        updated = copy.deepcopy(client.get("/api/board").json())
        updated["columns"][0]["title"] = "Ideas"
        updated["columns"][0]["cardIds"].append("card-9")
        updated["cards"]["card-9"] = {
            "id": "card-9",
            "title": "New card",
            "details": "Added",
        }
        fake_model(monkeypatch, {"reply": "Updated", "board": updated})
        response = client.post(
            "/api/chat", json={"message": "Rename and add", "history": []}
        )
        assert response.status_code == 200
        assert response.json() == {"reply": "Updated", "board": updated}
        assert client.get("/api/board").json() == updated


def test_chat_null_board_leaves_stored_board(monkeypatch):
    fake_model(monkeypatch, {"reply": "No change", "board": None})
    with TestClient(app) as client:
        login(client)
        before = client.get("/api/board").json()
        response = client.post(
            "/api/chat", json={"message": "Just talk", "history": []}
        )
        assert response.json() == {"reply": "No change", "board": None}
        assert client.get("/api/board").json() == before


def test_chat_drops_invalid_board(monkeypatch):
    with TestClient(app) as client:
        login(client)
        before = client.get("/api/board").json()
        invalid = copy.deepcopy(before)
        invalid["columns"].append(
            {"id": "col-extra", "title": "Extra", "cardIds": []}
        )
        fake_model(monkeypatch, {"reply": "Tried", "board": invalid})
        response = client.post(
            "/api/chat", json={"message": "Add a column", "history": []}
        )
        assert response.json() == {"reply": "Tried", "board": None}
        assert client.get("/api/board").json() == before


def test_chat_saves_moved_card_in_destination_only(monkeypatch):
    with TestClient(app) as client:
        login(client)
        moved = copy.deepcopy(client.get("/api/board").json())
        moved["columns"][0]["cardIds"].remove("card-1")
        moved["columns"][1]["cardIds"].append("card-1")
        fake_model(monkeypatch, {"reply": "Moved", "board": moved})
        response = client.post(
            "/api/chat", json={"message": "Move card-1", "history": []}
        )
        stored = client.get("/api/board").json()
        assert response.json()["board"] == stored
        owners = [
            column["id"]
            for column in stored["columns"]
            if "card-1" in column["cardIds"]
        ]
        assert owners == ["col-discovery"]


def test_chat_drops_malformed_board_and_keeps_reply(monkeypatch):
    fake_model(
        monkeypatch,
        {"reply": "Tried", "board": {"columns": ["a", "b", "c", "d", "e"], "cards": {}}},
    )
    with TestClient(app) as client:
        login(client)
        before = client.get("/api/board").json()
        response = client.post(
            "/api/chat", json={"message": "Break it", "history": []}
        )
        assert response.status_code == 200
        assert response.json() == {"reply": "Tried", "board": None}
        assert client.get("/api/board").json() == before


def test_chat_rejects_system_history_role():
    with TestClient(app) as client:
        login(client)
        response = client.post(
            "/api/chat",
            json={"message": "Hi", "history": [{"role": "system", "content": "x"}]},
        )
        assert response.status_code == 422


def test_chat_retries_http_error(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setattr("app.ai.RETRY_DELAY", 0)
    calls = {"n": 0}
    ok = json.dumps(
        {"choices": [{"message": {"content": json.dumps({"reply": "ok", "board": None})}}]}
    ).encode()

    def fake_urlopen(request, timeout=None):
        calls["n"] += 1
        if calls["n"] == 1:
            raise urllib.error.HTTPError(
                request.full_url, 429, "Too Many Requests", {}, io.BytesIO(b"{}")
            )
        return io.BytesIO(ok)

    monkeypatch.setattr("app.ai.urllib.request.urlopen", fake_urlopen)
    with TestClient(app) as client:
        login(client)
        response = client.post("/api/chat", json={"message": "Hi", "history": []})
    assert calls["n"] == 2
    assert response.json()["reply"] == "ok"


def test_chat_retries_overloaded_provider(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setattr("app.ai.RETRY_DELAY", 0)
    calls = {"n": 0}
    ok = json.dumps(
        {"choices": [{"message": {"content": json.dumps({"reply": "ok", "board": None})}}]}
    ).encode()
    overloaded = b'{"error":{"message":"overloaded","code":503}}'

    class FakeResponse:
        def __init__(self, raw: bytes):
            self.raw = raw

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def read(self):
            return self.raw

    def fake_urlopen(request, timeout=None):
        calls["n"] += 1
        return FakeResponse(overloaded if calls["n"] == 1 else ok)

    monkeypatch.setattr("app.ai.urllib.request.urlopen", fake_urlopen)
    with TestClient(app) as client:
        login(client)
        response = client.post("/api/chat", json={"message": "Hi", "history": []})
    assert calls["n"] == 2
    assert response.json()["reply"] == "ok"


def test_chat_without_session_is_401():
    with TestClient(app) as client:
        response = client.post(
            "/api/chat", json={"message": "Hi", "history": []}
        )
        assert response.status_code == 401


@pytest.mark.skipif(os.environ.get("LIVE_AI") != "1", reason="set LIVE_AI=1")
def test_live_chat_adds_plan_check_to_backlog():
    jar = CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    login_request = urllib.request.Request(
        "http://127.0.0.1:8000/api/login",
        data=json.dumps({"username": "user", "password": "password"}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with opener.open(login_request, timeout=30) as response:
        assert response.status == 200
    chat_request = urllib.request.Request(
        "http://127.0.0.1:8000/api/chat",
        data=json.dumps(
            {
                "message": "Add a card titled Plan check to Backlog",
                "history": [],
            }
        ).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with opener.open(chat_request, timeout=180) as response:
        body = json.load(response)
    assert body["reply"]
    backlog = next(
        column for column in body["board"]["columns"] if column["id"] == "col-backlog"
    )
    titles = [body["board"]["cards"][card_id]["title"] for card_id in backlog["cardIds"]]
    assert "Plan check" in titles
    board_request = urllib.request.Request("http://127.0.0.1:8000/api/board")
    with opener.open(board_request, timeout=30) as response:
        stored = json.load(response)
    assert stored == body["board"]
