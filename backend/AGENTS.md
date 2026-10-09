# Backend

FastAPI app in `app/main.py`. Uvicorn in Docker on `0.0.0.0:8000`. Package manager is `uv`.

## Run tests

```bash
uv run pytest
uv run pytest --cov --cov-report=term-missing
```

Tests set `DATABASE_PATH` to a temp file and lower the PBKDF2 iterations (`tests/conftest.py`). Fixtures: `client` (no session), `user_client` (signed in as the seed admin `user`). `tests/test_health.py` reads `frontend/out`, so run `npm run build` in `frontend/` first. If `uv` is not on `PATH`, use `.venv/Scripts/python.exe -m pytest` (Windows) or `.venv/bin/python -m pytest`. Keep line coverage of `app/` at 100%.

## Routes

The full contract is in `docs/PLAN.md` (Phase 2 API).

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/api/health` | no |
| POST | `/api/register`, `/api/login`, `/api/logout` | no |
| GET, DELETE | `/api/me` | session |
| PUT | `/api/me/password` | session |
| GET, POST | `/api/boards` | session |
| GET | `/api/boards/{id}` | owner or member |
| PATCH, DELETE | `/api/boards/{id}` | owner (member gets 403) |
| PUT | `/api/boards/{id}/data?version=N` | owner or member; invalid board is 400, stale version is 409 |
| POST | `/api/boards/{id}/chat` | owner or member |
| GET, POST | `/api/boards/{id}/members` | GET owner or member; POST owner |
| DELETE | `/api/boards/{id}/members/{userId}` | owner, or the member leaving |
| GET, POST | `/api/users` | admin |
| PATCH, DELETE | `/api/users/{id}` | admin |

The session stores `user_id`. `current_user` reloads the user on each request, so a deleted user's session gets `401`. `board_for(user, id, owner=...)` loads a board the user owns or is a member of; anyone else gets `404`, and a member doing an owner action gets `403`. Data saves return `{ "data", "version" }`; the chat saves the AI board only if the version is unchanged since the call started, otherwise `409`. The system prompt shows the exact card shape, because on an empty board the model otherwise omits card ids.

`POST /api/boards/{id}/chat` body is `{ "message", "history" }`. History roles must be `user` or `assistant` (otherwise `422`). History is not stored. The model is `nvidia/nemotron-3-ultra-550b-a55b:free` with `OPENROUTER_API_KEY`. OpenRouter is tried up to 3 times, 1 second apart, on HTTP errors or a response with no `choices`; after that, or when the model output is not the expected JSON, the route returns `502`. A valid returned board is saved. An invalid board or `"board": null` leaves the stored board unchanged and the response `board` is `null`. `uv run pytest` mocks OpenRouter. `LIVE_AI=1 uv run pytest tests/test_ai.py::test_live_chat_adds_plan_check_to_backlog` calls the running container.

Static Next.js export is mounted at `/` after these routes.

Session cookie name is `session` (Starlette `SessionMiddleware`, `same_site=lax`, not `https_only`). The signing key is `SESSION_SECRET` from the environment, with a local default.

## Database

See `docs/database.md`. Seed user is `user` / `password` (admin) with the `Product Roadmap` demo board from `app/board.py`.

## Files

- `app/main.py` — routes, request models, session and admin dependencies
- `app/ai.py` — OpenRouter chat completion
- `app/auth.py` — PBKDF2 password hashing
- `app/db.py` — schema, MVP migration, seed, user and board queries
- `app/board.py` — seed board, empty board, validation
