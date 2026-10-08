import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "@/components/App";
import { initialData } from "@/lib/kanban";

const jsonResponse = (status: number, body: unknown) =>
  Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });

const mockAppFetch = () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/me")) {
      return jsonResponse(200, { username: "user" });
    }
    if (url.includes("/api/board")) {
      return jsonResponse(200, initialData);
    }
    if (url.includes("/api/logout")) {
      return jsonResponse(200, { ok: true });
    }
    return jsonResponse(401, {});
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

describe("App", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the login form when logged out", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({}),
      })
    );
    render(<App />);
    expect(await screen.findByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.queryByTestId(/column-/i)).not.toBeInTheDocument();
  });

  it("shows the board when /api/me returns a user", async () => {
    mockAppFetch();
    render(<App />);
    expect(await screen.findAllByTestId(/column-/i)).toHaveLength(5);
  });

  it("returns to the form after logout", async () => {
    mockAppFetch();
    render(<App />);
    await screen.findAllByTestId(/column-/i);
    await userEvent.click(screen.getByRole("button", { name: /log out/i }));
    expect(await screen.findByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.queryByTestId(/column-/i)).not.toBeInTheDocument();
  });
});
