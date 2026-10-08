# Backend

FastAPI app in `app/main.py`. Uvicorn in Docker on `0.0.0.0:8000`. Package manager is `uv`.

## Run tests

```bash
uv run pytest
```

Tests set `DATABASE_PATH` to a temp file. They do not use the Docker volume.

## Routes

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/api/health` | no |
| POST | `/api/login` | no (`user` / `password`) |
| POST | `/api/logout` | no |
| GET | `/api/me` | session cookie |
| GET | `/api/board` | session cookie |
| PUT | `/api/board` | session cookie; invalid board is 400 |

Static Next.js export is mounted at `/` after these routes.

Session cookie name is `session` (Starlette `SessionMiddleware`, `same_site=lax`, not `https_only`).

## Database

SQLite at `DATABASE_PATH`, default `/data/pm.sqlite3`. Created and seeded on startup if missing. Schema is `docs/schema.json`. Seed user is `user` / `password` with the demo board from `app/board.py`.

## Files

- `app/main.py` — routes and session
- `app/db.py` — sqlite init, get, save
- `app/board.py` — seed board JSON and validation
