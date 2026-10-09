import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/KanbanBoard";
import { initialData, type BoardData } from "@/lib/kanban";

const serverBoard: BoardData = {
  ...initialData,
  cards: {
    ...initialData.cards,
    "card-1": {
      ...initialData.cards["card-1"],
      title: "Server card",
    },
  },
};

const jsonResponse = (status: number, body: unknown) =>
  Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });

const mockBoardApi = (options?: {
  putOk?: boolean;
  putRejects?: boolean;
  board?: BoardData;
  chat?: { reply: string; board: BoardData | null };
  chatStatus?: number;
  chatGate?: Promise<unknown>;
}) => {
  let board = structuredClone(options?.board ?? serverBoard);
  const putOk = options?.putOk ?? true;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.includes("/api/chat") && method === "POST") {
      if (options?.chatGate) {
        await options.chatGate;
      }
      if ((options?.chatStatus ?? 200) >= 400) {
        return jsonResponse(options?.chatStatus ?? 500, {});
      }
      return jsonResponse(200, options?.chat ?? { reply: "ok", board: null });
    }
    if (url.includes("/api/board") && method === "PUT") {
      if (options?.putRejects) {
        throw new TypeError("Failed to fetch");
      }
      if (!putOk) {
        return jsonResponse(500, {});
      }
      board = JSON.parse(String(init?.body));
      return jsonResponse(200, board);
    }
    if (url.includes("/api/board")) {
      return jsonResponse(200, board);
    }
    return jsonResponse(404, {});
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

const chatBodies = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls
    .filter((call) => String(call[0]).includes("/api/chat"))
    .map((call) => JSON.parse(String((call[1] as RequestInit).body)));

const putBodies = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls
    .filter((call) => (call[1] as RequestInit | undefined)?.method === "PUT")
    .map((call) => JSON.parse(String((call[1] as RequestInit).body)));

