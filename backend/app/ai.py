import json
import os
import urllib.request

MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free"
URL = "https://openrouter.ai/api/v1/chat/completions"
QUESTION = "What is 2+2? Reply with only the number."


def complete(question: str) -> str:
    body = json.dumps(
        {"model": MODEL, "messages": [{"role": "user", "content": question}]}
    ).encode()
    request = urllib.request.Request(
        URL,
        data=body,
        headers={
            "Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        payload = json.load(response)
    return payload["choices"][0]["message"]["content"]
