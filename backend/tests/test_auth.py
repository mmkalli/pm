import os
import sqlite3

from fastapi.testclient import TestClient

from app.main import app


def login(client: TestClient, username: str = "user", password: str = "password"):
    return client.post(
        "/api/login", json={"username": username, "password": password}
    )


def test_login_sets_session_cookie():
    with TestClient(app) as client:
        response = login(client)
        assert response.status_code == 200
        assert "session" in response.cookies


def test_login_wrong_password_is_401():
    with TestClient(app) as client:
        response = login(client, password="wrong")
        assert response.status_code == 401
        assert "session" not in response.cookies


def test_login_checks_users_table():
    with TestClient(app) as client:
        conn = sqlite3.connect(os.environ["DATABASE_PATH"])
        conn.execute(
            "INSERT INTO users (username, password) VALUES (?, ?)",
            ("other", "secret"),
        )
        conn.commit()
        conn.close()
        assert login(client, "other", "secret").status_code == 200
        assert login(client, "other", "password").status_code == 401


def test_me_without_session_is_401():
    with TestClient(app) as client:
        response = client.get("/api/me")
        assert response.status_code == 401


def test_me_with_session_returns_user():
    with TestClient(app) as client:
        login(client)
        response = client.get("/api/me")
        assert response.status_code == 200
        assert response.json() == {"username": "user"}


def test_logout_then_me_is_401():
    with TestClient(app) as client:
        login(client)
        logout = client.post("/api/logout")
        assert logout.status_code == 200
        response = client.get("/api/me")
        assert response.status_code == 401
