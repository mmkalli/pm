import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Workspace } from "@/components/Workspace";
import type { User } from "@/lib/api";
import type { BoardData } from "@/lib/kanban";
import { bodiesFor, mockFetch, type Reply } from "@/test/mockFetch";

const admin: User = { id: 1, username: "user", isAdmin: true };
const member: User = { id: 2, username: "alice", isAdmin: false };

const boardData = (title: string): BoardData => ({
  columns: [{ id: "col-a", title, cardIds: [] }],
  cards: {},
});

const summary = (id: number, name: string, cardCount = 0) => ({
  id,
  name,
  cardCount,
  createdAt: "",
  updatedAt: "",
});

const setup = (
  user: User = admin,
  options: { boards?: ReturnType<typeof summary>[]; create?: Reply; list?: Reply } = {}
) => {
  let boards = options.boards ?? [summary(1, "Roadmap", 3), summary(2, "Hiring")];
  const fetchMock = mockFetch((method, path, body) => {
    if (path === "/api/boards" && method === "GET") return options.list ?? { body: boards };
    if (path === "/api/boards" && method === "POST") {
      if (options.create) return options.create;
      const created = summary(9, (body as { name: string }).name);
      boards = [...boards, created];
      return { status: 201, body: created };
    }
    const match = path.match(/^\/api\/boards\/(\d+)$/);
    if (match && method === "GET") {
      const found = boards.find((board) => board.id === Number(match[1]));
      return found ? { body: { ...found, data: boardData(`${found.name} column`) } } : undefined;
    }
    if (match && method === "DELETE") return { status: 204 };
    if (match && method === "PATCH") return { body: {} };
    if (path === "/api/users") return { body: [] };
    return undefined;
  });
  const onLogout = vi.fn();
  render(<Workspace user={user} onLogout={onLogout} onSignedOut={vi.fn()} />);
  return { fetchMock, onLogout };
};

const boardList = () => screen.getByRole("list", { name: "Boards" });

describe("Workspace", () => {
  it("lists boards with card counts and opens the first", async () => {
    setup();
    expect(await screen.findByDisplayValue("Roadmap column")).toBeInTheDocument();
    const items = within(boardList()).getAllByRole("button");
    expect(items.map((item) => item.textContent)).toEqual(["Roadmap3", "Hiring0"]);
    expect(items[0]).toHaveAttribute("aria-current", "true");
  });

  it("switches boards", async () => {
    setup();
    await screen.findByDisplayValue("Roadmap column");
    await userEvent.click(within(boardList()).getByRole("button", { name: /hiring/i }));
    expect(await screen.findByDisplayValue("Hiring column")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Roadmap column")).not.toBeInTheDocument();
  });

  it("creates a board and opens it", async () => {
    const { fetchMock } = setup();
    await screen.findByDisplayValue("Roadmap column");
    await userEvent.type(screen.getByLabelText("New board name"), "  Launch ");
    await userEvent.click(screen.getByRole("button", { name: /create board/i }));
    expect(await screen.findByDisplayValue("Launch column")).toBeInTheDocument();
    expect(bodiesFor(fetchMock, "POST", "/api/boards")).toEqual([{ name: "Launch" }]);
    expect(within(boardList()).getAllByRole("button")).toHaveLength(3);
    expect(screen.getByLabelText("New board name")).toHaveValue("");
  });

  it("ignores a blank board name", async () => {
    const { fetchMock } = setup();
    await screen.findByDisplayValue("Roadmap column");
    await userEvent.type(screen.getByLabelText("New board name"), "   ");
    await userEvent.click(screen.getByRole("button", { name: /create board/i }));
    expect(bodiesFor(fetchMock, "POST", "/api/boards")).toHaveLength(0);
  });

  it("shows an error when creating a board fails", async () => {
    setup(admin, { create: { status: 500 } });
    await screen.findByDisplayValue("Roadmap column");
    await userEvent.type(screen.getByLabelText("New board name"), "Launch");
    await userEvent.click(screen.getByRole("button", { name: /create board/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not create the board.");
  });

  it("shows an error when the board list cannot load", async () => {
    setup(admin, { list: { status: 500 } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load your boards.");
  });

  it("shows an empty state with no boards", async () => {
    setup(admin, { boards: [] });
    expect(await screen.findByText(/you have no boards yet/i)).toBeInTheDocument();
  });

  it("updates the sidebar when the board is renamed", async () => {
    setup();
    const name = await screen.findByLabelText("Board name");
    await userEvent.clear(name);
    await userEvent.type(name, "Roadmap 2027");
    await userEvent.tab();
    await waitFor(() =>
      expect(within(boardList()).getAllByRole("button")[0]).toHaveTextContent("Roadmap 2027")
    );
  });

  it("removes a deleted board and opens the next one", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    setup();
    await screen.findByDisplayValue("Roadmap column");
    await userEvent.click(screen.getByRole("button", { name: /delete board/i }));
    expect(await screen.findByDisplayValue("Hiring column")).toBeInTheDocument();
    expect(within(boardList()).getAllByRole("button")).toHaveLength(1);
  });

  it("shows the Users view only to admins", async () => {
    setup(member);
    await screen.findByDisplayValue("Roadmap column");
    expect(screen.queryByRole("button", { name: "Users" })).not.toBeInTheDocument();
  });

  it("navigates to account and users views and back", async () => {
    setup();
    await screen.findByDisplayValue("Roadmap column");
    await userEvent.click(screen.getByRole("button", { name: "Account" }));
    expect(screen.getByRole("heading", { name: "Change password" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Account" })).toHaveAttribute("aria-current", "page");
    await userEvent.click(screen.getByRole("button", { name: "Users" }));
    expect(screen.getByRole("heading", { name: "Add user" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Boards" }));
    expect(await screen.findByDisplayValue("Roadmap column")).toBeInTheDocument();
  });

  it("logs out", async () => {
    const { onLogout } = setup();
    await userEvent.click(await screen.findByRole("button", { name: /log out/i }));
    expect(onLogout).toHaveBeenCalled();
  });
});
