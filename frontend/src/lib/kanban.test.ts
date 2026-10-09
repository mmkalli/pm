import {
  MAX_COLUMNS,
  addColumn,
  boardLabels,
  boardStats,
  cardMatches,
  createId,
  emptyFilter,
  initialData,
  isFiltering,
  isOverdue,
  moveCard,
  parseLabels,
  removeColumn,
  shiftColumn,
  todayIso,
  type BoardData,
  type Card,
  type Column,
} from "@/lib/kanban";

describe("moveCard", () => {
  const baseColumns: Column[] = [
    { id: "col-a", title: "A", cardIds: ["card-1", "card-2"] },
    { id: "col-b", title: "B", cardIds: ["card-3"] },
  ];

  it("reorders cards in the same column", () => {
    const result = moveCard(baseColumns, "card-2", "card-1");
    expect(result[0].cardIds).toEqual(["card-2", "card-1"]);
  });

  it("moves cards to another column", () => {
    const result = moveCard(baseColumns, "card-2", "card-3");
    expect(result[0].cardIds).toEqual(["card-1"]);
    expect(result[1].cardIds).toEqual(["card-2", "card-3"]);
  });

  it("drops cards to the end of a column", () => {
    const result = moveCard(baseColumns, "card-1", "col-b");
    expect(result[0].cardIds).toEqual(["card-2"]);
    expect(result[1].cardIds).toEqual(["card-3", "card-1"]);
  });

  it("moves a card to the end of its own column when dropped on that column", () => {
    const result = moveCard(baseColumns, "card-1", "col-a");
    expect(result[0].cardIds).toEqual(["card-2", "card-1"]);
  });

  it("returns the columns unchanged for unknown ids", () => {
    expect(moveCard(baseColumns, "missing", "col-b")).toBe(baseColumns);
    expect(moveCard(baseColumns, "card-1", "missing")).toBe(baseColumns);
  });
});

describe("createId", () => {
  it("uses the prefix and is unique", () => {
    const first = createId("card");
    expect(first).toMatch(/^card-/);
    expect(createId("card")).not.toBe(first);
  });
});

describe("column helpers", () => {
  const board: BoardData = {
    columns: [
      { id: "a", title: "A", cardIds: [] },
      { id: "b", title: "B", cardIds: [] },
      { id: "c", title: "C", cardIds: [] },
    ],
    cards: {},
  };

  it("adds an empty column at the end with a new id", () => {
    const next = addColumn(board, "Blocked");
    expect(next.columns).toHaveLength(4);
    expect(next.columns[3]).toMatchObject({ title: "Blocked", cardIds: [] });
    expect(next.columns[3].id).toMatch(/^col-/);
    expect(MAX_COLUMNS).toBe(12);
  });

  it("removes a column", () => {
    expect(removeColumn(board, "b").columns.map((c) => c.id)).toEqual(["a", "c"]);
  });

  it("shifts a column left and right", () => {
    expect(shiftColumn(board, "b", -1).columns.map((c) => c.id)).toEqual(["b", "a", "c"]);
    expect(shiftColumn(board, "b", 1).columns.map((c) => c.id)).toEqual(["a", "c", "b"]);
  });

  it("does not shift past either end", () => {
    expect(shiftColumn(board, "a", -1)).toBe(board);
    expect(shiftColumn(board, "c", 1)).toBe(board);
    expect(shiftColumn(board, "missing", 1)).toBe(board);
  });
});

describe("card helpers", () => {
  const card = (fields: Partial<Card>): Card => ({
    id: "x",
    title: "Write docs",
    details: "API reference",
    ...fields,
  });

  it("parses comma separated labels, trimming and de-duplicating", () => {
    expect(parseLabels(" ui, api ,, ui ,")).toEqual(["ui", "api"]);
    expect(parseLabels("")).toEqual([]);
  });

  it("lists the sorted unique labels on a board", () => {
    const board: BoardData = {
      columns: [{ id: "a", title: "A", cardIds: ["1", "2"] }],
      cards: {
        "1": card({ id: "1", labels: ["ui", "api"] }),
        "2": card({ id: "2", labels: ["api"] }),
      },
    };
    expect(boardLabels(board)).toEqual(["api", "ui"]);
    expect(boardLabels(initialData)).toEqual([]);
  });

  it("detects overdue cards", () => {
    expect(isOverdue(card({ dueDate: "2026-01-01" }), "2026-01-02")).toBe(true);
    expect(isOverdue(card({ dueDate: "2026-01-02" }), "2026-01-02")).toBe(false);
    expect(isOverdue(card({}), "2026-01-02")).toBe(false);
  });

  it("returns today as YYYY-MM-DD", () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("matches cards by text in title, details, and labels", () => {
    const target = card({ labels: ["Backend"] });
    expect(cardMatches(target, { ...emptyFilter, text: "write" })).toBe(true);
    expect(cardMatches(target, { ...emptyFilter, text: "REFERENCE" })).toBe(true);
    expect(cardMatches(target, { ...emptyFilter, text: "backend" })).toBe(true);
    expect(cardMatches(target, { ...emptyFilter, text: "design" })).toBe(false);
    expect(cardMatches(target, emptyFilter)).toBe(true);
  });

  it("matches cards by priority and label", () => {
    const target = card({ priority: "high", labels: ["ui"] });
    expect(cardMatches(target, { ...emptyFilter, priority: "high" })).toBe(true);
    expect(cardMatches(target, { ...emptyFilter, priority: "low" })).toBe(false);
    expect(cardMatches(target, { ...emptyFilter, label: "ui" })).toBe(true);
    expect(cardMatches(target, { ...emptyFilter, label: "api" })).toBe(false);
    expect(cardMatches(card({}), { ...emptyFilter, label: "ui" })).toBe(false);
  });

  it("knows when a filter is active", () => {
    expect(isFiltering(emptyFilter)).toBe(false);
    expect(isFiltering({ ...emptyFilter, text: "  " })).toBe(false);
    expect(isFiltering({ ...emptyFilter, text: "a" })).toBe(true);
    expect(isFiltering({ ...emptyFilter, priority: "low" })).toBe(true);
    expect(isFiltering({ ...emptyFilter, label: "ui" })).toBe(true);
  });

  it("counts total, high priority, and overdue cards", () => {
    const board: BoardData = {
      columns: [{ id: "a", title: "A", cardIds: ["1", "2", "3"] }],
      cards: {
        "1": card({ id: "1", priority: "high", dueDate: "2026-01-01" }),
        "2": card({ id: "2", priority: "high" }),
        "3": card({ id: "3", dueDate: "2027-01-01" }),
      },
    };
    expect(boardStats(board, "2026-06-01")).toEqual({ total: 3, high: 2, overdue: 1 });
  });
});
