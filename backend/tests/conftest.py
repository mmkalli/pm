import pytest


@pytest.fixture(autouse=True)
def database_path(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "pm.sqlite3"))
