import type { BoardData } from "@/lib/kanban";

export type User = {
  id: number;
  username: string;
  isAdmin: boolean;
};

export type AdminUserRow = User & {
  boardCount: number;
  createdAt: string;
};

export type BoardSummary = {
  id: number;
  name: string;
  cardCount: number;
  createdAt: string;
  updatedAt: string;
};

export type BoardRecord = {
  id: number;
  name: string;
  createdAt: string;
  updatedAt: string;
  data: BoardData;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export const api = async <T>(path: string, method = "GET", body?: unknown): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: "include",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Could not reach the server.");
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const detail = typeof data?.detail === "string" ? data.detail : "";
    throw new ApiError(response.status, detail);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
};

export const errorText = (error: unknown, fallback: string) =>
  error instanceof ApiError && error.message ? error.message : fallback;
