import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "@/components/App";
import { initialData } from "@/lib/kanban";
import { bodiesFor, mockFetch, type Reply } from "@/test/mockFetch";

const user = { id: 1, username: "user", isAdmin: true };
const boards = [
  { id: 1, name: "Roadmap", cardCount: 8, createdAt: "", updatedAt: "" },
];

const signedInApi = (method: string, path: string): Reply | undefined => {
  if (path === "/api/me") return { body: user };
  if (path === "/api/boards") return { body: boards };
  if (path === "/api/boards/1") {
    return { body: { ...boards[0], data: initialData } };
  }
  if (path === "/api/logout" && method === "POST") return { body: { ok: true } };
  return undefined;
};

const fillAndSubmit = async (button: RegExp) => {
  await userEvent.type(await screen.findByLabelText(/username/i), "alice");
  await userEvent.type(screen.getByLabelText(/password/i), "alice-pass");
  await userEvent.click(screen.getByRole("button", { name: button }));
};

describe("App", () => {
  it("shows the login form when logged out", async () => {
    mockFetch(() => ({ status: 401 }));
    render(<App />);
    expect(await screen.findByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.queryByTestId(/column-/i)).not.toBeInTheDocument();
  });

  it("shows a login error when the server is unreachable", async () => {
    mockFetch(() => "network-error");
    render(<App />);
    await fillAndSubmit(/sign in/i);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach the server.");
  });

  it("shows an error for a wrong password and stays on the form", async () => {
    mockFetch(() => ({ status: 401 }));
    render(<App />);
    await fillAndSubmit(/sign in/i);
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid username or password.");
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
  });

  it("signs in and shows the workspace with the first board", async () => {
    let signedIn = false;
    const fetchMock = mockFetch((method, path) => {
      if (path === "/api/login") {
        signedIn = true;
        return { body: user };
      }
      return signedIn ? signedInApi(method, path) : { status: 401 };
    });
    render(<App />);
    await fillAndSubmit(/sign in/i);
    expect(await screen.findAllByTestId(/column-/i)).toHaveLength(5);
    expect(screen.getByTestId("current-user")).toHaveTextContent("user");
    expect(bodiesFor(fetchMock, "POST", "/api/login")).toEqual([
      { username: "alice", password: "alice-pass" },
    ]);
  });

  it("shows the workspace when /api/me returns a user", async () => {
    mockFetch(signedInApi);
    render(<App />);
    expect(await screen.findAllByTestId(/column-/i)).toHaveLength(5);
  });

  it("returns to the form after logout", async () => {
    mockFetch(signedInApi);
    render(<App />);
    await screen.findAllByTestId(/column-/i);
    await userEvent.click(screen.getByRole("button", { name: /log out/i }));
    expect(await screen.findByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.queryByTestId(/column-/i)).not.toBeInTheDocument();
  });

  it("registers a new account", async () => {
    let registered = false;
    const fetchMock = mockFetch((method, path) => {
      if (path === "/api/register") {
        registered = true;
        return { status: 201, body: { id: 2, username: "alice", isAdmin: false } };
      }
      if (!registered) return { status: 401 };
      if (path === "/api/boards") return { body: [{ ...boards[0], id: 2, name: "My Board" }] };
      if (path === "/api/boards/2") {
        return { body: { id: 2, name: "My Board", data: { columns: [{ id: "a", title: "A", cardIds: [] }], cards: {} } } };
      }
      return undefined;
    });
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: /create an account/i }));
    expect(screen.getByText(/create an account to start/i)).toBeInTheDocument();
    await fillAndSubmit(/^create account$/i);
    expect(await screen.findByTestId("current-user")).toHaveTextContent("alice");
    expect(screen.queryByRole("button", { name: "Users" })).not.toBeInTheDocument();
    expect(bodiesFor(fetchMock, "POST", "/api/register")).toEqual([
      { username: "alice", password: "alice-pass" },
    ]);
  });

  it.each([
    [409, "That username is taken."],
    [422, "at least 8 characters"],
  ])("shows a register error for %i", async (status, text) => {
    mockFetch((method, path) => (path === "/api/register" ? { status } : { status: 401 }));
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: /create an account/i }));
    await fillAndSubmit(/^create account$/i);
    expect(await screen.findByRole("alert")).toHaveTextContent(text);
  });

  it("switches back from register to sign in", async () => {
    mockFetch(() => ({ status: 401 }));
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: /create an account/i }));
    await userEvent.click(screen.getByRole("button", { name: /have an account/i }));
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });
});
