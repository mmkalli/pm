from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"ok": True}


def test_root_contains_kanban_studio():
    response = client.get("/")
    assert response.status_code == 200
    assert "Kanban Studio" in response.text
