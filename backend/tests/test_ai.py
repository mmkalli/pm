import json
import os
import urllib.request
from http.cookiejar import CookieJar

import pytest
from fastapi.testclient import TestClient

from app.main import app

QUESTION = "What is 2+2? Reply with only the number."
MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free"


def test_complete_sends_model_and_question(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    captured = {}

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def read(self):
            return b'{"choices":[{"message":{"content":"4"}}]}'

    def fake_urlopen(request, timeout=None):
        captured["body"] = json.loads(request.data.decode())
        captured["authorization"] = request.get_header("Authorization")
        return FakeResponse()

    monkeypatch.setattr("app.ai.urllib.request.urlopen", fake_urlopen)

    from app.ai import complete

    reply = complete(QUESTION)

    assert reply == "4"
    assert captured["body"]["model"] == MODEL
    assert captured["body"]["messages"][0]["content"] == QUESTION
    assert captured["authorization"] == "Bearer test-key"


def test_ai_ping_without_session_is_401():
    with TestClient(app) as client:
        response = client.post("/api/ai/ping")
        assert response.status_code == 401


def test_ai_ping_returns_model_reply(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    captured = {}

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def read(self):
            return b'{"choices":[{"message":{"content":"4"}}]}'

    def fake_urlopen(request, timeout=None):
        captured["body"] = json.loads(request.data.decode())
        return FakeResponse()

    monkeypatch.setattr("app.ai.urllib.request.urlopen", fake_urlopen)

    with TestClient(app) as client:
        client.post("/api/login", json={"username": "user", "password": "password"})
        response = client.post("/api/ai/ping")

    assert response.status_code == 200
    assert response.json() == {"reply": "4"}
    assert captured["body"]["messages"][0]["content"] == QUESTION


@pytest.mark.skipif(os.environ.get("LIVE_AI") != "1", reason="set LIVE_AI=1")
def test_live_ping_reply_contains_4():
    jar = CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    login = urllib.request.Request(
        "http://127.0.0.1:8000/api/login",
        data=json.dumps({"username": "user", "password": "password"}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with opener.open(login, timeout=30) as response:
        assert response.status == 200
    ping = urllib.request.Request(
        "http://127.0.0.1:8000/api/ai/ping",
        data=b"{}",
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with opener.open(ping, timeout=180) as response:
        body = json.load(response)
    assert "4" in body["reply"]
