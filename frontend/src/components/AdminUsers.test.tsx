import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminUsers } from "@/components/AdminUsers";
import type { AdminUserRow } from "@/lib/api";
import { bodiesFor, mockFetch, type Reply } from "@/test/mockFetch";

const row = (id: number, username: string, isAdmin = false): AdminUserRow => ({
  id,
  username,
  isAdmin,
  boardCount: 1,
  createdAt: "2026-10-09T12:00:00Z",
});

const setup = (replies: { create?: Reply; patch?: Reply; remove?: Reply; list?: Reply } = {}) => {
  let users = [row(1, "user", true), row(2, "bob")];
  const fetchMock = mockFetch((method, path, body) => {
    if (path === "/api/users" && method === "GET") return replies.list ?? { body: users };
    if (path === "/api/users" && method === "POST") {
      if (replies.create) return replies.create;
      const input = body as { username: string; isAdmin: boolean };
      users = [...users, row(3, input.username, input.isAdmin)];
      return { status: 201, body: users[2] };
    }
    const id = Number(path.split("/").pop());
    if (method === "PATCH") {
      if (replies.patch) return replies.patch;
      const change = body as { isAdmin?: boolean };
      users = users.map((user) =>
        user.id === id && change.isAdmin !== undefined ? { ...user, isAdmin: change.isAdmin } : user
      );
      return { body: users.find((user) => user.id === id) };
    }
    if (method === "DELETE") {
      if (replies.remove) return replies.remove;
      users = users.filter((user) => user.id !== id);
      return { status: 204 };
    }
    return undefined;
  });
  render(<AdminUsers currentUserId={1} />);
  return { fetchMock };
};

const bobRow = () => screen.getByTestId("user-row-bob");

describe("AdminUsers", () => {
  it("lists users with role, board count, and created date", async () => {
    setup();
    const self = await screen.findByTestId("user-row-user");
    expect(self).toHaveTextContent("user(you)");
    expect(self).toHaveTextContent("Admin");
    expect(self).toHaveTextContent("2026-10-09");
    expect(bobRow()).toHaveTextContent("Member");
  });

  it("disables role change and delete for the current admin", async () => {
    setup();
    const self = await screen.findByTestId("user-row-user");
    expect(within(self).getByRole("button", { name: /revoke admin/i })).toBeDisabled();
    expect(within(self).getByRole("button", { name: "Delete user" })).toBeDisabled();
  });

  it("shows an error when users cannot load", async () => {
    setup({ list: { status: 500 } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load users.");
  });

  it("creates a user", async () => {
    const { fetchMock } = setup();
    await screen.findByTestId("user-row-bob");
    await userEvent.type(screen.getByLabelText("Username"), "carol");
    await userEvent.type(screen.getByLabelText("Password"), "carol-pass");
    await userEvent.click(screen.getByLabelText("Admin"));
    await userEvent.click(screen.getByRole("button", { name: "Add user" }));
    expect(await screen.findByTestId("user-row-carol")).toHaveTextContent("Admin");
    expect(screen.getByRole("status")).toHaveTextContent("Created carol.");
    expect(bodiesFor(fetchMock, "POST", "/api/users")).toEqual([
      { username: "carol", password: "carol-pass", isAdmin: true },
    ]);
    expect(screen.getByLabelText("Username")).toHaveValue("");
  });

  it("shows the server error for a taken username", async () => {
    setup({ create: { status: 409, body: { detail: "Username is taken" } } });
    await screen.findByTestId("user-row-bob");
    await userEvent.type(screen.getByLabelText("Username"), "bob");
    await userEvent.type(screen.getByLabelText("Password"), "bob-password");
    await userEvent.click(screen.getByRole("button", { name: "Add user" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Username is taken");
    expect(screen.getByLabelText("Username")).toHaveValue("bob");
  });

  it("grants and revokes admin", async () => {
    const { fetchMock } = setup();
    await screen.findByTestId("user-row-bob");
    await userEvent.click(within(bobRow()).getByRole("button", { name: /make admin/i }));
    expect(await screen.findByRole("status")).toHaveTextContent("bob is now an admin.");
    await waitFor(() => expect(bobRow()).toHaveTextContent("Admin"));
    await userEvent.click(within(bobRow()).getByRole("button", { name: /revoke admin/i }));
    expect(await screen.findByText("bob is now a member.")).toBeInTheDocument();
    expect(bodiesFor(fetchMock, "PATCH", "/api/users/2")).toEqual([
      { isAdmin: true },
      { isAdmin: false },
    ]);
  });

  it("resets a password", async () => {
    const { fetchMock } = setup();
    await screen.findByTestId("user-row-bob");
    await userEvent.click(within(bobRow()).getByRole("button", { name: /reset password/i }));
    await userEvent.type(screen.getByLabelText("New password for bob"), "fresh-pass");
    await userEvent.click(within(bobRow()).getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Password reset for bob.");
    expect(screen.queryByLabelText("New password for bob")).not.toBeInTheDocument();
    expect(bodiesFor(fetchMock, "PATCH", "/api/users/2")).toEqual([{ password: "fresh-pass" }]);
  });

  it("keeps the reset form open when the reset fails", async () => {
    setup({ patch: { status: 500 } });
    await screen.findByTestId("user-row-bob");
    await userEvent.click(within(bobRow()).getByRole("button", { name: /reset password/i }));
    await userEvent.type(screen.getByLabelText("New password for bob"), "fresh-pass");
    await userEvent.click(within(bobRow()).getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not reset the password.");
    expect(screen.getByLabelText("New password for bob")).toBeInTheDocument();
  });

  it("toggles the reset form closed", async () => {
    setup();
    await screen.findByTestId("user-row-bob");
    const toggle = within(bobRow()).getByRole("button", { name: /reset password/i });
    await userEvent.click(toggle);
    await userEvent.click(toggle);
    expect(screen.queryByLabelText("New password for bob")).not.toBeInTheDocument();
  });

  it("deletes a user after confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    setup();
    await screen.findByTestId("user-row-bob");
    await userEvent.click(within(bobRow()).getByRole("button", { name: "Delete bob" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Deleted bob.");
    expect(screen.queryByTestId("user-row-bob")).not.toBeInTheDocument();
  });

  it("keeps the user when deletion is declined", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const { fetchMock } = setup();
    await screen.findByTestId("user-row-bob");
    await userEvent.click(within(bobRow()).getByRole("button", { name: "Delete bob" }));
    expect(bodiesFor(fetchMock, "DELETE", "/api/users/2")).toHaveLength(0);
    expect(bobRow()).toBeInTheDocument();
  });
});
