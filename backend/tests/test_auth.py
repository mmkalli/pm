from fastapi.testclient import TestClient

from app.main import app


def test_login_sets_session_cookie():
    client = TestClient(app)
    response = client.post(
        "/api/login", json={"username": "user", "password": "password"}
    )
    assert response.status_code == 200
    assert "session" in response.cookies


def test_login_wrong_password_is_401():
    client = TestClient(app)
    response = client.post(
        "/api/login", json={"username": "user", "password": "wrong"}
    )
    assert response.status_code == 401
    assert "session" not in response.cookies


def test_me_without_session_is_401():
    client = TestClient(app)
    response = client.get("/api/me")
    assert response.status_code == 401


def test_me_with_session_returns_user():
    client = TestClient(app)
    client.post("/api/login", json={"username": "user", "password": "password"})
    response = client.get("/api/me")
    assert response.status_code == 200
    assert response.json() == {"username": "user"}


def test_logout_then_me_is_401():
    client = TestClient(app)
    client.post("/api/login", json={"username": "user", "password": "password"})
    logout = client.post("/api/logout")
    assert logout.status_code == 200
    response = client.get("/api/me")
    assert response.status_code == 401
