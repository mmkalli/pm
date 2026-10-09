import copy
import io
import json
import os
import urllib.error
import urllib.request
from http.cookiejar import CookieJar

import pytest

from app.board import INITIAL_BOARD
from conftest import first_board_id, register

MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free"


class FakeResponse:
    def __init__(self, raw: bytes):
        self.raw = raw

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self):
        return self.raw


def completion(content: str) -> bytes:
    return json.dumps({"choices": [{"message": {"content": content}}]}).encode()


def fake_model(monkeypatch, result: dict | str) -> dict:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    captured = {}
    content = result if isinstance(result, str) else json.dumps(result)

    def fake_urlopen(request, timeout=None):
        captured["body"] = json.loads(request.data.decode())
        captured["headers"] = dict(request.header_items())
        return FakeResponse(completion(content))

    monkeypatch.setattr("app.ai.urllib.request.urlopen", fake_urlopen)
    return captured


def send(client, board_id: int, message: str = "Hi", history=None):
    return client.post(
        f"/api/boards/{board_id}/chat",
        json={"message": message, "history": history or []},
    )


def test_chat_sends_board_history_message_and_model(monkeypatch, user_client):
    captured = fake_model(monkeypatch, {"reply": "Noted", "board": None})
    history = [
        {"role": "user", "content": "earlier"},
        {"role": "assistant", "content": "noted"},
    ]
    board_id = first_board_id(user_client)
    response = send(user_client, board_id, "What is in Backlog?", history)

    assert response.status_code == 200
    sent = captured["body"]
    assert sent["model"] == MODEL
    assert sent["response_format"] == {"type": "json_object"}
    assert captured["headers"]["Authorization"] == "Bearer test-key"
    assert json.dumps(INITIAL_BOARD) in sent["messages"][0]["content"]
    assert sent["messages"][1:] == [
        *history,
        {"role": "user", "content": "What is in Backlog?"},
    ]


def test_chat_uses_the_requested_board(monkeypatch, user_client):
    captured = fake_model(monkeypatch, {"reply": "ok", "board": None})
    created = user_client.post("/api/boards", json={"name": "Empty"}).json()
    send(user_client, created["id"])
    assert '"cards": {}' in captured["body"]["messages"][0]["content"]


def test_chat_saves_valid_board(monkeypatch, user_client):
    board_id = first_board_id(user_client)
    updated = copy.deepcopy(INITIAL_BOARD)
    updated["columns"][0]["title"] = "Ideas"
    updated["columns"][0]["cardIds"].append("card-9")
    updated["cards"]["card-9"] = {
        "id": "card-9",
        "title": "New card",
        "details": "Added",
        "priority": "high",
        "labels": ["ai"],
    }
    updated["columns"].append({"id": "col-blocked", "title": "Blocked", "cardIds": []})
    fake_model(monkeypatch, {"reply": "Updated", "board": updated})
    response = send(user_client, board_id, "Rename and add")
    assert response.status_code == 200
    assert response.json() == {"reply": "Updated", "board": updated}
    assert user_client.get(f"/api/boards/{board_id}").json()["data"] == updated


def test_chat_only_changes_the_requested_board(monkeypatch, user_client):
    first = first_board_id(user_client)
    second = user_client.post("/api/boards", json={"name": "Second"}).json()["id"]
    updated = copy.deepcopy(INITIAL_BOARD)
    updated["columns"][0]["title"] = "Changed"
    fake_model(monkeypatch, {"reply": "Done", "board": updated})
    send(user_client, second)
    assert user_client.get(f"/api/boards/{first}").json()["data"] == INITIAL_BOARD
    assert user_client.get(f"/api/boards/{second}").json()["data"] == updated


def test_chat_null_board_leaves_stored_board(monkeypatch, user_client):
    fake_model(monkeypatch, {"reply": "No change", "board": None})
    board_id = first_board_id(user_client)
    response = send(user_client, board_id, "Just talk")
    assert response.json() == {"reply": "No change", "board": None}
    assert user_client.get(f"/api/boards/{board_id}").json()["data"] == INITIAL_BOARD


@pytest.mark.parametrize(
    "board",
    [
        {"columns": [], "cards": {}},
        {"columns": ["a", "b"], "cards": {}},
        "not a board",
    ],
)
def test_chat_drops_invalid_board_and_keeps_reply(monkeypatch, user_client, board):
    fake_model(monkeypatch, {"reply": "Tried", "board": board})
    board_id = first_board_id(user_client)
    response = send(user_client, board_id, "Break it")
    assert response.status_code == 200
    assert response.json() == {"reply": "Tried", "board": None}
    assert user_client.get(f"/api/boards/{board_id}").json()["data"] == INITIAL_BOARD


