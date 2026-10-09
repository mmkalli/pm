import { expect, test } from "@playwright/test";
import { columns, deleteSelf, openApp, registerUser, waitForSave } from "./helpers";

test.afterEach(async ({ page }) => {
  await deleteSelf(page.request);
});

const boardList = (page: import("@playwright/test").Page) =>
  page.getByRole("list", { name: "Boards" }).getByRole("button");

test("creates, switches, renames, and deletes boards", async ({ page }) => {
  await registerUser(page);
  await openApp(page);
  await expect(boardList(page)).toHaveCount(1);

  await page.getByLabel("New board name").fill("Hiring");
  await page.getByRole("button", { name: /create board/i }).click();
  await expect(page.getByLabel("Board name", { exact: true })).toHaveValue("Hiring");
  await expect(boardList(page)).toHaveCount(2);

  const firstColumn = columns(page).first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Interview loop");
  const saved = waitForSave(page);
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await saved;
  await expect(boardList(page).nth(1)).toHaveText("Hiring1");

  await boardList(page).first().click();
  await expect(page.getByLabel("Board name", { exact: true })).toHaveValue("My Board");
  await expect(page.getByText("Interview loop")).toHaveCount(0);

  await boardList(page).nth(1).click();
  const name = page.getByLabel("Board name", { exact: true });
  await name.fill("Hiring 2027");
  const renamed = page.waitForResponse((response) => response.request().method() === "PATCH");
  await name.blur();
  await renamed;
  await expect(boardList(page).nth(1)).toHaveText("Hiring 20271");

  await page.reload();
  await expect(boardList(page)).toHaveCount(2);
  await boardList(page).nth(1).click();
  await expect(page.getByText("Interview loop")).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: /delete board/i }).click();
  await expect(boardList(page)).toHaveCount(1);
  await expect(page.getByLabel("Board name", { exact: true })).toHaveValue("My Board");
});

test("users cannot see each other's boards", async ({ page, browser }) => {
  await registerUser(page, "owner");
  const boards = await (await page.request.get("/api/boards")).json();

  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await registerUser(otherPage, "other");
  const response = await otherPage.request.get(`/api/boards/${boards[0].id}`);
  expect(response.status()).toBe(404);
  await deleteSelf(otherPage.request);
  await other.close();
});
