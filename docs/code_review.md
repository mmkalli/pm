# Code Review

Date: 2026-10-09. Scope: whole repository at commit `de91421` plus the uncommitted e2e reset in `frontend/tests/kanban.spec.ts`.

## Summary

The MVP matches `docs/PLAN.md`: all ten parts are in place, the API contract is followed, and the code is small and readable. All suites pass (backend 21 + 1 live, frontend unit 15, Playwright 8, lint clean).

The main risks are one data-loss race between the AI chat and manual edits, three backend paths that return `500` where they should not, and frontend network failures that are not handled. Everything else is minor cleanup.

Findings marked "verified" were reproduced with a script against the app, not only read from the code.

## Status (2026-10-09)

Actions 1-11 and 13 are done. For action 12, the frontend build requirement and the `uv` fallback are documented. Playwright still uses `channel: "msedge"` because downloading the bundled Chromium was declined. Retest: backend 25 passed and 1 live passed, frontend unit 22 passed, Playwright 8 passed (twice), lint clean.

## Actions

| # | Severity | Action | Files |
| --- | --- | --- | --- |
| 1 | High | Lock the board while a chat request is pending | `KanbanBoard.tsx`, `ChatSidebar.tsx` |
| 2 | Medium | Make `valid_board` reject malformed entries instead of crashing | `backend/app/board.py` |
| 3 | Medium | Retry OpenRouter on HTTP 429/5xx, with a short pause | `backend/app/ai.py` |
| 4 | Medium | Handle rejected `fetch` calls in the frontend | `App.tsx`, `KanbanBoard.tsx` |
| 5 | Medium | Do not save an empty or unchanged column title | `KanbanBoard.tsx` |
| 6 | Low | Restrict chat history roles to `user` / `assistant` | `backend/app/main.py` |
| 7 | Low | Reject cards that no column references | `backend/app/board.py` |
| 8 | Low | Check login against the `users` table | `backend/app/main.py`, `backend/app/db.py` |
| 9 | Low | Close SQLite connections on errors | `backend/app/db.py` |
| 10 | Low | Make card edit use the same empty-details text as add | `KanbanCard.tsx` |
| 11 | Low | Repository hygiene: ignore test output, fill or remove empty README | `.gitignore`, `.dockerignore`, `backend/README.md` |
| 12 | Low | Test setup portability | `backend/tests/test_health.py`, `playwright.config.ts` |
| 13 | Low | Add tests for findings 2, 3, and 5 | `backend/tests`, `frontend/src` |

## Findings

### 1. Chat reply can overwrite manual edits (High)

`POST /api/chat` reads the stored board when the request starts (`backend/app/main.py:94`), and the model takes 30 seconds or more to answer. During that time the board stays fully editable: `ChatSidebar` disables only its own textarea. If the user drags, adds, or edits a card in that window, the `PUT` succeeds. Then the AI's board, built from the older snapshot, is saved over it (`main.py:99`) and replaces the screen (`KanbanBoard.tsx:153`). The manual change is lost without any message.

Action: move `pending` up to `KanbanBoard` (or pass an `onPendingChange` callback) and disable drag, add, edit, delete, and rename while it is true. This is the simplest fix that fits the single-user MVP. A server-side version check would also work, but it is more than the MVP needs.

### 2. Malformed board returns 500 instead of 400 (Medium, verified)

`valid_board` calls `column.get(...)` without checking that each column is a dict (`board.py:69`, `board.py:73`). A `PUT /api/board` with `"columns": ["a","b","c","d","e"]` returns `500`. The same crash happens inside `POST /api/chat` when the model returns a malformed board. In that case the user loses the reply as well, instead of getting the reply with `board: null` as the plan specifies.

Action: in the comprehension and the loop, return `False` when a column is not a dict. Do the same for `details` when it is present but not a string.

### 3. OpenRouter retry never retries HTTP errors (Medium, verified)

The retry loop in `ai.py:35` only retries when a `200` response has no `choices`. `urllib.request.urlopen` raises `HTTPError` on 429 and 5xx, and free models often answer with those codes. The first error escapes, so the loop makes one attempt and `/api/chat` returns `500`. The retries also run back to back with no pause.

Action: catch `urllib.error.HTTPError` inside the loop, read its JSON body into `payload`, and sleep about a second before the next attempt.

### 4. Network failures are not handled in the frontend (Medium)

Only `ChatSidebar` wraps `fetch` in `try/catch`. When the server is unreachable:

- `App.tsx:15`: the `/api/me` promise rejects and the session stays `"loading"`, so the page stays blank forever.
- `App.tsx:23`: login rejects with no message.
- `KanbanBoard.tsx:36`: board load rejects and shows a blank page with no error.
- `KanbanBoard.tsx:50`: save rejects, so the optimistic board stays on screen as if it were saved, with no error.

Action: wrap these calls in `try/catch` and route the failure to the existing error paths. For `/api/me`, fall back to `"guest"`. For saves, reuse the "Could not save the board." rollback.

### 5. Column rename saves on every blur, including empty titles (Medium)

`onBlur` always calls `handleRenameCommit` (`KanbanColumn.tsx:49`), even when the title did not change, so every focus-out sends a `PUT`. Clearing the title sends an empty title, which the server rejects with `400`, and the user sees a generic "Could not save the board." message.

Action: in `handleRenameCommit`, compare the trimmed title with the persisted one. If it is empty, restore the persisted title. If it is unchanged, do nothing.

### 6. Chat history accepts any role (Low, verified)

`HistoryItem.role` is a plain `str` (`main.py:37`), so a client can send `"system"` messages to the model. The plan specifies `"user"` or `"assistant"`.

Action: `role: Literal["user", "assistant"]`.

### 7. Orphan cards are accepted (Low)

`valid_board` checks that every referenced card exists, but not that every card is referenced. A board whose `cards` contains entries no column lists is saved, and those cards are invisible from then on. The AI is the most likely source.

Action: require `seen == set(cards)` at the end of `valid_board`. Also add this rule to `docs/PLAN.md` and `docs/database.md`.

### 8. Login ignores the database (Low)

`main.py:60` compares against hardcoded strings, while `users` stores usernames and passwords that nothing reads. The MVP behaviour is correct, but the database is meant to support more users later.

Action: look up the username and password in `users` (a small `check_user` in `db.py`). The seeded `user` / `password` keeps working unchanged.

### 9. SQLite connections leak on exceptions (Low)

`db.py` opens a connection, then calls `close()` at the end. An exception in between skips the close.

Action: use `with closing(connect()) as conn:` together with `with conn:` for the commit.

### 10. Inconsistent empty details (Low)

Adding a card with no details stores `"No details yet."` (`KanbanBoard.tsx:121`). Editing a card and clearing its details stores `""` (`KanbanCard.tsx:30`).

Action: pick one behaviour and apply it in both places.

### 11. Repository hygiene (Low)

- `frontend/test-results/.last-run.json` is committed. Add `test-results/` and `playwright-report/` to `frontend/.gitignore`, then remove the file from git.
- `.dockerignore` does not list `.env`. The file is not copied into the image, but it is sent with the build context. Add it, along with `frontend/test-results`.
- `backend/README.md` is empty, and there is no root README. Add a minimal root README covering start, stop, and tests, or delete the empty file.

### 12. Test setup portability (Low)

- `test_health.py::test_root_contains_kanban_studio` needs `frontend/out`. On a fresh clone `backend/` pytest fails until `npm run build` has run. Document this in `backend/AGENTS.md` or build in a fixture.
- `playwright.config.ts` uses `channel: "msedge"`, which requires Microsoft Edge to be installed. On Mac or Linux, the bundled Chromium (`npx playwright install chromium`, no channel) works everywhere.
- On this machine `uv` is not on `PATH`, so `uv run pytest` fails. Tests ran through `backend/.venv/Scripts/python.exe -m pytest`. Install `uv` or document the fallback.

### 13. Missing tests (Low)

- Backend: `PUT /api/board` with non-dict columns returns `400`. The chat retry recovers after an HTTP 429. A chat with a malformed board returns the reply with `board: null`. A `system` history role returns `422`.
- Frontend: renaming to an empty title restores the old title without a `PUT`. Board controls are disabled while a chat is pending. A rejected `fetch` shows an error.

## Noted, no action for the MVP

- The seed board is defined twice: `frontend/src/lib/kanban.ts` and `backend/app/board.py`. They match today, and the e2e reset relies on that. Keep them in sync when either changes.
- The session secret is hardcoded (`main.py:24`), so anyone with the source can forge a cookie. This is acceptable for a local single-user app. Read it from `.env` before the app is exposed beyond localhost.
- Chat history is sent in full with every message and grows without limit. This is fine for short sessions.
- Drag and drop is mouse-only (no `KeyboardSensor`). Adding one would make cards movable from the keyboard.
- Two tabs that edit the same board use last-write-wins. This is accepted by the plan.