describe("KanbanBoard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the board from GET /api/board", async () => {
    mockBoardApi();
    render(<KanbanBoard />);
    expect(await screen.findByText("Server card")).toBeInTheDocument();
    expect(screen.getAllByTestId(/column-/i)).toHaveLength(5);
  });

  it("puts the board after adding a card", async () => {
    const fetchMock = mockBoardApi();
    render(<KanbanBoard />);
    const column = await screen.findByTestId("column-col-backlog");
    await userEvent.click(
      within(column).getByRole("button", { name: /add a card/i })
    );
    await userEvent.type(
      within(column).getByPlaceholderText(/card title/i),
      "New card"
    );
    await userEvent.click(
      within(column).getByRole("button", { name: /add card/i })
    );
    await waitFor(() => expect(putBodies(fetchMock).length).toBe(1));
    const body = putBodies(fetchMock)[0] as BoardData;
    expect(Object.values(body.cards).some((card) => card.title === "New card")).toBe(
      true
    );
  });

  it("keeps the previous board when PUT fails", async () => {
    mockBoardApi({ putOk: false });
    render(<KanbanBoard />);
    const column = await screen.findByTestId("column-col-backlog");
    expect(within(column).getByText("Server card")).toBeInTheDocument();
    await userEvent.click(
      within(column).getByRole("button", { name: /add a card/i })
    );
    await userEvent.type(
      within(column).getByPlaceholderText(/card title/i),
      "Should not stick"
    );
    await userEvent.click(
      within(column).getByRole("button", { name: /add card/i })
    );
    expect(await screen.findByText("Could not save the board.")).toBeInTheDocument();
    expect(within(column).queryByText("Should not stick")).not.toBeInTheDocument();
    expect(within(column).getByText("Server card")).toBeInTheDocument();
  });

  it("renders the assistant reply", async () => {
    const fetchMock = mockBoardApi({
      chat: { reply: "Four columns left", board: null },
    });
    render(<KanbanBoard />);
    await screen.findByText("Server card");
    await userEvent.type(screen.getByRole("textbox", { name: /message/i }), "Hello");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));
    expect(await screen.findByText("Four columns left")).toBeInTheDocument();
    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(chatBodies(fetchMock)[0]).toEqual({ message: "Hello", history: [] });
  });

  it("sends the current history with the next message", async () => {
    const fetchMock = mockBoardApi({
      chat: { reply: "Noted", board: null },
    });
    render(<KanbanBoard />);
    await screen.findByText("Server card");
    await userEvent.type(screen.getByRole("textbox", { name: /message/i }), "Hello");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));
    await screen.findByText("Noted");
    await userEvent.type(screen.getByRole("textbox", { name: /message/i }), "Again");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => expect(chatBodies(fetchMock)).toHaveLength(2));
    expect(chatBodies(fetchMock)[1]).toEqual({
      message: "Again",
      history: [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Noted" },
      ],
    });
  });

  it("applies a board returned by chat", async () => {
    const renamed = structuredClone(serverBoard);
    renamed.columns = renamed.columns.map((column) =>
      column.id === "col-backlog" ? { ...column, title: "Ideas" } : column
    );
    mockBoardApi({ chat: { reply: "Renamed Backlog", board: renamed } });
    render(<KanbanBoard />);
    await screen.findByText("Server card");
    await userEvent.type(screen.getByRole("textbox", { name: /message/i }), "Rename");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));
    expect(await screen.findByDisplayValue("Ideas")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Backlog")).not.toBeInTheDocument();
  });

  it("leaves the cards when chat returns a null board", async () => {
    mockBoardApi({ chat: { reply: "Just talking", board: null } });
    render(<KanbanBoard />);
    await screen.findByText("Server card");
    await userEvent.type(screen.getByRole("textbox", { name: /message/i }), "Question");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));
    expect(await screen.findByText("Just talking")).toBeInTheDocument();
    expect(screen.getByText("Server card")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Backlog")).toBeInTheDocument();
  });

  it("shows the error and keeps the board when chat fails", async () => {
    mockBoardApi({ chatStatus: 500 });
    render(<KanbanBoard />);
    await screen.findByText("Server card");
    await userEvent.type(screen.getByRole("textbox", { name: /message/i }), "Hello");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not send the message."
    );
    expect(screen.getByText("Server card")).toBeInTheDocument();
  });

  it("shows a pending state while chat is in flight", async () => {
    let release: () => void = () => {};
    const chatGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    mockBoardApi({
      chat: { reply: "Reply ready", board: null },
      chatGate,
    });
    render(<KanbanBoard />);
    await screen.findByText("Server card");
    await userEvent.type(screen.getByRole("textbox", { name: /message/i }), "Hello");
    const pendingClick = userEvent.click(screen.getByRole("button", { name: /send/i }));
    expect(await screen.findByText("Hello")).toBeInTheDocument();
    expect(await screen.findByText("Sending...")).toBeInTheDocument();
    release();
    await pendingClick;
    expect(await screen.findByText("Reply ready")).toBeInTheDocument();
  });

  it("locks the board while chat is in flight", async () => {
    let release: () => void = () => {};
    const chatGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    mockBoardApi({ chat: { reply: "All set", board: null }, chatGate });
    render(<KanbanBoard />);
    await screen.findByText("Server card");
    await userEvent.type(screen.getByRole("textbox", { name: /message/i }), "Hello");
    const pendingClick = userEvent.click(screen.getByRole("button", { name: /send/i }));
    await screen.findByText("Sending...");
    for (const button of screen.getAllByRole("button", { name: /add a card/i })) {
      expect(button).toBeDisabled();
    }
    expect(screen.getByRole("button", { name: "Edit Server card" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete Server card" })).toBeDisabled();
    for (const input of screen.getAllByLabelText("Column title")) {
      expect(input).toBeDisabled();
    }
    release();
    await pendingClick;
    await screen.findByText("All set");
    expect(screen.getByRole("button", { name: "Edit Server card" })).toBeEnabled();
  });

  it("restores the title and skips the PUT when a column is renamed to empty", async () => {
    const fetchMock = mockBoardApi();
    render(<KanbanBoard />);
    await screen.findByText("Server card");
    const title = screen.getByDisplayValue("Backlog");
    await userEvent.clear(title);
    await userEvent.tab();
    expect(title).toHaveValue("Backlog");
    expect(putBodies(fetchMock)).toHaveLength(0);
  });

  it("skips the PUT when a column title is unchanged", async () => {
    const fetchMock = mockBoardApi();
    render(<KanbanBoard />);
    await screen.findByText("Server card");
    await userEvent.click(screen.getByDisplayValue("Backlog"));
    await userEvent.tab();
    expect(putBodies(fetchMock)).toHaveLength(0);
  });

  it("keeps the previous board when the PUT cannot reach the server", async () => {
    mockBoardApi({ putRejects: true });
    render(<KanbanBoard />);
    const column = await screen.findByTestId("column-col-backlog");
    await userEvent.click(
      within(column).getByRole("button", { name: /add a card/i })
    );
    await userEvent.type(
      within(column).getByPlaceholderText(/card title/i),
      "Offline card"
    );
    await userEvent.click(
      within(column).getByRole("button", { name: /add card/i })
    );
    expect(await screen.findByText("Could not save the board.")).toBeInTheDocument();
    expect(within(column).queryByText("Offline card")).not.toBeInTheDocument();
  });

  it("shows an error when the board cannot be loaded", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    render(<KanbanBoard />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not load the board."
    );
  });

  it("stores the placeholder when card details are cleared", async () => {
    const fetchMock = mockBoardApi();
    render(<KanbanBoard />);
    await screen.findByText("Server card");
    await userEvent.click(screen.getByRole("button", { name: "Edit Server card" }));
    await userEvent.clear(screen.getByLabelText("Card details"));
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(putBodies(fetchMock)).toHaveLength(1));
    const body = putBodies(fetchMock)[0] as BoardData;
    expect(body.cards["card-1"].details).toBe("No details yet.");
  });
});
