export type Priority = "low" | "medium" | "high";

export type Card = {
  id: string;
  title: string;
  details: string;
  priority?: Priority | null;
  dueDate?: string | null;
  labels?: string[];
};

export type Column = {
  id: string;
  title: string;
  cardIds: string[];
};

export type BoardData = {
  columns: Column[];
  cards: Record<string, Card>;
};

export const initialData: BoardData = {
  columns: [
    { id: "col-backlog", title: "Backlog", cardIds: ["card-1", "card-2"] },
    { id: "col-discovery", title: "Discovery", cardIds: ["card-3"] },
    {
      id: "col-progress",
      title: "In Progress",
      cardIds: ["card-4", "card-5"],
    },
    { id: "col-review", title: "Review", cardIds: ["card-6"] },
    { id: "col-done", title: "Done", cardIds: ["card-7", "card-8"] },
  ],
  cards: {
    "card-1": {
      id: "card-1",
      title: "Align roadmap themes",
      details: "Draft quarterly themes with impact statements and metrics.",
    },
    "card-2": {
      id: "card-2",
      title: "Gather customer signals",
      details: "Review support tags, sales notes, and churn feedback.",
    },
    "card-3": {
      id: "card-3",
      title: "Prototype analytics view",
      details: "Sketch initial dashboard layout and key drill-downs.",
    },
    "card-4": {
      id: "card-4",
      title: "Refine status language",
      details: "Standardize column labels and tone across the board.",
    },
    "card-5": {
      id: "card-5",
      title: "Design card layout",
      details: "Add hierarchy and spacing for scanning dense lists.",
    },
    "card-6": {
      id: "card-6",
      title: "QA micro-interactions",
      details: "Verify hover, focus, and loading states.",
    },
    "card-7": {
      id: "card-7",
      title: "Ship marketing page",
      details: "Final copy approved and asset pack delivered.",
    },
    "card-8": {
      id: "card-8",
      title: "Close onboarding sprint",
      details: "Document release notes and share internally.",
    },
  },
};

const findColumn = (columns: Column[], id: string) =>
  columns.find((column) => column.id === id) ??
  columns.find((column) => column.cardIds.includes(id));

export const moveCard = (
  columns: Column[],
  activeId: string,
  overId: string
): Column[] => {
  const activeColumn = findColumn(columns, activeId);
  const overColumn = findColumn(columns, overId);
  if (!activeColumn || !overColumn) {
    return columns;
  }

  const activeIndex = activeColumn.cardIds.indexOf(activeId);
  // Dropping on a column puts the card at its end; dropping on a card takes its place.
  const overIndex =
    overColumn.id === overId ? overColumn.cardIds.length : overColumn.cardIds.indexOf(overId);
  if (activeIndex === -1 || (activeColumn === overColumn && activeIndex === overIndex)) {
    return columns;
  }

  const remaining = activeColumn.cardIds.filter((cardId) => cardId !== activeId);
  return columns.map((column) => {
    if (column === overColumn) {
      const cardIds = column === activeColumn ? remaining : [...column.cardIds];
      cardIds.splice(overIndex, 0, activeId);
      return { ...column, cardIds };
    }
    if (column === activeColumn) {
      return { ...column, cardIds: remaining };
    }
    return column;
  });
};

export const createId = (prefix: string) => {
  const randomPart = Math.random().toString(36).slice(2, 8);
  const timePart = Date.now().toString(36);
  return `${prefix}-${randomPart}${timePart}`;
};

export const MAX_COLUMNS = 12;
export const PRIORITIES: Priority[] = ["high", "medium", "low"];

export const addColumn = (board: BoardData, title: string): BoardData => ({
  ...board,
  columns: [...board.columns, { id: createId("col"), title, cardIds: [] }],
});

export const removeColumn = (board: BoardData, columnId: string): BoardData => ({
  ...board,
  columns: board.columns.filter((column) => column.id !== columnId),
});

export const shiftColumn = (
  board: BoardData,
  columnId: string,
  offset: -1 | 1
): BoardData => {
  const index = board.columns.findIndex((column) => column.id === columnId);
  const target = index + offset;
  if (index === -1 || target < 0 || target >= board.columns.length) {
    return board;
  }
  const columns = [...board.columns];
  [columns[index], columns[target]] = [columns[target], columns[index]];
  return { ...board, columns };
};

export const parseLabels = (text: string) => [
  ...new Set(
    text
      .split(",")
      .map((label) => label.trim())
      .filter(Boolean)
  ),
];

export const boardLabels = (board: BoardData) =>
  [...new Set(Object.values(board.cards).flatMap((card) => card.labels ?? []))].sort();

export const todayIso = () => new Date().toLocaleDateString("en-CA");

export const isOverdue = (card: Card, today: string) =>
  Boolean(card.dueDate && card.dueDate < today);

export type CardFilter = {
  text: string;
  priority: Priority | "";
  label: string;
};

export const emptyFilter: CardFilter = { text: "", priority: "", label: "" };

export const isFiltering = (filter: CardFilter) =>
  Boolean(filter.text.trim() || filter.priority || filter.label);

export const cardMatches = (card: Card, filter: CardFilter) => {
  const text = filter.text.trim().toLowerCase();
  if (
    text &&
    !`${card.title}\n${card.details}\n${(card.labels ?? []).join("\n")}`
      .toLowerCase()
      .includes(text)
  ) {
    return false;
  }
  if (filter.priority && card.priority !== filter.priority) {
    return false;
  }
  return !filter.label || (card.labels ?? []).includes(filter.label);
};

export const boardStats = (board: BoardData, today: string) => {
  const cards = Object.values(board.cards);
  return {
    total: cards.length,
    overdue: cards.filter((card) => isOverdue(card, today)).length,
    high: cards.filter((card) => card.priority === "high").length,
  };
};
