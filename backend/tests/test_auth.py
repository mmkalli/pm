import pytest
from fastapi.testclient import TestClient

from app.auth import hash_password, verify_password
from app.main import app
from conftest import login, register


def test_hash_is_salted_and_verifies():
    first = hash_password("password")
    second = hash_password("password")
    assert first != second
    assert "password" not in first
    assert verify_password("password", first)
    assert not verify_password("wrong", first)


def test_login_sets_session_cookie_and_returns_user(client):
    response = login(client)
    assert response.status_code == 200
    assert "session" in response.cookies
    assert response.json() == {"id": 1, "username": "user", "isAdmin": True}


def test_login_wrong_password_is_401(client):
    response = login(client, password="wrong")
    assert response.status_code == 401
    assert "session" not in response.cookies


def test_login_unknown_user_is_401(client):
    assert login(client, "nobody", "password").status_code == 401


def test_me_without_session_is_401(client):
    assert client.get("/api/me").status_code == 401


def test_me_with_session_returns_user(user_client):
    response = user_client.get("/api/me")
    assert response.status_code == 200
    assert response.json() == {"id": 1, "username": "user", "isAdmin": True}


def test_logout_then_me_is_401(user_client):
    assert user_client.post("/api/logout").json() == {"ok": True}
    assert user_client.get("/api/me").status_code == 401


def test_register_creates_user_signs_in_and_adds_starter_board(client):
    response = register(client, "alice")
    assert response.status_code == 201
    assert response.json()["username"] == "alice"
    assert response.json()["isAdmin"] is False
    assert client.get("/api/me").json()["username"] == "alice"
    boards = client.get("/api/boards").json()
    assert [board["name"] for board in boards] == ["My Board"]
    assert boards[0]["cardCount"] == 0


def test_registered_user_can_log_in_again(client):
    register(client, "alice", "alice-pass")
    client.post("/api/logout")
    assert login(client, "alice", "alice-pass").status_code == 200
    assert login(client, "alice", "wrong-pass").status_code == 401


def test_register_taken_username_is_409_case_insensitive(client):
    assert register(client, "alice").status_code == 201
    assert register(client, "ALICE").status_code == 409
    assert register(client, "user").status_code == 409


@pytest.mark.parametrize(
    "username,password",
    [
        ("ab", "long-enough"),
        ("x" * 33, "long-enough"),
        ("has space", "long-enough"),
        ("bad/char", "long-enough"),
        ("alice", "short"),
    ],
)
def test_register_rejects_invalid_input(client, username, password):
    response = register(client, username, password)
    assert response.status_code == 422
    assert client.get("/api/me").status_code == 401


def test_change_password(user_client):
    response = user_client.put(
        "/api/me/password",
        json={"currentPassword": "password", "newPassword": "new-password"},
    )
    assert response.json() == {"ok": True}
    user_client.post("/api/logout")
    assert login(user_client).status_code == 401
    assert login(user_client, password="new-password").status_code == 200


def test_change_password_wrong_current_is_403(user_client):
    response = user_client.put(
        "/api/me/password",
        json={"currentPassword": "nope", "newPassword": "new-password"},
    )
    assert response.status_code == 403
    user_client.post("/api/logout")
    assert login(user_client).status_code == 200


def test_change_password_too_short_is_422(user_client):
    response = user_client.put(
        "/api/me/password",
        json={"currentPassword": "password", "newPassword": "short"},
    )
    assert response.status_code == 422


def test_change_password_requires_session(client):
    response = client.put(
        "/api/me/password",
        json={"currentPassword": "password", "newPassword": "new-password"},
    )
    assert response.status_code == 401


def test_delete_account_removes_user_and_boards(client):
    register(client, "alice", "alice-pass")
    response = client.request("DELETE", "/api/me", json={"password": "alice-pass"})
    assert response.status_code == 204
    assert client.get("/api/me").status_code == 401
    assert login(client, "alice", "alice-pass").status_code == 401


def test_delete_account_wrong_password_is_403(client):
    register(client, "alice", "alice-pass")
    response = client.request("DELETE", "/api/me", json={"password": "wrong"})
    assert response.status_code == 403
    assert client.get("/api/me").status_code == 200


def test_session_of_deleted_user_is_rejected(client):
    register(client, "alice", "alice-pass")
    with TestClient(app) as admin:
        login(admin)
        alice_id = client.get("/api/me").json()["id"]
        assert admin.delete(f"/api/users/{alice_id}").status_code == 204
    assert client.get("/api/me").status_code == 401
    assert client.get("/api/boards").status_code == 401
