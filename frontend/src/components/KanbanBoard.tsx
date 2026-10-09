"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { ChatSidebar } from "@/components/ChatSidebar";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { createId, moveCard, type BoardData } from "@/lib/kanban";

type KanbanBoardProps = {
  onLogout?: () => void;
};

export const KanbanBoard = ({ onLogout }: KanbanBoardProps) => {
  const [board, setBoard] = useState<BoardData | null>(null);
  const persistedRef = useRef<BoardData | null>(null);
  const [error, setError] = useState("");
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [chatPending, setChatPending] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  useEffect(() => {
    fetch("/api/board", { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error();
        }
        const data = (await response.json()) as BoardData;
        persistedRef.current = data;
        setBoard(data);
      })
      .catch(() => setError("Could not load the board."));
  }, []);

  const save = async (next: BoardData) => {
    const previous = persistedRef.current;
    setBoard(next);
    try {
      const response = await fetch("/api/board", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!response.ok) {
        throw new Error();
      }
    } catch {
      if (previous) {
        setBoard(previous);
      }
      setError("Could not save the board.");
      return;
    }
    persistedRef.current = next;
    setError("");
  };

  const cardsById = useMemo(() => board?.cards ?? {}, [board]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardId(null);
    if (!board || !over || active.id === over.id) {
      return;
    }
    const next = {
      ...board,
      columns: moveCard(board.columns, active.id as string, over.id as string),
    };
    void save(next);
  };

  const handleRenameColumn = (columnId: string, title: string) => {
    setBoard((prev) =>
      prev
        ? {
            ...prev,
            columns: prev.columns.map((column) =>
              column.id === columnId ? { ...column, title } : column
            ),
          }
        : prev
    );
  };

  const handleRenameCommit = (columnId: string, title: string) => {
    const persisted = persistedRef.current;
    if (!board || !persisted) {
      return;
    }
    const trimmed = title.trim();
    const saved = persisted.columns.find((column) => column.id === columnId)?.title;
    if (!trimmed || trimmed === saved) {
      handleRenameColumn(columnId, saved ?? title);
      return;
    }
    const next = {
      ...board,
      columns: board.columns.map((column) =>
        column.id === columnId ? { ...column, title: trimmed } : column
      ),
    };
    void save(next);
  };

  const handleAddCard = (columnId: string, title: string, details: string) => {
    if (!board) {
      return;
    }
    const id = createId("card");
    const next = {
      ...board,
      cards: {
        ...board.cards,
        [id]: { id, title, details: details || "No details yet." },
      },
      columns: board.columns.map((column) =>
        column.id === columnId
          ? { ...column, cardIds: [...column.cardIds, id] }
          : column
      ),
    };
    void save(next);
  };

  const handleDeleteCard = (columnId: string, cardId: string) => {
    if (!board) {
      return;
    }
    const next = {
      ...board,
      cards: Object.fromEntries(
        Object.entries(board.cards).filter(([id]) => id !== cardId)
      ),
      columns: board.columns.map((column) =>
        column.id === columnId
          ? {
              ...column,
              cardIds: column.cardIds.filter((id) => id !== cardId),
            }
          : column
      ),
    };
    void save(next);
  };

  const handleChatBoard = (next: BoardData) => {
    persistedRef.current = next;
    setBoard(next);
    setError("");
  };

  const handleEditCard = (cardId: string, title: string, details: string) => {
    if (!board) {
      return;
    }
    const next = {
      ...board,
      cards: {
        ...board.cards,
        [cardId]: { ...board.cards[cardId], title, details: details || "No details yet." },
      },
    };
    void save(next);
  };

  const activeCard = activeCardId ? cardsById[activeCardId] : null;

  if (!board) {
    return (
      <main className="px-6 py-16">
        {error ? (
          <p className="text-sm text-[var(--navy-dark)]" role="alert">
            {error}
          </p>
        ) : null}
      </main>
    );
  }

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <main className="relative mx-auto flex min-h-screen max-w-[1500px] flex-col gap-10 px-6 pb-16 pt-12">
        <header className="flex flex-col gap-6 rounded-[32px] border border-[var(--stroke)] bg-white/80 p-8 shadow-[var(--shadow)] backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
                Single Board Kanban
              </p>
              <h1 className="mt-3 font-display text-4xl font-semibold text-[var(--navy-dark)]">
                Kanban Studio
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--gray-text)]">
                Keep momentum visible. Rename columns, drag cards between stages,
                and capture quick notes without getting buried in settings.
              </p>
            </div>
            <div className="flex flex-col items-end gap-3">
              {onLogout ? (
                <button
                  type="button"
                  onClick={onLogout}
                  className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]"
                >
                  Log out
                </button>
              ) : null}
              <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
                  Focus
                </p>
                <p className="mt-2 text-lg font-semibold text-[var(--primary-blue)]">
                  One board. Five columns. Zero clutter.
                </p>
              </div>
            </div>
          </div>
          {error ? (
            <p className="text-sm text-[var(--navy-dark)]" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-4">
            {board.columns.map((column) => (
              <div
                key={column.id}
                className="flex items-center gap-2 rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--navy-dark)]"
              >
                <span className="h-2 w-2 rounded-full bg-[var(--accent-yellow)]" />
                {column.title}
              </div>
            ))}
          </div>
        </header>

        <div className="flex flex-col gap-6 xl:flex-row">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <section className="grid min-w-0 flex-1 gap-6 lg:grid-cols-5">
              {board.columns.map((column) => (
                <KanbanColumn
                  key={column.id}
                  column={column}
                  cards={column.cardIds.map((cardId) => board.cards[cardId])}
                  onRename={handleRenameColumn}
                  onRenameCommit={handleRenameCommit}
                  onAddCard={handleAddCard}
                  onDeleteCard={handleDeleteCard}
                  onEditCard={handleEditCard}
                  locked={chatPending}
                />
              ))}
            </section>
            <DragOverlay>
              {activeCard ? (
                <div className="w-[260px]">
                  <KanbanCardPreview card={activeCard} />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
          <ChatSidebar
            onBoard={handleChatBoard}
            pending={chatPending}
            onPendingChange={setChatPending}
          />
        </div>
      </main>
    </div>
  );
};
