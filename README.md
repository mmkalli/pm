# Kanban Studio

Single-board Kanban app with an AI assistant. FastAPI serves a static Next.js build from one Docker container.

Put `OPENROUTER_API_KEY=...` in `.env` at the project root.

## Run

```bash
scripts/start.sh   # Windows: scripts/start.ps1
scripts/stop.sh    # Windows: scripts/stop.ps1
```

Open http://127.0.0.1:8000 and sign in as `user` / `password`.

## Test

```bash
cd frontend && npm run build && npm run test:unit
cd backend && uv run pytest
cd frontend && npm run test:e2e   # needs the container running; resets the board
```
