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

const mockBoardApi = (options?: { putOk?: boolean; board?: BoardData }) => {
  let board = structuredClone(options?.board ?? serverBoard);
  const putOk = options?.putOk ?? true;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.includes("/api/board") && method === "PUT") {
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
});
