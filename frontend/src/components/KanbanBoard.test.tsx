import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/KanbanBoard";
import { initialData, type BoardData } from "@/lib/kanban";
import { bodiesFor, mockFetch, type Reply } from "@/test/mockFetch";

const serverBoard: BoardData = {
  ...initialData,
  cards: {
    ...initialData.cards,
    "card-1": {
      ...initialData.cards["card-1"],
      title: "Server card",
      priority: "high",
      dueDate: "2000-01-01",
      labels: ["ui"],
    },
    "card-2": { ...initialData.cards["card-2"], labels: ["research"] },
  },
};

const BOARD = "/api/boards/7";

type Options = {
  board?: BoardData;
  put?: Reply;
  patch?: Reply;
  remove?: Reply;
  load?: Reply;
  chat?: Reply;
  chatGate?: Promise<unknown>;
  role?: "owner" | "member";
  members?: { id: number; username: string }[];
};

const setup = (options: Options = {}) => {
  let data = structuredClone(options.board ?? serverBoard);
  let name = "Roadmap";
  let version = 1;
  const fetchMock = mockFetch(async (method, path, body) => {
    if (path === BOARD && method === "GET") {
      return (
        options.load ?? {
          body: { id: 7, name, owner: "user", role: options.role ?? "owner", version, createdAt: "", updatedAt: "", data },
        }
      );
    }
    if (path.startsWith(`${BOARD}/data`) && method === "PUT") {
      if (options.put) return options.put;
      data = body as BoardData;
      version += 1;
      return { body: { data, version } };
    }
    if (path === BOARD && method === "PATCH") {
      if (options.patch) return options.patch;
      name = (body as { name: string }).name;
      return { body: { id: 7, name } };
    }
    if ((path === BOARD || path.startsWith(`${BOARD}/members/`)) && method === "DELETE") {
      return options.remove ?? { status: 204 };
    }
    if (path === `${BOARD}/members` && method === "GET") {
      return { body: options.members ?? [] };
    }
    if (path === `${BOARD}/chat` && method === "POST") {
      await options.chatGate;
      return options.chat ?? { body: { reply: "ok", board: null } };
    }
    return undefined;
  });
  const onSummaryChange = vi.fn();
  const onDeleted = vi.fn();
  render(<KanbanBoard boardId={7} userId={1} onSummaryChange={onSummaryChange} onDeleted={onDeleted} />);
  return {
    fetchMock,
    onSummaryChange,
    onDeleted,
    puts: () =>
      fetchMock.mock.calls
        .filter(([input, init]) => String(input).startsWith(`${BOARD}/data`) && init?.method === "PUT")
        .map(([, init]) => JSON.parse(String(init?.body)) as BoardData),
    chats: () => bodiesFor(fetchMock, "POST", `${BOARD}/chat`),
  };
};

const sendChat = async (text: string) => {
  await userEvent.type(screen.getByRole("textbox", { name: /message/i }), text);
  return userEvent.click(screen.getByRole("button", { name: /send/i }));
};

const addCard = async (title: string) => {
  const column = await screen.findByTestId("column-col-backlog");
  await userEvent.click(within(column).getByRole("button", { name: /add a card/i }));
  await userEvent.type(within(column).getByPlaceholderText(/card title/i), title);
  await userEvent.click(within(column).getByRole("button", { name: /add card/i }));
  return column;
};

