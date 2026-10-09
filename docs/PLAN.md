# High level steps for project

> Check items off in this file as they are done. Do not start a part until the previous part's success criteria pass. Part 1 must be approved before Part 2.

## Locked decisions

- The AI may create, edit, move, and remove cards, and rename columns. It returns the full board JSON when it changes the board, or `null` when it does not.
- Column ids stay the five ids in `frontend/src/lib/kanban.ts`. Nothing adds or removes a column.
- Chat history is React state for the current browser tab. The server does not store it. The client sends the current history with each message.
- Sign-in is a session cookie for `user` / `password`. Board and chat APIs reject requests with no valid session.
- The first database creates user `user` / `password` and seeds that user's board from `initialData`.
- SQLite is stored on a Docker volume.
- The model is `nvidia/nemotron-3-ultra-550b-a55b:free` via OpenRouter. `OPENROUTER_API_KEY` is read from the project root `.env` and is never committed.

## Shared board JSON

The API, the database, and the AI all use the frontend `BoardData` shape:

```json
{
  "columns": [
    { "id": "col-backlog", "title": "Backlog", "cardIds": ["card-1"] }
  ],
  "cards": {
    "card-1": { "id": "card-1", "title": "Align roadmap themes", "details": "Draft quarterly themes." }
  }
}
```

A board is valid when:

- `columns` has exactly these ids, in this order: `col-backlog`, `col-discovery`, `col-progress`, `col-review`, `col-done`
- each column title is non-empty
- every `cardIds` entry exists in `cards`, and each card's `id` matches its key
- a card id appears in only one column
- every card in `cards` is listed in a column
- card titles are non-empty

## Shared API

All JSON. Cookie name `session`, set by Starlette `SessionMiddleware` (not `https_only`, `same_site` `lax`). The session value is the username.

| Method | Path | Auth | Body | Success |
| --- | --- | --- | --- | --- |
| GET | `/api/health` | no | | `{ "ok": true }` |
| POST | `/api/login` | no | `{ "username", "password" }` | `200` and session cookie |
| POST | `/api/logout` | no | | `200`, cookie cleared |
| GET | `/api/me` | yes | | `{ "username": "user" }` |
| GET | `/api/board` | yes | | `BoardData` |
| PUT | `/api/board` | yes | `BoardData` | saved `BoardData` |
| POST | `/api/chat` | yes | `{ "message": string, "history": [{ "role": "user" or "assistant", "content": string }] }` | `{ "reply": string, "board": BoardData or null }` |

`POST /api/login` with anything other than `user` / `password` returns `401`. Missing or invalid session on an auth route returns `401`. Invalid board JSON returns `400` and does not write.

`POST /api/chat` sends the model the current board JSON, the history, and the new message. The structured response is `{ "reply": string, "board": BoardData or null }`. A non-null board is saved only when it is valid. An invalid board is dropped, the stored board is left unchanged, and `board` in the HTTP response is `null`. The reply is still returned.

## Layout

- `Dockerfile` — Node builds the Next.js static export, then a `uv` Python image runs FastAPI
- `docker-compose.yml` — service `app` on port `8000`, env file `.env`, volume `pm-data` mounted at `/data`
- `backend/` — FastAPI app and pytest suite. SQLite file `/data/pm.sqlite3`
- `frontend/` — existing Next.js app, statically exported into the image
- `scripts/start.sh`, `scripts/stop.sh`, `scripts/start.ps1`, `scripts/stop.ps1` — `docker compose up --build -d` and `docker compose down`
- `docs/schema.json` and `docs/database.md` — database contract

FastAPI routes are registered before the static mount. The static export is served at `/`.

---

## Part 1: Plan

- [x] Record the decisions above
- [x] Describe the existing frontend in `frontend/AGENTS.md`
- [x] User reviews this file and approves it

Success: the user says this plan is approved.

## Part 2: Scaffolding