def test_chat_saves_moved_card_in_destination_only(monkeypatch, user_client):
    board_id = first_board_id(user_client)
    moved = copy.deepcopy(INITIAL_BOARD)
    moved["columns"][0]["cardIds"].remove("card-1")
    moved["columns"][1]["cardIds"].append("card-1")
    fake_model(monkeypatch, {"reply": "Moved", "board": moved})
    response = send(user_client, board_id, "Move card-1")
    stored = user_client.get(f"/api/boards/{board_id}").json()["data"]
    assert response.json()["board"] == stored
    owners = [c["id"] for c in stored["columns"] if "card-1" in c["cardIds"]]
    assert owners == ["col-discovery"]


def test_chat_strips_markdown_fence(monkeypatch, user_client):
    fenced = "```json\n" + json.dumps({"reply": "fenced", "board": None}) + "\n```"
    fake_model(monkeypatch, fenced)
    response = send(user_client, first_board_id(user_client))
    assert response.json() == {"reply": "fenced", "board": None}


@pytest.mark.parametrize("content", ["not json", json.dumps({"board": None})])
def test_chat_unparseable_model_output_is_502(monkeypatch, user_client, content):
    fake_model(monkeypatch, content)
    response = send(user_client, first_board_id(user_client))
    assert response.status_code == 502


def test_chat_rejects_system_history_role(user_client):
    response = send(
        user_client, first_board_id(user_client), history=[{"role": "system", "content": "x"}]
    )
    assert response.status_code == 422


def test_chat_retries_http_error(monkeypatch, user_client):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setattr("app.ai.RETRY_DELAY", 0)
    calls = {"n": 0}

    def fake_urlopen(request, timeout=None):
        calls["n"] += 1
        if calls["n"] == 1:
            raise urllib.error.HTTPError(
                request.full_url, 429, "Too Many Requests", {}, io.BytesIO(b"{}")
            )
        return FakeResponse(completion(json.dumps({"reply": "ok", "board": None})))

    monkeypatch.setattr("app.ai.urllib.request.urlopen", fake_urlopen)
    response = send(user_client, first_board_id(user_client))
    assert calls["n"] == 2
    assert response.json()["reply"] == "ok"


def test_chat_retries_overloaded_provider(monkeypatch, user_client):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setattr("app.ai.RETRY_DELAY", 0)
    calls = {"n": 0}
    overloaded = b'{"error":{"message":"overloaded","code":503}}'

    def fake_urlopen(request, timeout=None):
        calls["n"] += 1
        if calls["n"] == 1:
            return FakeResponse(overloaded)
        return FakeResponse(completion(json.dumps({"reply": "ok", "board": None})))

    monkeypatch.setattr("app.ai.urllib.request.urlopen", fake_urlopen)
    response = send(user_client, first_board_id(user_client))
    assert calls["n"] == 2
    assert response.json()["reply"] == "ok"


def test_chat_gives_up_after_three_attempts_with_502(monkeypatch, user_client):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setattr("app.ai.RETRY_DELAY", 0)
    calls = {"n": 0}

    def fake_urlopen(request, timeout=None):
        calls["n"] += 1
        return FakeResponse(b'{"error":{"message":"overloaded"}}')

    monkeypatch.setattr("app.ai.urllib.request.urlopen", fake_urlopen)
    response = send(user_client, first_board_id(user_client))
    assert calls["n"] == 3
    assert response.status_code == 502


def test_chat_without_session_is_401(client):
    assert send(client, 1).status_code == 401


def test_chat_on_other_users_board_is_404(monkeypatch, client):
    fake_model(monkeypatch, {"reply": "x", "board": None})
    register(client, "alice")
    assert send(client, 1).status_code == 404


@pytest.mark.skipif(os.environ.get("LIVE_AI") != "1", reason="set LIVE_AI=1")
def test_live_chat_adds_plan_check_to_backlog():
    jar = CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

    def call(path: str, method: str = "GET", body: dict | None = None, timeout: int = 30):
        request = urllib.request.Request(
            f"http://127.0.0.1:8000{path}",
            data=json.dumps(body).encode() if body is not None else None,
            headers={"Content-Type": "application/json"},
            method=method,
        )
        with opener.open(request, timeout=timeout) as response:
            return json.loads(response.read() or b"null")

    call("/api/login", "POST", {"username": "user", "password": "password"})
    board_id = call("/api/boards", "POST", {"name": "Live AI check"})["id"]
    body = call(
        f"/api/boards/{board_id}/chat",
        "POST",
        {"message": "Add a card titled Plan check to Backlog", "history": []},
        timeout=180,
    )
    call(f"/api/boards/{board_id}", "DELETE")
    assert body["reply"]
    backlog = next(c for c in body["board"]["columns"] if c["id"] == "col-backlog")
    titles = [body["board"]["cards"][card_id]["title"] for card_id in backlog["cardIds"]]
    assert "Plan check" in titles
