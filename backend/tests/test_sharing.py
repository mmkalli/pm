import copy
import json

import pytest
from fastapi.testclient import TestClient

from app.board import INITIAL_BOARD
from app.main import app
from conftest import first_board_id, login, register
from test_ai import FakeResponse, completion, fake_model


@pytest.fixture
def shared(user_client):
    """`user` owns board 1 and adds alice as a member. Returns (owner, alice, board_id, alice_id)."""
    with TestClient(app) as alice:
        alice_id = register(alice, "alice").json()["id"]
        board_id = first_board_id(user_client)
        response = user_client.post(f"/api/boards/{board_id}/members", json={"username": "alice"})
        assert response.status_code == 201
        assert response.json() == {"id": alice_id, "username": "alice"}
        yield user_client, alice, board_id, alice_id


def test_member_sees_shared_board_with_owner_and_role(shared):
    _, alice, board_id, _ = shared
    boards = alice.get("/api/boards").json()
    assert [(b["name"], b["owner"], b["role"]) for b in boards] == [
        ("Product Roadmap", "user", "member"),
        ("My Board", "alice", "owner"),
    ]
    record = alice.get(f"/api/boards/{board_id}").json()
    assert (record["role"], record["owner"], record["version"]) == ("member", "user", 1)
    assert record["data"] == INITIAL_BOARD


def test_member_edits_board_data(shared):
    owner, alice, board_id, _ = shared
    data = copy.deepcopy(INITIAL_BOARD)
    data["columns"][0]["title"] = "Alice was here"
    response = alice.put(f"/api/boards/{board_id}/data", json=data)
    assert response.json() == {"data": data, "version": 2}
    assert owner.get(f"/api/boards/{board_id}").json()["data"] == data


def test_member_cannot_rename_delete_or_manage_members(shared):
    _, alice, board_id, _ = shared
    assert alice.patch(f"/api/boards/{board_id}", json={"name": "x"}).status_code == 403
    assert alice.delete(f"/api/boards/{board_id}").status_code == 403
    response = alice.post(f"/api/boards/{board_id}/members", json={"username": "user"})
    assert response.status_code == 403
    assert alice.delete(f"/api/boards/{board_id}/members/1").status_code == 403


def test_both_can_list_members(shared):
    owner, alice, board_id, alice_id = shared
    expected = [{"id": alice_id, "username": "alice"}]
    assert owner.get(f"/api/boards/{board_id}/members").json() == expected
    assert alice.get(f"/api/boards/{board_id}/members").json() == expected


def test_owner_removes_member(shared):
    owner, alice, board_id, alice_id = shared
    assert owner.delete(f"/api/boards/{board_id}/members/{alice_id}").status_code == 204
    assert alice.get(f"/api/boards/{board_id}").status_code == 404
    assert owner.delete(f"/api/boards/{board_id}/members/{alice_id}").status_code == 404


def test_member_leaves_board(shared):
    owner, alice, board_id, alice_id = shared
    assert alice.delete(f"/api/boards/{board_id}/members/{alice_id}").status_code == 204
    assert [b["role"] for b in alice.get("/api/boards").json()] == ["owner"]
    assert owner.get(f"/api/boards/{board_id}/members").json() == []


def test_owner_deleting_board_removes_it_for_members(shared):
    owner, alice, board_id, _ = shared
    assert owner.delete(f"/api/boards/{board_id}").status_code == 204
    assert alice.get(f"/api/boards/{board_id}").status_code == 404
    assert len(alice.get("/api/boards").json()) == 1


def test_add_member_errors(shared):
    owner, _, board_id, _ = shared
    url = f"/api/boards/{board_id}/members"
    assert owner.post(url, json={"username": "ghost"}).status_code == 404
    assert owner.post(url, json={"username": "ALICE"}).status_code == 409
    assert owner.post(url, json={"username": "user"}).status_code == 409


def test_outsider_gets_404_on_members(shared):
    _, _, board_id, alice_id = shared
    with TestClient(app) as bob:
        register(bob, "bob")
        assert bob.get(f"/api/boards/{board_id}/members").status_code == 404
        response = bob.post(f"/api/boards/{board_id}/members", json={"username": "bob"})
        assert response.status_code == 404
        assert bob.delete(f"/api/boards/{board_id}/members/{alice_id}").status_code == 404


def test_member_routes_require_session(client):
    assert client.get("/api/boards/1/members").status_code == 401


def test_stale_version_is_409_and_not_written(user_client):
    board_id = first_board_id(user_client)
    first = copy.deepcopy(INITIAL_BOARD)
    first["columns"][0]["title"] = "First"
    second = copy.deepcopy(INITIAL_BOARD)
    second["columns"][0]["title"] = "Second"
    url = f"/api/boards/{board_id}/data"
    assert user_client.put(f"{url}?version=1", json=first).json()["version"] == 2
    response = user_client.put(f"{url}?version=1", json=second)
    assert response.status_code == 409
    assert "changed by someone else" in response.json()["detail"]
    stored = user_client.get(f"/api/boards/{board_id}").json()
    assert (stored["version"], stored["data"]["columns"][0]["title"]) == (2, "First")
    assert user_client.put(f"{url}?version=2", json=second).json()["version"] == 3


def test_chat_on_shared_board_by_member(shared, monkeypatch):
    owner, alice, board_id, _ = shared
    updated = copy.deepcopy(INITIAL_BOARD)
    updated["columns"][0]["title"] = "From AI"
    fake_model(monkeypatch, {"reply": "Done", "board": updated})
    response = alice.post(f"/api/boards/{board_id}/chat", json={"message": "Go", "history": []})
    assert response.json() == {"reply": "Done", "board": updated, "version": 2}
    assert owner.get(f"/api/boards/{board_id}").json()["data"] == updated


def test_chat_is_409_when_board_changes_during_the_call(user_client, monkeypatch):
    board_id = first_board_id(user_client)
    edited = copy.deepcopy(INITIAL_BOARD)
    edited["columns"][0]["title"] = "Manual edit"
    from_ai = copy.deepcopy(INITIAL_BOARD)
    from_ai["columns"][0]["title"] = "From AI"

    def slow_model(request, timeout=None):
        with TestClient(app) as other:
            login(other)
            other.put(f"/api/boards/{board_id}/data", json=edited)
        return FakeResponse(completion(json.dumps({"reply": "Done", "board": from_ai})))

    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setattr("app.ai.urllib.request.urlopen", slow_model)
    response = user_client.post(
        f"/api/boards/{board_id}/chat", json={"message": "Go", "history": []}
    )
    assert response.status_code == 409
    assert user_client.get(f"/api/boards/{board_id}").json()["data"] == edited