describe("KanbanBoard", () => {
  it("renders the board, its name, and stats from the server", async () => {
    setup();
    expect(await screen.findByText("Server card")).toBeInTheDocument();
    expect(screen.getAllByTestId(/column-/i)).toHaveLength(5);
    expect(screen.getByLabelText("Board name")).toHaveValue("Roadmap");
    expect(screen.getByTestId("board-stats")).toHaveTextContent(
      "8 cards · 1 high priority · 1 overdue"
    );
  });

  it("shows card priority, due date, and labels", async () => {
    setup();
    const card = await screen.findByTestId("card-card-1");
    expect(within(card).getByText("high")).toBeInTheDocument();
    expect(within(card).getByTestId("due-date")).toHaveTextContent("Overdue 2000-01-01");
    expect(within(card).getByText("ui")).toBeInTheDocument();
  });

  it("shows an error when the board cannot be loaded", async () => {
    setup({ load: "network-error" });
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load the board.");
  });

  it("puts the board after adding a card and reports the card count", async () => {
    const { puts, onSummaryChange } = setup();
    await addCard("New card");
    await waitFor(() => expect(puts()).toHaveLength(1));
    const card = Object.values(puts()[0].cards).find((item) => item.title === "New card");
    expect(card?.details).toBe("No details yet.");
    expect(puts()[0].columns[0].cardIds).toContain(card?.id);
    expect(onSummaryChange).toHaveBeenCalledWith({ cardCount: 9 });
  });

  it("keeps the previous board when PUT fails", async () => {
    setup({ put: { status: 500 } });
    const column = await addCard("Should not stick");
    expect(await screen.findByText("Could not save the board.")).toBeInTheDocument();
    expect(within(column).queryByText("Should not stick")).not.toBeInTheDocument();
    expect(within(column).getByText("Server card")).toBeInTheDocument();
  });

  it("keeps the previous board when the PUT cannot reach the server", async () => {
    setup({ put: "network-error" });
    const column = await addCard("Offline card");
    expect(await screen.findByText("Could not save the board.")).toBeInTheDocument();
    expect(within(column).queryByText("Offline card")).not.toBeInTheDocument();
  });

  it("deletes a card", async () => {
    const { puts } = setup();
    await userEvent.click(await screen.findByRole("button", { name: "Delete Server card" }));
    await waitFor(() => expect(puts()).toHaveLength(1));
    expect(puts()[0].cards["card-1"]).toBeUndefined();
    expect(puts()[0].columns[0].cardIds).not.toContain("card-1");
    expect(screen.queryByText("Server card")).not.toBeInTheDocument();
  });

  it("edits card title, details, priority, due date, and labels", async () => {
    const { puts } = setup();
    await userEvent.click(await screen.findByRole("button", { name: "Edit Server card" }));
    const title = screen.getByLabelText("Card title");
    await userEvent.clear(title);
    await userEvent.type(title, "Edited");
    await userEvent.selectOptions(screen.getByLabelText("Card priority"), "low");
    const due = screen.getByLabelText("Card due date");
    await userEvent.clear(due);
    await userEvent.type(due, "2030-05-06");
    const labels = screen.getByLabelText("Card labels");
    await userEvent.clear(labels);
    await userEvent.type(labels, "api, docs, api");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(puts()).toHaveLength(1));
    expect(puts()[0].cards["card-1"]).toEqual({
      id: "card-1",
      title: "Edited",
      details: serverBoard.cards["card-1"].details,
      priority: "low",
      dueDate: "2030-05-06",
      labels: ["api", "docs"],
    });
    expect(screen.getByTestId("due-date")).toHaveTextContent("Due 2030-05-06");
  });

  it("clears priority and due date and stores the details placeholder", async () => {
    const { puts } = setup();
    await userEvent.click(await screen.findByRole("button", { name: "Edit Server card" }));
    await userEvent.clear(screen.getByLabelText("Card details"));
    await userEvent.selectOptions(screen.getByLabelText("Card priority"), "");
    await userEvent.clear(screen.getByLabelText("Card due date"));
    await userEvent.clear(screen.getByLabelText("Card labels"));
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(puts()).toHaveLength(1));
    expect(puts()[0].cards["card-1"]).toMatchObject({
      details: "No details yet.",
      priority: null,
      dueDate: null,
      labels: [],
    });
  });

  it("cancels a card edit without saving", async () => {
    const { puts } = setup();
    await userEvent.click(await screen.findByRole("button", { name: "Edit Server card" }));
    await userEvent.type(screen.getByLabelText("Card title"), " changed");
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.getByText("Server card")).toBeInTheDocument();
    expect(puts()).toHaveLength(0);
  });

  it("renames the board on blur", async () => {
    const { fetchMock, onSummaryChange } = setup();
    const name = await screen.findByLabelText("Board name");
    await userEvent.clear(name);
    await userEvent.type(name, "Launch plan");
    await userEvent.tab();
    await waitFor(() => expect(onSummaryChange).toHaveBeenCalledWith({ name: "Launch plan" }));
    expect(bodiesFor(fetchMock, "PATCH", BOARD)).toEqual([{ name: "Launch plan" }]);
  });

  it("restores the board name when it is cleared or the rename fails", async () => {
    const { fetchMock } = setup({ patch: { status: 500 } });
    const name = await screen.findByLabelText("Board name");
    await userEvent.clear(name);
    await userEvent.tab();
    expect(name).toHaveValue("Roadmap");
    expect(bodiesFor(fetchMock, "PATCH", BOARD)).toHaveLength(0);
    await userEvent.type(name, "x");
    await userEvent.tab();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not rename the board.");
    expect(name).toHaveValue("Roadmap");
  });

  it("deletes the board after confirmation", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { onDeleted, fetchMock } = setup();
    await userEvent.click(await screen.findByRole("button", { name: /delete board/i }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("Roadmap"));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(bodiesFor(fetchMock, "DELETE", BOARD)).toHaveLength(1);
  });

  it("does not delete the board when confirmation is declined", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const { onDeleted, fetchMock } = setup();
    await userEvent.click(await screen.findByRole("button", { name: /delete board/i }));
    expect(onDeleted).not.toHaveBeenCalled();
    expect(bodiesFor(fetchMock, "DELETE", BOARD)).toHaveLength(0);
  });

  it("shows an error when deleting the board fails", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { onDeleted } = setup({ remove: { status: 500 } });
    await userEvent.click(await screen.findByRole("button", { name: /delete board/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not delete the board.");
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it("adds a column", async () => {
    const { puts } = setup();
    await userEvent.type(await screen.findByLabelText("New column title"), "Blocked");
    await userEvent.click(screen.getByRole("button", { name: /add column/i }));
    await waitFor(() => expect(puts()).toHaveLength(1));
    expect(puts()[0].columns.map((column) => column.title)).toEqual([
      "Backlog",
      "Discovery",
      "In Progress",
      "Review",
      "Done",
      "Blocked",
    ]);
    expect(screen.getAllByTestId(/column-/i)).toHaveLength(6);
    expect(screen.getByLabelText("New column title")).toHaveValue("");
  });

  it("hides the add column form at the column limit", async () => {
    const board: BoardData = {
      columns: Array.from({ length: 12 }, (_, index) => ({
        id: `c${index}`,
        title: `C${index}`,
        cardIds: [],
      })),
      cards: {},
    };
    setup({ board });
    await screen.findByDisplayValue("C11");
    expect(screen.queryByLabelText("New column title")).not.toBeInTheDocument();
  });

  it("moves columns left and right", async () => {
    const { puts } = setup();
    await userEvent.click(await screen.findByRole("button", { name: "Move Discovery left" }));
    await waitFor(() => expect(puts()).toHaveLength(1));
    expect(puts()[0].columns[0].id).toBe("col-discovery");
    await userEvent.click(screen.getByRole("button", { name: "Move Discovery right" }));
    await waitFor(() => expect(puts()).toHaveLength(2));
    expect(puts()[1].columns.map((column) => column.id).slice(0, 2)).toEqual([
      "col-backlog",
      "col-discovery",
    ]);
    expect(screen.getByRole("button", { name: "Move Backlog left" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Done right" })).toBeDisabled();
  });

  it("removes only empty columns", async () => {
    const board = structuredClone(serverBoard);
    board.columns.push({ id: "col-empty", title: "Empty", cardIds: [] });
    const { puts } = setup({ board });
    await screen.findByText("Server card");
    expect(screen.queryByRole("button", { name: "Remove column Backlog" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Remove column Empty" }));
    await waitFor(() => expect(puts()).toHaveLength(1));
    expect(puts()[0].columns.map((column) => column.id)).not.toContain("col-empty");
  });

  it("filters cards by text, priority, and label", async () => {
    setup();
    await screen.findByText("Server card");
    await userEvent.type(screen.getByLabelText("Search cards"), "customer");
    expect(screen.queryByText("Server card")).not.toBeInTheDocument();
    expect(screen.getByText("Gather customer signals")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /clear filters/i }));
    expect(screen.getByText("Server card")).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Filter by priority"), "high");
    expect(screen.getByText("Server card")).toBeInTheDocument();
    expect(screen.queryByText("Gather customer signals")).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Filter by priority"), "");

    await userEvent.selectOptions(screen.getByLabelText("Filter by label"), "research");
    expect(screen.getByText("Gather customer signals")).toBeInTheDocument();
    expect(screen.queryByText("Server card")).not.toBeInTheDocument();
    expect(within(screen.getByTestId("column-col-backlog")).getByText("1 cards")).toBeInTheDocument();
  });

  it("restores the title and skips the PUT when a column is renamed to empty", async () => {
    const { puts } = setup();
    const title = await screen.findByDisplayValue("Backlog");
    await userEvent.clear(title);
    await userEvent.tab();
    expect(title).toHaveValue("Backlog");
    expect(puts()).toHaveLength(0);
  });

  it("skips the PUT when a column title is unchanged", async () => {
    const { puts } = setup();
    await userEvent.click(await screen.findByDisplayValue("Backlog"));
    await userEvent.tab();
    expect(puts()).toHaveLength(0);
  });

  it("saves a renamed column on blur", async () => {
    const { puts } = setup();
    const title = await screen.findByDisplayValue("Backlog");
    await userEvent.clear(title);
    await userEvent.type(title, "Ideas");
    await userEvent.tab();
    await waitFor(() => expect(puts()).toHaveLength(1));
    expect(puts()[0].columns[0].title).toBe("Ideas");
  });

  it("renders the assistant reply", async () => {
    const { chats } = setup({ chat: { body: { reply: "Four columns left", board: null } } });
    await screen.findByText("Server card");
    await sendChat("Hello");
    expect(await screen.findByText("Four columns left")).toBeInTheDocument();
    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(chats()[0]).toEqual({ message: "Hello", history: [] });
  });

  it("sends the current history with the next message", async () => {
    const { chats } = setup({ chat: { body: { reply: "Noted", board: null } } });
    await screen.findByText("Server card");
    await sendChat("Hello");
    await screen.findByText("Noted");
    await sendChat("Again");
    await waitFor(() => expect(chats()).toHaveLength(2));
    expect(chats()[1]).toEqual({
      message: "Again",
      history: [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Noted" },
      ],
    });
  });

  it("applies a board returned by chat", async () => {
    const renamed = structuredClone(serverBoard);
    renamed.columns[0].title = "Ideas";
    const { onSummaryChange } = setup({
      chat: { body: { reply: "Renamed Backlog", board: renamed } },
    });
    await screen.findByText("Server card");
    await sendChat("Rename");
    expect(await screen.findByDisplayValue("Ideas")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Backlog")).not.toBeInTheDocument();
    expect(onSummaryChange).toHaveBeenCalledWith({ cardCount: 8 });
  });

  it("leaves the cards when chat returns a null board", async () => {
    setup({ chat: { body: { reply: "Just talking", board: null } } });
    await screen.findByText("Server card");
    await sendChat("Question");
    expect(await screen.findByText("Just talking")).toBeInTheDocument();
    expect(screen.getByText("Server card")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Backlog")).toBeInTheDocument();
  });

  it("shows the error and keeps the board when chat fails", async () => {
    setup({ chat: { status: 500 } });
    await screen.findByText("Server card");
    await sendChat("Hello");
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not send the message.");
    expect(screen.getByText("Server card")).toBeInTheDocument();
  });

  it("shows the server detail when the assistant is unavailable", async () => {
    setup({ chat: { status: 502, body: { detail: "The assistant is unavailable" } } });
    await screen.findByText("Server card");
    await sendChat("Hello");
    expect(await screen.findByRole("alert")).toHaveTextContent("The assistant is unavailable");
  });

  it("shows a pending state and locks the board while chat is in flight", async () => {
    let release: () => void = () => {};
    const chatGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    setup({ chat: { body: { reply: "All set", board: null } }, chatGate });
    await screen.findByText("Server card");
    const pendingClick = sendChat("Hello");
    expect(await screen.findByText("Sending...")).toBeInTheDocument();
    expect(screen.getByText("Hello")).toBeInTheDocument();
    for (const button of screen.getAllByRole("button", { name: /add a card/i })) {
      expect(button).toBeDisabled();
    }
    expect(screen.getByRole("button", { name: "Edit Server card" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete Server card" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /delete board/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /add column/i })).toBeDisabled();
    expect(screen.getByLabelText("Board name")).toBeDisabled();
    for (const input of screen.getAllByLabelText("Column title")) {
      expect(input).toBeDisabled();
    }
    release();
    await pendingClick;
    await screen.findByText("All set");
    expect(screen.getByRole("button", { name: "Edit Server card" })).toBeEnabled();
  });

  it("sends the loaded version with each save and uses the returned one next", async () => {
    const { fetchMock } = setup();
    await addCard("First");
    await waitFor(() => expect(screen.getByText("First")).toBeInTheDocument());
    await addCard("Second");
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT").map(([input]) => input)
      ).toEqual([`${BOARD}/data?version=1`, `${BOARD}/data?version=2`])
    );
  });

  it("reloads the board and explains when a save conflicts", async () => {
    const { fetchMock } = setup({ put: { status: 409 } });
    const column = await addCard("Lost edit");
    expect(await screen.findByRole("alert")).toHaveTextContent("Someone else changed this board");
    await waitFor(() => expect(bodiesFor(fetchMock, "GET", BOARD)).toHaveLength(2));
    expect(within(column).queryByText("Lost edit")).not.toBeInTheDocument();
    expect(within(column).getByText("Server card")).toBeInTheDocument();
  });

  it("uses the version from a chat board for the next save", async () => {
    const changed = structuredClone(serverBoard);
    changed.columns[0].title = "Ideas";
    const { fetchMock } = setup({ chat: { body: { reply: "Done", board: changed, version: 5 } } });
    await screen.findByText("Server card");
    await sendChat("Rename");
    await screen.findByDisplayValue("Ideas");
    await addCard("After chat");
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT").map(([input]) => input)
      ).toEqual([`${BOARD}/data?version=5`])
    );
  });

  it("reloads the board when chat reports a conflict", async () => {
    const { fetchMock } = setup({
      chat: { status: 409, body: { detail: "This board was changed by someone else." } },
    });
    await screen.findByText("Server card");
    await sendChat("Go");
    expect(await screen.findByText("This board was changed by someone else.")).toBeInTheDocument();
    await waitFor(() => expect(bodiesFor(fetchMock, "GET", BOARD)).toHaveLength(2));
  });

  it("lets a member leave instead of delete, and not rename", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { fetchMock, onDeleted } = setup({ role: "member" });
    await screen.findByText("Server card");
    expect(screen.getByLabelText("Board name")).toBeDisabled();
    expect(screen.queryByRole("button", { name: /delete board/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Add member by username")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /leave board/i }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(bodiesFor(fetchMock, "DELETE", `${BOARD}/members/1`)).toHaveLength(1);
  });

  it("shows an error when leaving fails", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    setup({ role: "member", remove: { status: 500 } });
    await userEvent.click(await screen.findByRole("button", { name: /leave board/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not leave the board.");
  });

  it("shows the owner and members", async () => {
    setup({ members: [{ id: 2, username: "alice" }] });
    const members = await screen.findByTestId("members");
    expect(await within(members).findByText("alice")).toBeInTheDocument();
    expect(within(members).getByText("user (owner)")).toBeInTheDocument();
  });
});
