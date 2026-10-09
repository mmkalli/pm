# Database

SQLite file: `/data/pm.sqlite3` on the `pm-data` Docker volume (override with `DATABASE_PATH`). No migration framework. On startup `init_db` creates missing tables, migrates an MVP database, and seeds the first user. Foreign keys are on for every connection.

## Tables

See `docs/schema.json`. `PRAGMA user_version` is `2`.

- `users.username` is unique, case-insensitive.
- `users.password_hash` is `pbkdf2_sha256$<iterations>$<salt>$<hex digest>` (`backend/app/auth.py`).
- `users.is_admin` is `0` or `1`.
- `boards.user_id` owns the board. Deleting a user deletes their boards.
- `boards.version` starts at 1 and goes up by one on every data save. A save with a stale expected version writes nothing.
- `board_members` lists users the owner shared a board with. Deleting the board or the user removes the row.
- `boards.data` is the board JSON (`BoardData` from `frontend/src/lib/kanban.ts`).
- Timestamps are ISO 8601 UTC strings. `boards.updated_at` changes on rename and on data save.

## Seed

When `users` is empty: user `user` / `password`, admin, with a board named `Product Roadmap` holding `initialData` (five columns, eight cards). Every user created later (register or admin) gets one empty board named `My Board` with the five default columns.

## Upgrades

A version 1 database gets `boards.version` (existing boards start at 1) and the `board_members` table.

## MVP migration

If `user_version` is `0` and `users` has a plaintext `password` column, the MVP tables are renamed, copied into the new tables (passwords hashed, `user` made admin, each board named `My Board`, ids kept), and dropped.

## Valid board JSON

- `columns` has 1 to 12 entries, each with a unique non-empty string `id`, a non-empty `title`, and a `cardIds` list
- every `cardIds` entry exists in `cards`, and each card's `id` matches its key
- a card id appears in only one column, and every card in `cards` is listed in a column
- card `title` is non-empty, `details` is a string
- optional card fields: `priority` is `low`, `medium`, or `high`; `dueDate` is a `YYYY-MM-DD` date; `labels` is a list of non-empty strings. `null` is accepted for `priority` and `dueDate`
