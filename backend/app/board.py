from datetime import date

MAX_COLUMNS = 12
PRIORITIES = {"low", "medium", "high"}

INITIAL_BOARD = {
    "columns": [
        {"id": "col-backlog", "title": "Backlog", "cardIds": ["card-1", "card-2"]},
        {"id": "col-discovery", "title": "Discovery", "cardIds": ["card-3"]},
        {"id": "col-progress", "title": "In Progress", "cardIds": ["card-4", "card-5"]},
        {"id": "col-review", "title": "Review", "cardIds": ["card-6"]},
        {"id": "col-done", "title": "Done", "cardIds": ["card-7", "card-8"]},
    ],
    "cards": {
        "card-1": {
            "id": "card-1",
            "title": "Align roadmap themes",
            "details": "Draft quarterly themes with impact statements and metrics.",
        },
        "card-2": {
            "id": "card-2",
            "title": "Gather customer signals",
            "details": "Review support tags, sales notes, and churn feedback.",
        },
        "card-3": {
            "id": "card-3",
            "title": "Prototype analytics view",
            "details": "Sketch initial dashboard layout and key drill-downs.",
        },
        "card-4": {
            "id": "card-4",
            "title": "Refine status language",
            "details": "Standardize column labels and tone across the board.",
        },
        "card-5": {
            "id": "card-5",
            "title": "Design card layout",
            "details": "Add hierarchy and spacing for scanning dense lists.",
        },
        "card-6": {
            "id": "card-6",
            "title": "QA micro-interactions",
            "details": "Verify hover, focus, and loading states.",
        },
        "card-7": {
            "id": "card-7",
            "title": "Ship marketing page",
            "details": "Final copy approved and asset pack delivered.",
        },
        "card-8": {
            "id": "card-8",
            "title": "Close onboarding sprint",
            "details": "Document release notes and share internally.",
        },
    },
}


def empty_board() -> dict:
    return {
        "columns": [
            {"id": column["id"], "title": column["title"], "cardIds": []}
            for column in INITIAL_BOARD["columns"]
        ],
        "cards": {},
    }


def non_empty_text(value: object) -> bool:
    return isinstance(value, str) and bool(value.strip())


def valid_date(value: object) -> bool:
    if not isinstance(value, str) or len(value) != 10:
        return False
    try:
        date.fromisoformat(value)
    except ValueError:
        return False
    return True


def valid_card(card: object, card_id: str) -> bool:
    if not isinstance(card, dict) or card.get("id") != card_id:
        return False
    if not non_empty_text(card.get("title")):
        return False
    if not isinstance(card.get("details", ""), str):
        return False
    priority = card.get("priority")
    if priority is not None and priority not in PRIORITIES:
        return False
    due = card.get("dueDate")
    if due is not None and not valid_date(due):
        return False
    labels = card.get("labels", [])
    return isinstance(labels, list) and all(non_empty_text(label) for label in labels)


def valid_board(data: object) -> bool:
    if not isinstance(data, dict):
        return False
    columns = data.get("columns")
    cards = data.get("cards")
    if not isinstance(columns, list) or not isinstance(cards, dict):
        return False
    if not 1 <= len(columns) <= MAX_COLUMNS:
        return False
    if not all(isinstance(column, dict) for column in columns):
        return False
    column_ids = [column.get("id") for column in columns]
    if not all(non_empty_text(column_id) for column_id in column_ids):
        return False
    if len(set(column_ids)) != len(column_ids):
        return False
    seen: set[str] = set()
    for column in columns:
        card_ids = column.get("cardIds")
        if not non_empty_text(column.get("title")) or not isinstance(card_ids, list):
            return False
        for card_id in card_ids:
            if not isinstance(card_id, str) or card_id in seen:
                return False
            seen.add(card_id)
            if not valid_card(cards.get(card_id), card_id):
                return False
    return seen == set(cards)