- [x] Add `backend/pyproject.toml` with FastAPI, uvicorn, and pytest, managed by `uv`
- [x] Add `backend/app/main.py` with `GET /api/health` and a static `hello.html` at `/` containing the text `Hello`
- [x] Add `Dockerfile` and `docker-compose.yml` as described in Layout. The Python stage uses `uv`. The container runs uvicorn on `0.0.0.0:8000`
- [x] Add the four start and stop scripts. Update `scripts/AGENTS.md` with those names
- [x] Add `backend/tests/test_health.py`: `GET /api/health` returns `200` and `{ "ok": true }`
- [x] Pass `OPENROUTER_API_KEY` through compose from `.env`. Do not read the key in this part

Tests: `uv run pytest` inside `backend/`. Then start the container and request both URLs.

Success: `http://127.0.0.1:8000/` contains `Hello`, and `http://127.0.0.1:8000/api/health` returns `{ "ok": true }`. `scripts/stop.ps1` stops the container.

## Part 3: Add in Frontend

- [x] Set `output: "export"` in `frontend/next.config.ts` and build `frontend/out`
- [x] Copy that export into the image and serve it at `/` instead of `hello.html`
- [x] Keep `GET /api/health`
- [x] Run `npm run test:unit` and keep the current unit tests passing
- [x] Add a pytest check that `GET /` returns HTML containing `Kanban Studio`

Tests: frontend unit tests, backend pytest, then the running container.

Success: `http://127.0.0.1:8000/` shows the five demo columns and the eight seed cards. Drag, rename, add, and delete still work in the browser, in memory only. Refresh resets the board to the seed.

## Part 4: Fake user sign in

- [x] Add `SessionMiddleware` and `POST /api/login`, `POST /api/logout`, `GET /api/me`
- [x] Wrong credentials return `401` and do not set a session
- [x] Add a login view on `/`. If `GET /api/me` is `401`, show the form. If it returns the user, show the current board
- [x] A failed login shows an error and stays on the form. Logout calls `POST /api/logout` and shows the form again
- [x] Use the color scheme: navy headings, purple submit button, gray labels
- [x] Backend tests: success cookie, wrong password `401`, `/api/me` with and without a session, logout then `/api/me` is `401`
- [x] Vitest: logged-out render shows the form; a mocked `/api/me` user shows the board; logout returns to the form
- [x] Point Playwright at `http://127.0.0.1:8000` and update `playwright.config.ts` so it does not start `next dev`. The existing load, add, and drag specs sign in first

Tests: pytest, vitest, Playwright login and logout against the container.

Success: opening `/` shows the login form. `user` / `password` shows the demo board. Any other password does not. Logout returns to the form. The board is still the in-memory demo.

## Part 5: Database modeling

- [x] Write `docs/schema.json` and `docs/database.md` with this schema. No migration framework. Create the tables in Python on startup when the file is missing.

```json
{
  "users": {
    "id": "integer primary key",
    "username": "text unique not null",
    "password": "text not null"
  },
  "boards": {
    "user_id": "integer primary key references users(id)",
    "data": "text not null"
  }
}
```

- `password` is the plaintext dummy password
- `boards.data` is the board JSON
- `boards.user_id` is unique, so one board per user
- seed row: username `user`, password `password`, `data` = `initialData`

The approval of this plan approves this schema. Part 6 uses it as written.

Success: both docs exist and match the JSON above.

## Part 6: Backend

- [x] On startup, create `/data/pm.sqlite3` and the tables if they are missing, then insert the seed user and seed board if that user is missing
- [x] `GET /api/board` returns the signed-in user's board. `PUT /api/board` replaces it when the body is valid
- [x] Reject an invalid board with `400` and leave the stored board unchanged
- [x] Update `backend/AGENTS.md` to describe the app, the routes, and the database file
- [x] Tests use a temporary database file, not the Docker volume

Tests, each as its own pytest:

- missing database file is created and seeded
- `GET /api/board` without a session is `401`
- `GET /api/board` as `user` returns the eight seed cards
- `PUT` of a renamed column is what the next `GET` returns
- `PUT` that adds a card, moves it, edits it, and deletes another card round-trips
- `PUT` with a sixth column, a changed column id, a duplicate card id, or an empty card title returns `400` and the next `GET` is unchanged
- a second user row can be inserted in the test; `user`'s board read does not return that row's data

