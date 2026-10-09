import copy

from fastapi.testclient import TestClient

from app.board import INITIAL_BOARD, empty_board
from app.main import app
from conftest import first_board_id, register


def test_boards_require_session(client):
    assert client.get("/api/boards").status_code == 401
    assert client.post("/api/boards", json={"name": "X"}).status_code == 401
    assert client.get("/api/boards/1").status_code == 401
    assert client.put("/api/boards/1/data", json=INITIAL_BOARD).status_code == 401
    assert client.delete("/api/boards/1").status_code == 401


def test_seed_user_has_roadmap_board_with_eight_cards(user_client):
    boards = user_client.get("/api/boards").json()
    assert len(boards) == 1
    assert boards[0]["name"] == "Product Roadmap"
    assert boards[0]["cardCount"] == 8
    board = user_client.get(f"/api/boards/{boards[0]['id']}").json()
    assert board["data"] == INITIAL_BOARD
    assert board["name"] == "Product Roadmap"


def test_create_board_starts_with_default_columns_and_no_cards(user_client):
    response = user_client.post("/api/boards", json={"name": "  Launch  "})
    assert response.status_code == 201
    summary = response.json()
    assert summary["name"] == "Launch"
    assert summary["cardCount"] == 0
    board = user_client.get(f"/api/boards/{summary['id']}").json()
    assert board["data"] == empty_board()
    names = [board["name"] for board in user_client.get("/api/boards").json()]
    assert names == ["Product Roadmap", "Launch"]


def test_create_board_rejects_blank_or_long_name(user_client):
    assert user_client.post("/api/boards", json={"name": "   "}).status_code == 422
    assert user_client.post("/api/boards", json={"name": "x" * 81}).status_code == 422


def test_rename_board(user_client):
    board_id = first_board_id(user_client)
    response = user_client.patch(f"/api/boards/{board_id}", json={"name": "Renamed"})
    assert response.status_code == 200
    assert response.json()["name"] == "Renamed"
    assert user_client.get(f"/api/boards/{board_id}").json()["name"] == "Renamed"


def test_delete_board(user_client):
    created = user_client.post("/api/boards", json={"name": "Temp"}).json()
    assert user_client.delete(f"/api/boards/{created['id']}").status_code == 204
    assert user_client.get(f"/api/boards/{created['id']}").status_code == 404
    assert user_client.delete(f"/api/boards/{created['id']}").status_code == 404
    assert len(user_client.get("/api/boards").json()) == 1


def test_missing_board_is_404(user_client):
    assert user_client.get("/api/boards/999").status_code == 404
    assert user_client.patch("/api/boards/999", json={"name": "x"}).status_code == 404
    assert user_client.put("/api/boards/999/data", json=INITIAL_BOARD).status_code == 404


def test_put_renamed_column_is_returned_by_get(user_client):
    board_id = first_board_id(user_client)
    data = user_client.get(f"/api/boards/{board_id}").json()["data"]
    data["columns"][0]["title"] = "Ideas"
    put = user_client.put(f"/api/boards/{board_id}/data", json=data)
    assert put.status_code == 200
    assert put.json() == data
    stored = user_client.get(f"/api/boards/{board_id}").json()
    assert stored["data"]["columns"][0]["title"] == "Ideas"
    assert stored["updatedAt"] >= stored["createdAt"]


def test_put_add_move_edit_delete_round_trips(user_client):
    board_id = first_board_id(user_client)
    board = user_client.get(f"/api/boards/{board_id}").json()["data"]
    board["cards"]["card-new"] = {
        "id": "card-new",
        "title": "Renamed card",
        "details": "Added",
        "priority": "high",
        "dueDate": "2026-12-01",
        "labels": ["api", "urgent"],
    }
    board["columns"][0]["cardIds"].append("card-new")
    board["columns"][0]["cardIds"].remove("card-1")
    board["columns"][3]["cardIds"].insert(0, "card-1")
    del board["cards"]["card-2"]
    board["columns"][0]["cardIds"].remove("card-2")
    assert user_client.put(f"/api/boards/{board_id}/data", json=board).status_code == 200
    saved = user_client.get(f"/api/boards/{board_id}").json()["data"]
    assert saved == board
    assert user_client.get("/api/boards").json()[0]["cardCount"] == 8


def test_put_custom_columns(user_client):
    board_id = first_board_id(user_client)
    board = {
        "columns": [
            {"id": "col-todo", "title": "Todo", "cardIds": ["a"]},
            {"id": "col-done", "title": "Done", "cardIds": []},
        ],
        "cards": {"a": {"id": "a", "title": "A", "details": ""}},
    }
    assert user_client.put(f"/api/boards/{board_id}/data", json=board).status_code == 200
    assert user_client.get(f"/api/boards/{board_id}").json()["data"] == board


def test_put_invalid_board_is_400_and_unchanged(user_client):
    board_id = first_board_id(user_client)
    original = user_client.get(f"/api/boards/{board_id}").json()["data"]
    duplicate = copy.deepcopy(original)
    duplicate["columns"][1]["cardIds"].append("card-1")
    no_columns = {"columns": [], "cards": {}}
    response = user_client.put(f"/api/boards/{board_id}/data", json=duplicate)
    assert response.status_code == 400
    assert user_client.put(f"/api/boards/{board_id}/data", json=no_columns).status_code == 400
    assert user_client.get(f"/api/boards/{board_id}").json()["data"] == original


def test_other_users_boards_are_404(client):
    register(client, "alice")
    alice_board = first_board_id(client)
    with TestClient(app) as other:
        register(other, "bob")
        assert other.get(f"/api/boards/{alice_board}").status_code == 404
        assert other.patch(f"/api/boards/{alice_board}", json={"name": "x"}).status_code == 404
        assert other.put(f"/api/boards/{alice_board}/data", json=INITIAL_BOARD).status_code == 404
        assert other.delete(f"/api/boards/{alice_board}").status_code == 404
        assert [b["id"] for b in other.get("/api/boards").json()] != [alice_board]
    assert client.get(f"/api/boards/{alice_board}").status_code == 200
