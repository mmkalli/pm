import json
import os
import time
import urllib.error
import urllib.request
from datetime import date

MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free"
URL = "https://openrouter.ai/api/v1/chat/completions"
RETRY_DELAY = 1


def chat(board: dict, history: list[dict], message: str) -> tuple[str, object]:
    messages = [
        {
            "role": "system",
            "content": (
                "You edit a Kanban board. Respond with JSON only, no markdown, "
                'in this shape: {"reply": string, "board": BoardData or null}. '
                "Set board to the full board when you create, edit, move, or remove "
                "cards, or add, rename, reorder, or remove columns. Set board to null "
                "when you do not change the board. A board has 1 to 12 columns, each "
                "with a unique id, a non-empty title, and cardIds. Keep existing ids. "
                "Each card id appears in exactly one column and matches its key in "
                "cards. A card has a non-empty title, details text, and optional "
                'priority ("low", "medium", or "high"), dueDate ("YYYY-MM-DD"), and '
                "labels (list of non-empty strings). Every card object repeats its "
                'own id, for example "cards": {"card-a1": {"id": "card-a1", '
                '"title": "Write spec", "details": ""}}. '
                f"Today is {date.today().isoformat()}.\n"
                "Current board:\n" + json.dumps(board)
            ),
        },
        *history,
        {"role": "user", "content": message},
    ]
    body = json.dumps(
        {
            "model": MODEL,
            "messages": messages,
            "response_format": {"type": "json_object"},
        }
    ).encode()
    payload: dict = {}
    for attempt in range(3):
        if attempt:
            time.sleep(RETRY_DELAY)
        request = urllib.request.Request(
            URL,
            data=body,
            headers={
                "Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=180) as response:
                payload = json.load(response)
        except urllib.error.HTTPError as error:
            payload = {"error": {"message": f"OpenRouter HTTP {error.code}"}}
        if "choices" in payload:
            break
    if "choices" not in payload:
        error = payload.get("error", {})
        detail = "OpenRouter error"
        if isinstance(error, dict):
            detail = error.get("message", detail)
        raise RuntimeError(detail)
    content = payload["choices"][0]["message"]["content"].strip()
    if content.startswith("```"):
        content = content.split("\n", 1)[1].removesuffix("```").strip()
    parsed = json.loads(content)
    return parsed["reply"], parsed.get("board")
