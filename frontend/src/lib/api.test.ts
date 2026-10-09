import { api, ApiError, errorText } from "@/lib/api";
import { mockFetch } from "@/test/mockFetch";

describe("api", () => {
  it("sends JSON with credentials and returns the parsed body", async () => {
    const fetchMock = mockFetch(() => ({ body: { id: 1 } }));
    await expect(api("/api/boards", "POST", { name: "A" })).resolves.toEqual({ id: 1 });
    expect(fetchMock).toHaveBeenCalledWith("/api/boards", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "A" }),
    });
  });

  it("sends no body or content type for a GET", async () => {
    const fetchMock = mockFetch(() => ({ body: [] }));
    await api("/api/boards");
    expect(fetchMock).toHaveBeenCalledWith("/api/boards", {
      method: "GET",
      credentials: "include",
      headers: undefined,
      body: undefined,
    });
  });

  it("returns undefined for 204", async () => {
    mockFetch(() => ({ status: 204 }));
    await expect(api("/api/boards/1", "DELETE")).resolves.toBeUndefined();
  });

  it("throws ApiError with the status and string detail", async () => {
    mockFetch(() => ({ status: 409, body: { detail: "Username is taken" } }));
    const error = await api<never>("/api/register", "POST", {}).catch((caught: ApiError) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(409);
    expect(error.message).toBe("Username is taken");
  });

  it("ignores non-string details", async () => {
    mockFetch(() => ({ status: 422, body: { detail: [{ msg: "bad" }] } }));
    const error = await api<never>("/api/register", "POST", {}).catch((caught: ApiError) => caught);
    expect(error.status).toBe(422);
    expect(error.message).toBe("");
  });

  it("throws status 0 when the server is unreachable", async () => {
    mockFetch(() => "network-error");
    const error = await api<never>("/api/me").catch((caught: ApiError) => caught);
    expect(error.status).toBe(0);
    expect(error.message).toBe("Could not reach the server.");
  });

  it("errorText prefers the API message and falls back otherwise", () => {
    expect(errorText(new ApiError(409, "Taken"), "Fallback")).toBe("Taken");
    expect(errorText(new ApiError(500, ""), "Fallback")).toBe("Fallback");
    expect(errorText(new Error("other"), "Fallback")).toBe("Fallback");
  });
});
