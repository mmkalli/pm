# Frontend

Client-only Next.js demo of one Kanban board. State lives in React memory and is lost on refresh. There is no sign-in, API, or AI chat.

## Stack

- Next.js 16.1.6 (App Router), React 19
- Tailwind CSS 4
- `@dnd-kit/core` and `@dnd-kit/sortable` for drag and drop
- Vitest + Testing Library for unit tests
- Playwright for end-to-end tests against `next dev` on port 3000

## Run and test

```bash
npm install
npm run dev
npm run test:unit
npm run test:e2e
```

## Data model

Defined in `src/lib/kanban.ts`.

- `Card`: `id`, `title`, `details`
- `Column`: `id`, `title`, `cardIds`
- `BoardData`: `columns` plus `cards` keyed by id

`initialData` is five columns and eight cards:

| Column id | Title |
| --- | --- |
| `col-backlog` | Backlog |
| `col-discovery` | Discovery |
| `col-progress` | In Progress |
| `col-review` | Review |
| `col-done` | Done |

`moveCard(columns, activeId, overId)` reorders inside a column or moves a card onto another card or column. Dropping on a column id appends the card. `createId(prefix)` builds a client id from random characters and the current time.

## UI behavior

`src/app/page.tsx` renders `App`. On load it calls `GET /api/me`. A 401 shows the login form (`user` / `password`). A session shows `KanbanBoard`, which loads `GET /api/board` and saves with `PUT /api/board`. Log out calls `POST /api/logout`.

- Column titles rename locally, then persist on blur.
- Cards drag within and across columns. A pointer must move 6px before a drag starts.
- Each column can add a card (title required, details optional). Empty details become `No details yet.`
- Each card has Edit and Remove. Edit turns title and details into fields; Save persists; Cancel restores.
- Load or save failures show an error and keep the last saved board.
- An Assistant sidebar on the board sends `POST /api/chat` with the message and the in-memory thread. The thread starts empty on each full page load. A returned board replaces the one on screen. `board: null` leaves the cards. A failed request shows an error and keeps the board.
- Columns cannot be added or removed.
- Colors are CSS variables in `src/app/globals.css`: yellow `#ecad0a`, blue `#209dd7`, purple `#753991`, navy `#032147`, gray `#888888`.
- Fonts: Space Grotesk for headings, Manrope for body, via `next/font`.

## Files

- `src/components/App.tsx` — login gate and logout
- `src/components/App.test.tsx` — logged out form, logged in board, logout
- `src/components/KanbanBoard.tsx` — board state and drag context
- `src/components/ChatSidebar.tsx` — assistant thread and send
- `src/components/KanbanColumn.tsx` — column, droppable area, add form
- `src/components/KanbanCard.tsx` — sortable card, edit, and delete
- `src/components/KanbanCardPreview.tsx` — drag overlay
- `src/components/NewCardForm.tsx` — add-card form
- `src/lib/kanban.ts` — types, seed data, `moveCard`
- `src/lib/kanban.test.ts` — `moveCard` unit tests
- `src/components/KanbanBoard.test.tsx` — load, persist, failed save, chat reply, board update, chat error
- `tests/kanban.spec.ts` — login, logout, load, add, persist, drag against `http://127.0.0.1:8000`

`next.config.ts` uses `output: "export"`. Docker builds `frontend/out` and FastAPI serves it at `/`.
