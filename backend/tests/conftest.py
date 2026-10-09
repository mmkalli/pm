import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(autouse=True)
def database_path(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "pm.sqlite3"))
    monkeypatch.setattr("app.auth.ITERATIONS", 1000)


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def user_client(client):
    """Signed in as the seed admin `user`."""
    assert login(client).status_code == 200
    return client


def login(client: TestClient, username: str = "user", password: str = "password"):
    return client.post("/api/login", json={"username": username, "password": password})


def register(client: TestClient, username: str, password: str = "secret-pass"):
    return client.post("/api/register", json={"username": username, "password": password})


def first_board_id(client: TestClient) -> int:
    return client.get("/api/boards").json()[0]["id"]
