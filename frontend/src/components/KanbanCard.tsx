import { useState, type FormEvent } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import { PRIORITIES, isOverdue, parseLabels, type Card, type Priority } from "@/lib/kanban";
import { ghostButton, primaryButton } from "@/components/ui";

const priorityClass: Record<Priority, string> = {
  high: "bg-[var(--secondary-purple)] text-white",
  medium: "bg-[var(--accent-yellow)] text-[var(--navy-dark)]",
  low: "bg-[var(--surface)] text-[var(--gray-text)]",
};

const fieldClass =
  "w-full rounded-xl border border-[var(--stroke)] px-3 py-2 text-sm text-[var(--navy-dark)] outline-none";

export const CardMeta = ({ card, today }: { card: Card; today: string }) => {
  const labels = card.labels ?? [];
  if (!card.priority && !card.dueDate && labels.length === 0) {
    return null;
  }
  const overdue = isOverdue(card, today);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
      {card.priority ? (
        <span className={clsx("rounded-full px-2 py-0.5 uppercase", priorityClass[card.priority])}>
          {card.priority}
        </span>
      ) : null}
      {card.dueDate ? (
        <span
          className={clsx(
            "rounded-full border px-2 py-0.5",
            overdue
              ? "border-[var(--secondary-purple)] text-[var(--secondary-purple)]"
              : "border-[var(--stroke)] text-[var(--gray-text)]"
          )}
          data-testid="due-date"
        >
          {overdue ? "Overdue " : "Due "}
          {card.dueDate}
        </span>
      ) : null}
      {labels.map((label) => (
        <span
          key={label}
          className="rounded-full bg-[rgba(32,157,215,0.12)] px-2 py-0.5 text-[var(--primary-blue)]"
        >
          {label}
        </span>
      ))}
    </div>
  );
};

type KanbanCardProps = {
  card: Card;
  today: string;
  onDelete: (cardId: string) => void;
  onEdit: (card: Card) => void;
  locked: boolean;
};

export const KanbanCard = ({ card, today, onDelete, onEdit, locked }: KanbanCardProps) => {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(card.title);
  const [details, setDetails] = useState(card.details);
  const [priority, setPriority] = useState<Priority | "">(card.priority ?? "");
  const [dueDate, setDueDate] = useState(card.dueDate ?? "");
  const [labels, setLabels] = useState((card.labels ?? []).join(", "));
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id, disabled: editing || locked });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const startEditing = () => {
    setTitle(card.title);
    setDetails(card.details);
    setPriority(card.priority ?? "");
    setDueDate(card.dueDate ?? "");
    setLabels((card.labels ?? []).join(", "));
    setEditing(true);
  };

  const handleSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) {
      return;
    }
    onEdit({
      id: card.id,
      title: title.trim(),
      details: details.trim(),
      priority: priority || null,
      dueDate: dueDate || null,
      labels: parseLabels(labels),
    });
    setEditing(false);
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={clsx(
        "rounded-2xl border border-transparent bg-white px-4 py-4 shadow-[0_12px_24px_rgba(3,33,71,0.08)]",
        "transition-all duration-150",
        isDragging && "opacity-60 shadow-[0_18px_32px_rgba(3,33,71,0.16)]"
      )}
      {...(editing ? {} : attributes)}
      {...(editing ? {} : listeners)}
      data-testid={`card-${card.id}`}
    >
      {editing ? (
        <form
          onSubmit={handleSave}
          className="space-y-3"
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            aria-label="Card title"
            className={clsx(fieldClass, "font-medium")}
            required
          />
          <textarea
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            aria-label="Card details"
            rows={3}
            className={clsx(fieldClass, "resize-none text-[var(--gray-text)]")}
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              value={priority}
              onChange={(event) => setPriority(event.target.value as Priority | "")}
              aria-label="Card priority"
              className={fieldClass}
            >
              <option value="">No priority</option>
              {PRIORITIES.map((value) => (
                <option key={value} value={value}>
                  {value[0].toUpperCase() + value.slice(1)}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              aria-label="Card due date"
              className={fieldClass}
            />
          </div>
          <input
            value={labels}
            onChange={(event) => setLabels(event.target.value)}
            aria-label="Card labels"
            placeholder="Labels, comma separated"
            className={fieldClass}
          />
          <div className="flex items-center gap-2">
            <button type="submit" disabled={locked} className={primaryButton}>
              Save
            </button>
            <button type="button" onClick={() => setEditing(false)} className={ghostButton}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h4 className="font-display text-base font-semibold text-[var(--navy-dark)]">
              {card.title}
            </h4>
            <p className="mt-2 text-sm leading-6 text-[var(--gray-text)]">{card.details}</p>
            <CardMeta card={card} today={today} />
          </div>
          <div
            className="flex flex-col items-end gap-1"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={startEditing}
              disabled={locked}
              className="rounded-full border border-transparent px-2 py-1 text-xs font-semibold text-[var(--gray-text)] transition hover:border-[var(--stroke)] hover:text-[var(--navy-dark)]"
              aria-label={`Edit ${card.title}`}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => onDelete(card.id)}
              disabled={locked}
              className="rounded-full border border-transparent px-2 py-1 text-xs font-semibold text-[var(--gray-text)] transition hover:border-[var(--stroke)] hover:text-[var(--navy-dark)]"
              aria-label={`Delete ${card.title}`}
            >
              Remove
            </button>
          </div>
        </div>
      )}
    </article>
  );
};
