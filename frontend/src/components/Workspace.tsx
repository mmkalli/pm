"use client";

import { useEffect, useState, type FormEvent } from "react";
import clsx from "clsx";
import { AccountSettings } from "@/components/AccountSettings";
import { AdminUsers } from "@/components/AdminUsers";
import { KanbanBoard } from "@/components/KanbanBoard";
import { api, errorText, type BoardSummary, type User } from "@/lib/api";
import { errorClass, ghostButton, inputClass, primaryButton } from "@/components/ui";

type View = "boards" | "account" | "users";

const LAST_BOARD = "pm:lastBoard";

const readLastBoard = () => {
  try {
    return Number(localStorage.getItem(LAST_BOARD));
  } catch {
    return 0;
  }
};

const rememberBoard = (id: number) => {
  try {
    localStorage.setItem(LAST_BOARD, String(id));
  } catch {
    // Storage can be unavailable; the first board opens instead.
  }
};

type WorkspaceProps = {
  user: User;
  onLogout: () => void;
  onSignedOut: () => void;
};

export const Workspace = ({ user, onLogout, onSignedOut }: WorkspaceProps) => {
  const [view, setView] = useState<View>("boards");
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api<BoardSummary[]>("/api/boards")
      .then((list) => {
        setBoards(list);
        const last = readLastBoard();
        setSelectedId(list.find((board) => board.id === last)?.id ?? list[0]?.id ?? null);
      })
      .catch(() => setError("Could not load your boards."));
  }, []);

  const selectBoard = (id: number) => {
    setSelectedId(id);
    rememberBoard(id);
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newName.trim();
    if (!name) {
      return;
    }
    try {
      const created = await api<BoardSummary>("/api/boards", "POST", { name });
      setBoards((current) => [...current, created]);
      selectBoard(created.id);
      setNewName("");
      setError("");
    } catch (caught) {
      setError(errorText(caught, "Could not create the board."));
    }
  };

  const handleSummaryChange = (id: number, change: Partial<BoardSummary>) => {
    setBoards((current) =>
      current.map((board) => (board.id === id ? { ...board, ...change } : board))
    );
  };

  const handleDeleted = (id: number) => {
    const remaining = boards.filter((board) => board.id !== id);
    setBoards(remaining);
    setSelectedId(remaining[0]?.id ?? null);
  };

  const boardGroups: [string, string, BoardSummary[]][] = [
    ["Your boards", "Boards", boards.filter((board) => board.role === "owner")],
    ["Shared with you", "Shared boards", boards.filter((board) => board.role === "member")],
  ];

  const navItems: { id: View; label: string }[] = [
    { id: "boards", label: "Boards" },
    { id: "account", label: "Account" },
    ...(user.isAdmin ? [{ id: "users" as View, label: "Users" }] : []),
  ];

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <div className="relative mx-auto flex max-w-[1800px] flex-col gap-6 px-6 pb-16 pt-8">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-[28px] border border-[var(--stroke)] bg-white/80 px-6 py-4 shadow-[var(--shadow)] backdrop-blur">
          <div className="flex items-center gap-3">
            <span className="h-3 w-3 rounded-full bg-[var(--accent-yellow)]" />
            <h1 className="font-display text-2xl font-semibold text-[var(--navy-dark)]">
              Kanban Studio
            </h1>
          </div>
          <nav className="flex flex-wrap items-center gap-2" aria-label="Main">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setView(item.id)}
                aria-current={view === item.id ? "page" : undefined}
                className={clsx(
                  "rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wide transition",
                  view === item.id
                    ? "bg-[var(--navy-dark)] text-white"
                    : "text-[var(--gray-text)] hover:text-[var(--navy-dark)]"
                )}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-[var(--navy-dark)]" data-testid="current-user">
              {user.username}
            </span>
            <button type="button" onClick={onLogout} className={ghostButton}>
              Log out
            </button>
          </div>
        </header>

        {error ? (
          <p className={errorClass} role="alert">
            {error}
          </p>
        ) : null}

        {view === "account" ? <AccountSettings onDeleted={onSignedOut} /> : null}
        {view === "users" ? <AdminUsers currentUserId={user.id} /> : null}
        {view === "boards" ? (
          <div className="flex flex-col gap-6 lg:flex-row">
            <aside className="flex w-full shrink-0 flex-col gap-4 rounded-3xl border border-[var(--stroke)] bg-white/90 p-5 shadow-[var(--shadow)] lg:w-60">
              {boardGroups.map(([title, label, items]) =>
                items.length || label === "Boards" ? (
                  <div key={label} className="flex flex-col gap-2">
                    <h2 className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
                      {title}
                    </h2>
                    <ul className="flex flex-col gap-1" aria-label={label}>
                      {items.map((board) => (
                        <li key={board.id}>
                          <button
                            type="button"
                            onClick={() => selectBoard(board.id)}
                            aria-current={board.id === selectedId ? "true" : undefined}
                            className={clsx(
                              "flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold transition",
                              board.id === selectedId
                                ? "bg-[var(--surface)] text-[var(--navy-dark)] ring-1 ring-[var(--primary-blue)]"
                                : "text-[var(--gray-text)] hover:bg-[var(--surface)]"
                            )}
                          >
                            <span className="min-w-0">
                              <span className="block truncate">{board.name}</span>
                              {board.role === "member" ? (
                                <span className="block text-xs font-medium text-[var(--gray-text)]">
                                  by {board.owner}
                                </span>
                              ) : null}
                            </span>
                            <span className="text-xs text-[var(--gray-text)]">{board.cardCount}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null
              )}
              <form onSubmit={handleCreate} className="space-y-2">
                <input
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  placeholder="New board name"
                  aria-label="New board name"
                  maxLength={80}
                  className={inputClass}
                />
                <button type="submit" className={primaryButton}>
                  Create board
                </button>
              </form>
            </aside>
            <div className="min-w-0 flex-1">
              {selectedId === null ? (
                <p className="text-sm text-[var(--gray-text)]">
                  You have no boards yet. Create one to get started.
                </p>
              ) : (
                <KanbanBoard
                  key={selectedId}
                  boardId={selectedId}
                  userId={user.id}
                  onSummaryChange={(change) => handleSummaryChange(selectedId, change)}
                  onDeleted={() => handleDeleted(selectedId)}
                />
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