Success: pytest passes. The running container still serves the in-memory frontend; the UI is not wired yet.

## Part 7: Frontend + Backend

- [x] After login, load the board with `GET /api/board` instead of `initialData`
- [x] After rename, add, delete, drag, and card edit, `PUT /api/board` with the whole board
- [x] Add card edit. An Edit control on the card turns title and details into fields. Save sends the `PUT`. Cancel restores the previous text. Title is required
- [x] On load or save failure, show the error and keep the last board on screen
- [x] Vitest mocks `fetch`: load renders the server board; each mutation sends the updated board; a failed `PUT` leaves the previous board and shows the error
- [x] Playwright against the container: log in, add a card, reload, and see that card. Rename a column, reload, and see the new name

Tests: vitest, pytest, Playwright persistence flow.

Success: refresh keeps the board. A second browser session for the same user sees the same board. Logout and login again shows the saved board.

## Part 8: AI connectivity

- [x] Add a backend function that calls OpenRouter chat completions for model `nvidia/nemotron-3-ultra-550b-a55b:free`, with the key from the environment
- [x] Add a test-only route `POST /api/ai/ping` that asks `What is 2+2? Reply with only the number.` and returns `{ "reply": "<model text>" }`. Require a session
- [x] Unit test the function with a mocked HTTP call and assert the model id and the question were sent
- [x] One live test calls OpenRouter and asserts the reply contains `4`

Tests: mocked pytest always. Live pytest against the running container with `.env` loaded.

Success: the live reply contains `4`.

## Part 9: Structured board updates

- [x] `POST /api/chat` loads the user's board, calls the model with that JSON, the client history, and the message, and requests this structured shape: `{ "reply": string, "board": BoardData or null }`
- [x] Save a valid returned board. Drop an invalid one and respond with `"board": null`
- [x] Do not write chat history to SQLite
- [x] Remove `POST /api/ai/ping` once `POST /api/chat` covers connectivity. Keep the mocked model-id test on the chat call

Tests, with OpenRouter mocked:

- the outbound request includes the stored board JSON, the history, and the message, and uses `nvidia/nemotron-3-ultra-550b-a55b:free`
- a valid returned board that renames a column and adds a card is stored and returned
- `"board": null` leaves the stored board unchanged
- a returned board with a sixth column leaves the stored board unchanged and the HTTP `board` is `null`
- a returned board that moves a card between columns is stored with that card in the destination column only
- no session returns `401`

Success: mocked pytest passes. One live `POST /api/chat` as `user`, message `Add a card titled Plan check to Backlog`, returns a reply and a board that contains that card in `col-backlog`. The next `GET /api/board` returns that board.

## Part 10: AI sidebar

- [x] Add a sidebar on the board page. The user can type a message and see the thread. History is component state and starts empty on each full page load
- [x] Submit calls `POST /api/chat` with the message and the current history. Append the user message immediately, then append the reply
- [x] When the response includes a board, replace the board on screen with it. When `board` is `null`, leave the board as it is
- [x] Show a pending state while the request is in flight, and show the error text when the request fails
- [x] Match the existing board styling. Navy headings, blue for the chat panel accent, purple for send
- [x] Vitest with mocked `fetch`: a reply renders; a response with a board renames or adds what the JSON says; a response with `board: null` does not change the cards; a failed request shows the error and keeps the board

Tests: vitest. Then, in the browser against the container, sign in and ask the model to rename a column. The column title changes without a manual reload.

Success: a chat that changes the board updates the columns and cards on screen, and a reload shows the same board. A chat that only answers a question leaves the cards where they were. Refresh clears the chat transcript and keeps the board.

---

# Phase 2: Full project management app

Goal: grow the MVP into a multi-user, multi-board project management app. Parts 1-10 above describe the MVP; where Phase 2 changes a locked decision, Phase 2 wins.

## Phase 2 decisions

