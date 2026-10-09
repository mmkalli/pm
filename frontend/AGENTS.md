# Frontend

Client-only Next.js app, statically exported and served by FastAPI. Users sign in or register, manage several Kanban boards, and use an AI chat sidebar per board. Admins manage users.

## Stack

- Next.js 16.1.6 (App Router), React 19
- Tailwind CSS 4
- `@dnd-kit/core` and `@dnd-kit/sortable` for drag and drop
- Vitest + Testing Library for unit tests
- Playwright (Microsoft Edge channel) for end-to-end tests against the running container at `http://127.0.0.1:8000`

## Run and test

```bash
npm install
npm run dev
npm run test:unit
npm run test:coverage
npm run test:e2e
npm run lint
```

Unit tests stub `fetch` with `src/test/mockFetch.ts` (`mockFetch(handler)` and `bodiesFor(fetchMock, method, path)`). `src/test/setup.ts` points `localStorage` at jsdom (Node 26 has its own global `localStorage`, undefined without `--localstorage-file`), and clears storage, unstubs globals, and restores spies after each test. Keep line coverage above 95%.

Playwright tests register a throwaway user per test (`tests/helpers.ts`) and delete it afterwards, so they do not touch the `user` account's boards. `tests/admin.spec.ts` signs in as `user` / `password` and needs that password unchanged.

## Data model

Defined in `src/lib/kanban.ts`.

- `Card`: `id`, `title`, `details`, optional `priority` (`low`, `medium`, `high`), `dueDate` (`YYYY-MM-DD`), `labels`
- `Column`: `id`, `title`, `cardIds`
- `BoardData`: `columns` plus `cards` keyed by id

`initialData` is the five-column, eight-card demo board. Helpers: `moveCard`, `createId`, `addColumn`, `removeColumn`, `shiftColumn`, `parseLabels`, `boardLabels`, `isOverdue`, `cardMatches`, `isFiltering`, `boardStats`, `todayIso`.

`src/lib/api.ts` has the API types and `api(path, method, body)`, which sends JSON with the session cookie and throws `ApiError(status, detail)`; status `0` means the server was unreachable.

## UI behavior

`App` calls `GET /api/me`. No session shows `AuthForm` (sign in, or switch to create an account). A session shows `Workspace`.

- `Workspace`: top bar with Boards, Account, Users (admins only), the username, and Log out. The Boards view lists "Your boards" and "Shared with you" (with the owner) and creates boards. The last opened board id is kept in `localStorage` (`pm:lastBoard`) and reopened; otherwise the first board opens. The selected board is rendered as `<KanbanBoard key={id}>`, so switching boards remounts it and clears the chat.
- `KanbanBoard`: loads `GET /api/boards/{id}`, saves the whole board with `PUT /api/boards/{id}/data?version=N`, and rolls back with an error on failure. A `409` (from a save or the chat) shows a conflict message and reloads the latest board. Owners rename on blur (`PATCH`) and Delete board; members see the name read-only and Leave board. `MembersPanel` shows the owner and members; the owner shares by username and removes members. Header shows card, high priority, and overdue counts, plus search, priority, and label filters. Columns can be added (up to 12), moved left or right, renamed on blur, and removed when empty.
- Cards drag within and across columns (6px activation). Add takes title and details (empty details become `No details yet.`). Edit covers title, details, priority, due date, and comma-separated labels. Overdue due dates are highlighted.
- `ChatSidebar` posts to `/api/boards/{id}/chat` with the in-memory thread. A returned board replaces the one on screen; `board: null` leaves it. While a request is pending, all board editing is disabled.
- `AccountSettings`: change password (with confirmation field) and delete account (password plus browser confirm).
- `AdminUsers`: table of users with role, board count, and created date; add user, make or revoke admin, reset password, delete. The current admin cannot change their own role or delete themself.
- Colors are CSS variables in `src/app/globals.css`: yellow `#ecad0a`, blue `#209dd7`, purple `#753991`, navy `#032147`, gray `#888888`. Shared class strings are in `src/components/ui.ts`.
- Fonts: Space Grotesk for headings, Manrope for body, via `next/font`.

## Files

- `src/components/App.tsx` — session gate
- `src/components/AuthForm.tsx` — sign in and register
- `src/components/Workspace.tsx` — navigation, board list, create board
- `src/components/KanbanBoard.tsx` — board state, header, filters, columns, drag context
- `src/components/KanbanColumn.tsx` — column, droppable area, column controls, add form
- `src/components/KanbanCard.tsx` — sortable card, edit form, `CardMeta` badges
- `src/components/KanbanCardPreview.tsx` — drag overlay
- `src/components/NewCardForm.tsx` — add-card form
- `src/components/MembersPanel.tsx` — board members, share and remove
- `src/components/ChatSidebar.tsx` — assistant thread and send
- `src/components/AccountSettings.tsx` — password change and account deletion
- `src/components/AdminUsers.tsx` — user management
- `src/components/ui.ts` — shared Tailwind class strings
- `src/lib/kanban.ts`, `src/lib/api.ts` — data helpers and API client
- `tests/*.spec.ts` — Playwright: auth, board editing, multiple boards, sharing and conflicts, admin

`next.config.ts` uses `output: "export"`. Docker builds `frontend/out` and FastAPI serves it at `/`.
