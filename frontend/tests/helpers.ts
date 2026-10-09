import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { initialData, type BoardData } from "../src/lib/kanban";

export const PASSWORD = "e2e-password";

export const uniqueName = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Registers a throwaway user in the page's browser context, so the page is signed in. */
export const registerUser = async (page: Page, prefix = "e2e") => {
  const username = uniqueName(prefix);
  const response = await page.request.post("/api/register", {
    data: { username, password: PASSWORD },
  });
  expect(response.status()).toBe(201);
  return username;
};

/** Replaces the signed-in user's first board with `data` (default: the demo board). */
export const seedFirstBoard = async (request: APIRequestContext, data: BoardData = initialData) => {
  const boards = await (await request.get("/api/boards")).json();
  const response = await request.put(`/api/boards/${boards[0].id}/data`, { data });
  expect(response.ok()).toBe(true);
  return boards[0].id as number;
};

/** Deletes the signed-in throwaway user. */
export const deleteSelf = async (request: APIRequestContext) => {
  await request.delete("/api/me", { data: { password: PASSWORD } });
};

export const openApp = async (page: Page) => {
  await page.goto("/");
  await expect(page.getByTestId("current-user")).toBeVisible();
};

export const columns = (page: Page) => page.locator('[data-testid^="column-"]');

export const waitForSave = (page: Page) =>
  page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith("/data") && response.request().method() === "PUT"
  );