- Users can register. Passwords are stored as salted PBKDF2-SHA256 hashes (stdlib `hashlib`), never plaintext. The seed account `user` / `password` is an admin.
- The session stores the user id. Every authenticated request reloads the user, so a deleted user's session is rejected with `401`.
- Admins manage users: list, create, reset password, grant or revoke admin, delete. An admin cannot delete or demote themself.
- Each user owns any number of boards. A board has an id, a name, the board JSON, and timestamps. Another user's board is `404`.
- Columns are no longer fixed. A board has 1 to 12 columns with unique non-empty ids and non-empty titles. Users can add, rename, reorder, and remove empty columns. New boards start with the five default columns and no cards.
- Cards gain optional `priority` (`low`, `medium`, `high`), `dueDate` (`YYYY-MM-DD`), and `labels` (list of non-empty strings).
- An existing MVP database is migrated on startup (`PRAGMA user_version`): plaintext passwords are hashed, and each user's single board becomes a board named `My Board`.
- The AI chat works per board: `POST /api/boards/{id}/chat`.

## Phase 2 API

| Method | Path | Auth | Body | Success |
| --- | --- | --- | --- | --- |
| POST | `/api/register` | no | `{ "username", "password" }` | `201`, session cookie, `{ "id", "username", "isAdmin" }` |
| POST | `/api/login` | no | `{ "username", "password" }` | `{ "id", "username", "isAdmin" }` |
| POST | `/api/logout` | no | | `{ "ok": true }` |
| GET | `/api/me` | yes | | `{ "id", "username", "isAdmin" }` |
| PUT | `/api/me/password` | yes | `{ "currentPassword", "newPassword" }` | `{ "ok": true }` |
| DELETE | `/api/me` | yes | `{ "password" }` | `204`, session cleared |
| GET | `/api/boards` | yes | | `[{ "id", "name", "cardCount", "createdAt", "updatedAt" }]` |
| POST | `/api/boards` | yes | `{ "name" }` | `201`, board summary |
| GET | `/api/boards/{id}` | yes | | `{ "id", "name", "createdAt", "updatedAt", "data": BoardData }` |
| PATCH | `/api/boards/{id}` | yes | `{ "name" }` | board summary |
| PUT | `/api/boards/{id}/data` | yes | `BoardData` | saved `BoardData` |
| DELETE | `/api/boards/{id}` | yes | | `204` |
| POST | `/api/boards/{id}/chat` | yes | `{ "message", "history" }` | `{ "reply", "board" }` |
| GET | `/api/users` | admin | | `[{ "id", "username", "isAdmin", "boardCount", "createdAt" }]` |
| POST | `/api/users` | admin | `{ "username", "password", "isAdmin" }` | `201`, user |
| PATCH | `/api/users/{id}` | admin | `{ "password"?, "isAdmin"? }` | user |
| DELETE | `/api/users/{id}` | admin | | `204` |

Usernames are 3-32 characters of letters, digits, `.`, `_`, `-`. Passwords are at least 8 characters. Invalid bodies are `422`, a taken username is `409`, a wrong current password is `403`, a non-admin on an admin route is `403`, and an admin acting on themself (delete or demote) is `400`.

## Part 11: Backend users and boards

- [x] Password hashing and schema v1 with migration from the MVP database
- [x] Register, login, me, change password, delete account
- [x] Admin user management routes
- [x] Board CRUD routes and per-board chat; remove `/api/board` and `/api/chat`
- [x] Flexible column validation and card `priority`, `dueDate`, `labels`
- [x] pytest for every route, the migration, and validation rules; update `docs/schema.json`, `docs/database.md`, `backend/AGENTS.md`

Success: pytest passes with coverage above 95% for `backend/app`.

## Part 12: Frontend users and boards

- [ ] Sign-in and register views
- [ ] Board list sidebar: switch, create, rename, delete boards
- [ ] Add, rename, move left and right, and remove empty columns
- [ ] Card priority, due date, and labels: edit and display
- [ ] Search and filter cards on the board by text, priority, and label
- [ ] Account view: change password, delete account
- [ ] Admin view: list, create, reset password, toggle admin, delete users
- [ ] Vitest for each view; update Playwright specs and add multi-board, register, and admin flows; update `frontend/AGENTS.md`

Success: vitest, lint, and Playwright pass against the container.
