import clsx from "clsx";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Card, Column } from "@/lib/kanban";
import { KanbanCard } from "@/components/KanbanCard";
import { NewCardForm } from "@/components/NewCardForm";

type KanbanColumnProps = {
  column: Column;
  cards: Card[];
  today: string;
  onRename: (columnId: string, title: string) => void;
  onRenameCommit: (columnId: string, title: string) => void;
  onAddCard: (columnId: string, title: string, details: string) => void;
  onDeleteCard: (columnId: string, cardId: string) => void;
  onEditCard: (card: Card) => void;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
  onRemove?: () => void;
  locked: boolean;
};

const iconButton =
  "rounded-full px-2 py-1 text-xs font-semibold text-[var(--gray-text)] transition hover:text-[var(--navy-dark)] disabled:opacity-30";

export const KanbanColumn = ({
  column,
  cards,
  today,
  onRename,
  onRenameCommit,
  onAddCard,
  onDeleteCard,
  onEditCard,
  onMoveLeft,
  onMoveRight,
  onRemove,
  locked,
}: KanbanColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <section
      ref={setNodeRef}
      className={clsx(
        "flex min-h-[520px] w-72 shrink-0 flex-col rounded-3xl border border-[var(--stroke)] bg-[var(--surface-strong)] p-4 shadow-[var(--shadow)] transition",
        isOver && "ring-2 ring-[var(--accent-yellow)]"
      )}
      data-testid={`column-${column.id}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="h-2 w-10 rounded-full bg-[var(--accent-yellow)]" />
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
            {cards.length} cards
          </span>
        </div>
        <div className="flex items-center">
          <button
            type="button"
            onClick={onMoveLeft}
            disabled={locked || !onMoveLeft}
            aria-label={`Move ${column.title} left`}
            className={iconButton}
          >
            &larr;
          </button>
          <button
            type="button"
            onClick={onMoveRight}
            disabled={locked || !onMoveRight}
            aria-label={`Move ${column.title} right`}
            className={iconButton}
          >
            &rarr;
          </button>
          {onRemove ? (
            <button
              type="button"
              onClick={onRemove}
              disabled={locked}
              aria-label={`Remove column ${column.title}`}
              className={iconButton}
            >
              &times;
            </button>
          ) : null}
        </div>
      </div>
      <input
        value={column.title}
        onChange={(event) => onRename(column.id, event.target.value)}
        onBlur={(event) => onRenameCommit(column.id, event.target.value)}
        className="mt-3 w-full bg-transparent font-display text-lg font-semibold text-[var(--navy-dark)] outline-none"
        aria-label="Column title"
        disabled={locked}
      />
      <div className="mt-4 flex flex-1 flex-col gap-3">
        <SortableContext items={cards.map((card) => card.id)} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              today={today}
              onDelete={(cardId) => onDeleteCard(column.id, cardId)}
              onEdit={onEditCard}
              locked={locked}
            />
          ))}
        </SortableContext>
        {cards.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-[var(--stroke)] px-3 py-6 text-center text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
            Drop a card here
          </div>
        )}
      </div>
      <NewCardForm onAdd={(title, details) => onAddCard(column.id, title, details)} locked={locked} />
    </section>
  );
};
