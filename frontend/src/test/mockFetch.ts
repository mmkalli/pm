import type { Mock } from "vitest";

export type Reply = { status?: number; body?: unknown } | "network-error";

export type Handler = (
  method: string,
  path: string,
  body: unknown
) => Reply | undefined | Promise<Reply | undefined>;

/** Stubs fetch. The handler returns a reply; undefined means 404. */
export const mockFetch = (handler: Handler) => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const reply = await handler(method, String(input), body);
    if (reply === "network-error") {
      throw new TypeError("Failed to fetch");
    }
    const status = reply?.status ?? (reply ? 200 : 404);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => reply?.body ?? {},
    } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

/** Parsed JSON bodies of calls matching method and path. */
export const bodiesFor = (fetchMock: Mock, method: string, path: string) =>
  fetchMock.mock.calls
    .filter(
      ([input, init]) =>
        String(input) === path && ((init as RequestInit | undefined)?.method ?? "GET") === method
    )
    .map(([, init]) => {
      const raw = (init as RequestInit | undefined)?.body;
      return raw ? JSON.parse(String(raw)) : undefined;
    });
