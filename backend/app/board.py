COLUMN_IDS = [
    "col-backlog",
    "col-discovery",
    "col-progress",
    "col-review",
    "col-done",
]

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


def valid_board(data: object) -> bool:
    if not isinstance(data, dict):
        return False
    columns = data.get("columns")
    cards = data.get("cards")
    if not isinstance(columns, list) or not isinstance(cards, dict):
        return False
    if [column.get("id") for column in columns] != COLUMN_IDS:
        return False
    seen: set[str] = set()
    for column in columns:
        title = column.get("title")
        card_ids = column.get("cardIds")
        if not isinstance(title, str) or not title.strip():
            return False
        if not isinstance(card_ids, list):
            return False
        for card_id in card_ids:
            if not isinstance(card_id, str) or card_id in seen:
                return False
            seen.add(card_id)
            card = cards.get(card_id)
            if not isinstance(card, dict):
                return False
            if card.get("id") != card_id:
                return False
            card_title = card.get("title")
            if not isinstance(card_title, str) or not card_title.strip():
                return False
    return True
