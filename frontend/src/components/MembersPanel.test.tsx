import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MembersPanel } from "@/components/MembersPanel";
import { bodiesFor, mockFetch, type Reply } from "@/test/mockFetch";

const URL = "/api/boards/3/members";

const setup = (isOwner = true, replies: { list?: Reply; add?: Reply; remove?: Reply } = {}) => {
  const fetchMock = mockFetch((method, path, body) => {
    if (path === URL && method === "GET") {
      return replies.list ?? { body: [{ id: 2, username: "alice" }] };
    }
    if (path === URL && method === "POST") {
      return replies.add ?? { status: 201, body: { id: 5, username: (body as { username: string }).username } };
    }
    if (path === `${URL}/2` && method === "DELETE") return replies.remove ?? { status: 204 };
    return undefined;
  });
  render(<MembersPanel boardId={3} owner="user" isOwner={isOwner} />);
  return { fetchMock };
};

const share = async (username: string) => {
  await userEvent.type(screen.getByLabelText("Add member by username"), username);
  await userEvent.click(screen.getByRole("button", { name: "Share" }));
};

describe("MembersPanel", () => {
  it("lists the owner and members", async () => {
    setup();
    expect(await screen.findByText("alice")).toBeInTheDocument();
    expect(screen.getByText("user (owner)")).toBeInTheDocument();
  });

  it("adds a member by username", async () => {
    const { fetchMock } = setup();
    await screen.findByText("alice");
    await share(" bob ");
    expect(await screen.findByText("bob")).toBeInTheDocument();
    expect(bodiesFor(fetchMock, "POST", URL)).toEqual([{ username: "bob" }]);
    expect(screen.getByLabelText("Add member by username")).toHaveValue("");
  });

  it("ignores a blank username", async () => {
    const { fetchMock } = setup();
    await screen.findByText("alice");
    await share("   ");
    expect(bodiesFor(fetchMock, "POST", URL)).toHaveLength(0);
  });

  it("shows the server error when adding fails", async () => {
    setup(true, { add: { status: 404, body: { detail: "No user with that name" } } });
    await screen.findByText("alice");
    await share("ghost");
    expect(await screen.findByRole("alert")).toHaveTextContent("No user with that name");
  });

  it("removes a member", async () => {
    setup();
    await userEvent.click(await screen.findByRole("button", { name: "Remove member alice" }));
    await waitFor(() => expect(screen.queryByText("alice")).not.toBeInTheDocument());
  });

  it("shows an error when removing fails", async () => {
    setup(true, { remove: { status: 500 } });
    await userEvent.click(await screen.findByRole("button", { name: "Remove member alice" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not remove the member.");
    expect(screen.getByText("alice")).toBeInTheDocument();
  });

  it("hides the controls from members", async () => {
    setup(false);
    expect(await screen.findByText("alice")).toBeInTheDocument();
    expect(screen.queryByLabelText("Add member by username")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove member alice" })).not.toBeInTheDocument();
  });

  it("shows an error when members cannot load", async () => {
    setup(true, { list: { status: 500 } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load members.");
  });
});
