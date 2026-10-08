import json
import os
import urllib.request

MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free"
URL = "https://openrouter.ai/api/v1/chat/completions"


def chat(board: dict, history: list[dict], message: str) -> tuple[str, object]:
    messages = [
        {
            "role": "system",
            "content": (
                "You edit a Kanban board. Respond with JSON only, no markdown, "
                'in this shape: {"reply": string, "board": BoardData or null}. '
                "Set board to the full board when you create, edit, move, or remove "
                "cards, or rename columns. Set board to null when you do not change "
                "the board. Keep exactly these column ids in this order: "
                "col-backlog, col-discovery, col-progress, col-review, col-done. "
                "Each card id appears in only one column. Card titles are non-empty.\n"
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
    for _ in range(3):
        request = urllib.request.Request(
            URL,
            data=body,
            headers={
                "Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=180) as response:
            payload = json.load(response)
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
