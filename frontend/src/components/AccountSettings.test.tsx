import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AccountSettings } from "@/components/AccountSettings";
import { bodiesFor, mockFetch, type Reply } from "@/test/mockFetch";

const setup = (replies: { password?: Reply; remove?: Reply } = {}) => {
  const fetchMock = mockFetch((method, path) => {
    if (path === "/api/me/password") return replies.password ?? { body: { ok: true } };
    if (path === "/api/me" && method === "DELETE") return replies.remove ?? { status: 204 };
    return undefined;
  });
  const onDeleted = vi.fn();
  render(<AccountSettings onDeleted={onDeleted} />);
  return { fetchMock, onDeleted };
};

const changePassword = async (current: string, next: string, confirm = next) => {
  await userEvent.type(screen.getByLabelText("Current password"), current);
  await userEvent.type(screen.getByLabelText("New password"), next);
  await userEvent.type(screen.getByLabelText("Confirm new password"), confirm);
  await userEvent.click(screen.getByRole("button", { name: "Change password" }));
};

const deleteAccount = async (password: string) => {
  await userEvent.type(screen.getByLabelText("Password"), password);
  await userEvent.click(screen.getByRole("button", { name: /delete my account/i }));
};

describe("AccountSettings", () => {
  it("changes the password and clears the form", async () => {
    const { fetchMock } = setup();
    await changePassword("password", "new-password");
    expect(await screen.findByRole("status")).toHaveTextContent("Password changed.");
    expect(bodiesFor(fetchMock, "PUT", "/api/me/password")).toEqual([
      { currentPassword: "password", newPassword: "new-password" },
    ]);
    expect(screen.getByLabelText("Current password")).toHaveValue("");
  });

  it("rejects mismatched new passwords without calling the server", async () => {
    const { fetchMock } = setup();
    await changePassword("password", "new-password", "other-password");
    expect(screen.getByRole("alert")).toHaveTextContent("do not match");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [{ status: 403 }, "The current password is wrong."],
    [{ status: 422 }, "at least 8 characters"],
    ["network-error" as const, "Could not reach the server."],
  ])("shows the password change error for %o", async (reply, text) => {
    setup({ password: reply });
    await changePassword("password", "new-password");
    expect(await screen.findByRole("alert")).toHaveTextContent(text);
  });

  it("deletes the account after confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { fetchMock, onDeleted } = setup();
    await deleteAccount("password");
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(bodiesFor(fetchMock, "DELETE", "/api/me")).toEqual([{ password: "password" }]);
  });

  it("does nothing when deletion is not confirmed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const { fetchMock, onDeleted } = setup();
    await deleteAccount("password");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it("shows an error for a wrong password on delete", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { onDeleted } = setup({ remove: { status: 403 } });
    await deleteAccount("wrong");
    expect(await screen.findByRole("alert")).toHaveTextContent("The password is wrong.");
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
