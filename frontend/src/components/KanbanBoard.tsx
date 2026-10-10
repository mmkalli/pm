"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
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
import { MembersPanel } from "@/components/MembersPanel";
import { errorClass, ghostButton, inputClass, primaryButton } from "@/components/ui";
import { api, ApiError, type BoardRecord, type BoardSummary } from "@/lib/api";
import {
  MAX_COLUMNS,
  PRIORITIES,
  addColumn,
  boardLabels,
  boardStats,
  cardMatches,
  createId,
  emptyFilter,
  isFiltering,
  moveCard,
  removeColumn,
  shiftColumn,
  todayIso,
  type BoardData,
  type Card,
  type CardFilter,
  type Priority,
} from "@/lib/kanban";

type KanbanBoardProps = {
  boardId: number;
  userId: number;
  onSummaryChange?: (change: Partial<BoardSummary>) => void;
  onDeleted?: () => void;
};

const CONFLICT = "Someone else changed this board, so your last change was not saved. The latest version is shown.";

export const KanbanBoard = ({ boardId, userId, onSummaryChange, onDeleted }: KanbanBoardProps) => {
  const [board, setBoard] = useState<BoardData | null>(null);
  const persistedRef = useRef<BoardData | null>(null);
  const versionRef = useRef(0);
  const [owner, setOwner] = useState("");
  const [isOwner, setIsOwner] = useState(false);
  const [reloads, setReloads] = useState(0);
  const [name, setName] = useState("");
  const savedNameRef = useRef("");
  const [error, setError] = useState("");
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [chatPending, setChatPending] = useState(false);
  const [filter, setFilter] = useState<CardFilter>(emptyFilter);
  const [newColumn, setNewColumn] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  useEffect(() => {
    api<BoardRecord>(`/api/boards/${boardId}`)
      .then((record) => {
        persistedRef.current = record.data;
        versionRef.current = record.version;
        savedNameRef.current = record.name;
        setBoard(record.data);
        setName(record.name);
        setOwner(record.owner);
        setIsOwner(record.role === "owner");
      })
      .catch(() => setError("Could not load the board."));
  }, [boardId, reloads]);

  const reloadAfterConflict = () => {
    setError(CONFLICT);
    setReloads((count) => count + 1);
  };

  const markSaved = (next: BoardData, version: number) => {
    persistedRef.current = next;
    versionRef.current = version;
    setError("");
    onSummaryChange?.({ cardCount: Object.keys(next.cards).length });
  };

  const save = async (next: BoardData) => {
    const previous = persistedRef.current;
    setBoard(next);
    let saved: { version: number };
    try {
      saved = await api(`/api/boards/${boardId}/data?version=${versionRef.current}`, "PUT", next);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) {
        reloadAfterConflict();
        return;
      }
      setBoard(previous);
      setError("Could not save the board.");
      return;
    }
    markSaved(next, saved.version);
  };

  const handleNameCommit = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === savedNameRef.current) {
      setName(savedNameRef.current);
      return;
    }
    try {
      await api(`/api/boards/${boardId}`, "PATCH", { name: trimmed });
    } catch {
      setName(savedNameRef.current);
      setError("Could not rename the board.");
      return;
    }
    savedNameRef.current = trimmed;
    setName(trimmed);
    setError("");
    onSummaryChange?.({ name: trimmed });
  };

  const handleDeleteBoard = async () => {
    const question = isOwner
      ? `Delete the board "${savedNameRef.current}" and all its cards?`
      : `Leave the board "${savedNameRef.current}"?`;
    if (!window.confirm(question)) {
      return;
    }
    try {
      await api(
        isOwner ? `/api/boards/${boardId}` : `/api/boards/${boardId}/members/${userId}`,
        "DELETE"
      );
    } catch {
      setError(isOwner ? "Could not delete the board." : "Could not leave the board.");
      return;
    }
    onDeleted?.();
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string);
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

  const handleChatBoard = (next: BoardData, version: number) => {
    setBoard(next);
    markSaved(next, version);
  };

  if (!board) {
    return error ? (
      <p className={errorClass} role="alert">
        {error}
      </p>
    ) : null;
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardId(null);
    if (!over || active.id === over.id) {
      return;
    }
    void save({
      ...board,
      columns: moveCard(board.columns, active.id as string, over.id as string),
    });
  };

  const handleRenameCommit = (columnId: string, title: string) => {
    const trimmed = title.trim();
    const saved = persistedRef.current?.columns.find((column) => column.id === columnId)?.title;
    if (!trimmed || trimmed === saved) {
      handleRenameColumn(columnId, saved ?? title);
      return;
    }
    void save({
      ...board,
      columns: board.columns.map((column) =>
        column.id === columnId ? { ...column, title: trimmed } : column
      ),
    });
  };

  const handleAddColumn = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = newColumn.trim();
    if (!title || board.columns.length >= MAX_COLUMNS) {
      return;
    }
    setNewColumn("");
    void save(addColumn(board, title));
  };

  const handleAddCard = (columnId: string, title: string, details: string) => {
    const id = createId("card");
    void save({
      ...board,
      cards: {
        ...board.cards,
        [id]: { id, title, details: details || "No details yet." },
      },
      columns: board.columns.map((column) =>
        column.id === columnId ? { ...column, cardIds: [...column.cardIds, id] } : column
      ),
    });
  };

  const handleDeleteCard = (columnId: string, cardId: string) => {
    void save({
      ...board,
      cards: Object.fromEntries(Object.entries(board.cards).filter(([id]) => id !== cardId)),
      columns: board.columns.map((column) =>
        column.id === columnId
          ? { ...column, cardIds: column.cardIds.filter((id) => id !== cardId) }
          : column
      ),
    });
  };

  const handleEditCard = (card: Card) => {
    void save({
      ...board,
      cards: {
        ...board.cards,
        [card.id]: { ...card, details: card.details || "No details yet." },
      },
    });
  };

  const activeCard = activeCardId ? board.cards[activeCardId] : null;
  const today = todayIso();
  const stats = boardStats(board, today);
  const labels = boardLabels(board);
  const filtering = isFiltering(filter);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 rounded-[28px] border border-[var(--stroke)] bg-white/80 p-6 shadow-[var(--shadow)] backdrop-blur">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              onBlur={() => void handleNameCommit()}
              aria-label="Board name"
              maxLength={80}
              disabled={chatPending || !isOwner}
              className="w-full bg-transparent font-display text-3xl font-semibold text-[var(--navy-dark)] outline-none"
            />
            <p className="mt-2 text-sm text-[var(--gray-text)]" data-testid="board-stats">
              {stats.total} cards · {stats.high} high priority ·{" "}
              <span className={stats.overdue ? "font-semibold text-[var(--secondary-purple)]" : ""}>
                {stats.overdue} overdue
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleDeleteBoard()}
            disabled={chatPending}
            className={ghostButton}
          >
            {isOwner ? "Delete board" : "Leave board"}
          </button>
        </div>
        <MembersPanel boardId={boardId} owner={owner} isOwner={isOwner} />
        <div className="flex flex-wrap items-center gap-3" role="search">
          <input
            value={filter.text}
            onChange={(event) => setFilter({ ...filter, text: event.target.value })}
            placeholder="Search cards"
            aria-label="Search cards"
            className={`${inputClass} max-w-xs`}
          />
          <select
            value={filter.priority}
            onChange={(event) =>
              setFilter({ ...filter, priority: event.target.value as Priority | "" })
            }
            aria-label="Filter by priority"
            className={`${inputClass} w-auto`}
          >
            <option value="">Any priority</option>
            {PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {priority[0].toUpperCase() + priority.slice(1)}
              </option>
            ))}
          </select>
          <select
            value={filter.label}
            onChange={(event) => setFilter({ ...filter, label: event.target.value })}
            aria-label="Filter by label"
            className={`${inputClass} w-auto`}
          >
            <option value="">Any label</option>
            {labels.map((label) => (
              <option key={label} value={label}>
                {label}
              </option>
            ))}
          </select>
          {filtering ? (
            <button type="button" onClick={() => setFilter(emptyFilter)} className={ghostButton}>
              Clear filters
            </button>
          ) : null}
        </div>
        {error ? (
          <p className={errorClass} role="alert">
            {error}
          </p>
        ) : null}
      </section>

      <div className="flex flex-col gap-6 2xl:flex-row">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <section className="flex min-w-0 flex-1 items-start gap-4 overflow-x-auto pb-4">
            {board.columns.map((column, index) => (
              <KanbanColumn
                key={column.id}
                column={column}
                cards={column.cardIds
                  .map((cardId) => board.cards[cardId])
                  .filter((card) => cardMatches(card, filter))}
                today={today}
                onRename={handleRenameColumn}
                onRenameCommit={handleRenameCommit}
                onAddCard={handleAddCard}
                onDeleteCard={handleDeleteCard}
                onEditCard={handleEditCard}
                onMoveLeft={
                  index > 0 ? () => void save(shiftColumn(board, column.id, -1)) : undefined
                }
                onMoveRight={
                  index < board.columns.length - 1
                    ? () => void save(shiftColumn(board, column.id, 1))
                    : undefined
                }
                onRemove={
                  column.cardIds.length === 0 && board.columns.length > 1
                    ? () => void save(removeColumn(board, column.id))
                    : undefined
                }
                locked={chatPending}
              />
            ))}
            {board.columns.length < MAX_COLUMNS ? (
              <form
                onSubmit={handleAddColumn}
                className="flex w-64 shrink-0 flex-col gap-2 rounded-3xl border border-dashed border-[var(--stroke)] p-4"
              >
                <input
                  value={newColumn}
                  onChange={(event) => setNewColumn(event.target.value)}
                  placeholder="New column title"
                  aria-label="New column title"
                  disabled={chatPending}
                  className={inputClass}
                />
                <button type="submit" disabled={chatPending} className={primaryButton}>
                  Add column
                </button>
              </form>
            ) : null}
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
          boardId={boardId}
          onBoard={handleChatBoard}
          onConflict={reloadAfterConflict}
          pending={chatPending}
          onPendingChange={setChatPending}
        />
      </div>
    </div>
  );
};
