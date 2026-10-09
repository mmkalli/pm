# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Read `AGENTS.md` (project rules, color scheme, coding standards) and `docs/PLAN.md` (locked decisions, API contract) before changing anything. `backend/AGENTS.md`, `frontend/AGENTS.md`, and `scripts/AGENTS.md` describe each area in detail. Keep those files current when behavior changes.

## Key rules from AGENTS.md

- Keep it simple. No over-engineering, no extra features, no unnecessary defensive code.
- No emojis anywhere. Keep READMEs minimal.
- When debugging, find and prove the root cause before fixing.
- Work in `docs/PLAN.md` is done part by part; check items off as they complete.

## Commands

Run the whole app (Docker, port 8000, reads `OPENROUTER_API_KEY` from root `.env`):

```bash
scripts/start.sh      # or scripts/start.ps1 on Windows: docker compose up --build -d
scripts/stop.sh       # or scripts/stop.ps1: docker compose down
```

Backend (from `backend/`, Python 3.14, `uv`):

```bash
uv run pytest
uv run pytest --cov --cov-report=term-missing
uv run pytest tests/test_board.py::test_name
LIVE_AI=1 uv run pytest tests/test_ai.py::test_live_chat_adds_plan_check_to_backlog   # hits the running container and real OpenRouter
```

Tests mock OpenRouter and use a temp `DATABASE_PATH` (`tests/conftest.py`). If `uv` is not on `PATH`, run `.venv/Scripts/python.exe -m pytest` instead. `test_health.py` needs `frontend/out`, so run `npm run build` in `frontend/` first. Running the app outside Docker needs `frontend/out` built first, since `StaticFiles` mounts it at `/` (override with `STATIC_DIR`).

Frontend (from `frontend/`):

```bash
npm run test:unit                                  # Vitest, jsdom
npm run test:coverage                              # Vitest with v8 coverage
npx vitest run src/lib/kanban.test.ts -t "name"    # single unit test
npm run test:e2e                                   # Playwright
npm run lint
npm run build                                      # static export to frontend/out
```

Playwright runs against `http://127.0.0.1:8000` using the installed Microsoft Edge (`channel: "msedge"`). The Docker container must be running. Each test registers a throwaway user and deletes it afterwards; `tests/admin.spec.ts` signs in as `user` / `password`.

## Architecture

One Docker image: Node stage builds the Next.js static export (`output: "export"`), then a `uv` Python stage runs FastAPI with uvicorn and serves that export at `/`. API routes in `backend/app/main.py` are registered before the static mount. There is no Next.js server at runtime, so the frontend is client-only and talks to `/api/*` with the session cookie. The full API contract is the Phase 2 API table in `docs/PLAN.md`.

The shared data shape is `BoardData` from `frontend/src/lib/kanban.ts` (`columns` with `cardIds`, plus `cards` keyed by id, with optional card `priority`, `dueDate`, `labels`). It is used unchanged by the API, stored as JSON in SQLite (`boards.data`, many boards per user), and sent to and returned from the AI. Validation lives in `backend/app/board.py` (`valid_board`): 1 to 12 columns with unique ids and non-empty titles, every card referenced exactly once, valid optional card fields. The demo board is duplicated in `backend/app/board.py`; keep it in sync with `initialData`.

AI chat (`backend/app/ai.py`): `POST /api/boards/{id}/chat` sends that board, the client-held history, and the new message to OpenRouter (`nvidia/nemotron-3-ultra-550b-a55b:free`, JSON response format, stdlib `urllib`). The model returns `{ "reply", "board" }`. A valid board is saved and returned; an invalid or null board leaves storage unchanged and the response `board` is `null`. Model failures are `502`. History lives only in React state. While a chat request is pending, `KanbanBoard` locks all board editing so the AI's board cannot overwrite a manual edit.

Users: passwords are PBKDF2 hashes (`backend/app/auth.py`); the session (Starlette `SessionMiddleware`, cookie `session`) stores the user id, and `current_user` reloads the user on every request. Admin routes (`/api/users`) use the `admin_user` dependency. A board owned by someone else is `404`. SQLite lives at `DATABASE_PATH` (default `/data/pm.sqlite3` on the `pm-data` volume); on startup `init_db` creates tables, migrates an MVP database, and seeds admin `user` / `password` when there are no users. Schema: `docs/schema.json`, notes: `docs/database.md`.
