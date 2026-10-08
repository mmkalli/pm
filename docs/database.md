# Database

SQLite file: `/data/pm.sqlite3` on the `pm-data` Docker volume. No migration framework. On startup, if the file or tables are missing, Python creates them and seeds the dummy user.

## Tables

See `docs/schema.json`.

- `users.password` is plaintext. MVP login is `user` / `password`.
- `boards.user_id` is the primary key, so one board per user.
- `boards.data` is the board JSON (`BoardData` from `frontend/src/lib/kanban.ts`).

## Seed

Inserted only when user `user` is missing:

| Table | Values |
| --- | --- |
| `users` | `username=user`, `password=password` |
| `boards` | that user's `data` = `initialData` |

`initialData` is five columns (`col-backlog`, `col-discovery`, `col-progress`, `col-review`, `col-done`) and eight cards (`card-1` through `card-8`).

## Valid board JSON

- `columns` has exactly those five ids, in that order
- each column title is non-empty
- every `cardIds` entry exists in `cards`, and each card's `id` matches its key
- a card id appears in only one column
- card titles are non-empty
