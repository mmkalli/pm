import copy

import pytest

from app.board import INITIAL_BOARD, MAX_COLUMNS, empty_board, valid_board


def board_with(change):
    board = copy.deepcopy(INITIAL_BOARD)
    change(board)
    return board


def set_card(**fields):
    return lambda board: board["cards"]["card-1"].update(fields)


def test_seed_and_empty_boards_are_valid():
    assert valid_board(INITIAL_BOARD)
    assert valid_board(empty_board())


@pytest.mark.parametrize(
    "change",
    [
        set_card(priority="high", dueDate="2026-01-31", labels=["a", "b"]),
        set_card(priority=None, dueDate=None, labels=[]),
        lambda board: [board["cards"].pop(i) for i in board["columns"].pop()["cardIds"]],
        lambda board: board["columns"].reverse(),
        lambda board: board["columns"].append({"id": "col-x", "title": "X", "cardIds": []}),
        lambda board: board["columns"][0].update(id="anything"),
    ],
)
def test_valid_variations(change):
    assert valid_board(board_with(change))


def test_max_columns():
    board = empty_board()
    board["columns"] = [
        {"id": f"c{i}", "title": f"C{i}", "cardIds": []} for i in range(MAX_COLUMNS)
    ]
    assert valid_board(board)
    board["columns"].append({"id": "extra", "title": "Extra", "cardIds": []})
    assert not valid_board(board)


@pytest.mark.parametrize(
    "board",
    [
        None,
        [],
        {"columns": {}, "cards": {}},
        {"columns": [], "cards": {}},
        {"columns": ["a"], "cards": {}},
        board_with(lambda b: b["columns"][1].update(id="col-backlog")),
        board_with(lambda b: b["columns"][0].update(id="")),
        board_with(lambda b: b["columns"][0].update(id=5)),
        board_with(lambda b: b["columns"][0].update(title=" ")),
        board_with(lambda b: b["columns"][0].update(cardIds="card-1")),
        board_with(lambda b: b["columns"][1]["cardIds"].append("card-1")),
        board_with(lambda b: b["columns"][0]["cardIds"].append(7)),
        board_with(lambda b: b["columns"][0]["cardIds"].append("ghost")),
        board_with(lambda b: b["cards"].update(orphan={"id": "orphan", "title": "O"})),
        board_with(lambda b: b["cards"].update({"card-1": "text"})),
        board_with(set_card(id="card-2")),
        board_with(set_card(title="")),
        board_with(set_card(details=5)),
        board_with(set_card(priority="urgent")),
        board_with(set_card(dueDate="2026-02-30")),
        board_with(set_card(dueDate="2026-1-1")),
        board_with(set_card(dueDate=20260101)),
        board_with(set_card(labels="a")),
        board_with(set_card(labels=["ok", " "])),
    ],
)
def test_invalid_boards(board):
    assert not valid_board(board)
