import { expect, test, type Page } from "@playwright/test";
import { initialData } from "../src/lib/kanban";
import { columns, deleteSelf, openApp, registerUser, seedFirstBoard, waitForSave } from "./helpers";

const addCard = async (page: Page, title: string) => {
  const firstColumn = columns(page).first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill(title);
  await firstColumn.getByRole("button", { name: /add card/i }).click();
};

test("an owner shares a board, the member edits it, and conflicts reload", async ({
  page,
  browser,
}) => {
  const owner = await registerUser(page, "owner");
  const boardId = await seedFirstBoard(page.request);
  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  const member = await registerUser(memberPage, "member");

  try {
    await openApp(page);
    await page.getByLabel("Add member by username").fill(member);
    await page.getByRole("button", { name: "Share", exact: true }).click();
    await expect(page.getByTestId("members").getByText(member)).toBeVisible();

    await openApp(memberPage);
    const shared = memberPage.getByRole("list", { name: "Shared boards" }).getByRole("button");
    await expect(shared).toHaveText(`My Boardby ${owner}8`);
    await shared.click();
    await expect(memberPage.getByLabel("Board name", { exact: true })).toBeDisabled();
    await expect(memberPage.getByRole("button", { name: /leave board/i })).toBeVisible();
    const saved = waitForSave(memberPage);
    await addCard(memberPage, "Added by member");
    await saved;

    // The owner's page still holds version 1, so its next save conflicts and reloads.
    await addCard(page, "Stale owner edit");
    await expect(page.getByText(/someone else changed this board/i)).toBeVisible();
    await expect(page.getByText("Added by member")).toBeVisible();
    await expect(page.getByText("Stale owner edit")).toHaveCount(0);

    await addCard(page, "Owner edit after reload");
    await expect(page.getByText("Owner edit after reload")).toBeVisible();
    await memberPage.reload();
    await memberPage.getByRole("list", { name: "Shared boards" }).getByRole("button").click();
    await expect(memberPage.getByText("Owner edit after reload")).toBeVisible();

    memberPage.once("dialog", (dialog) => dialog.accept());
    await memberPage.getByRole("button", { name: /leave board/i }).click();
    await expect(memberPage.getByRole("list", { name: "Shared boards" })).toHaveCount(0);
    const gone = await memberPage.request.get(`/api/boards/${boardId}`);
    expect(gone.status()).toBe(404);
  } finally {
    await deleteSelf(memberPage.request);
    await memberContext.close();
    await deleteSelf(page.request);
  }
});

test("a stale API write is rejected with 409", async ({ page }) => {
  await registerUser(page);
  try {
    const boardId = await seedFirstBoard(page.request);
    const stale = await page.request.put(`/api/boards/${boardId}/data?version=1`, {
      data: initialData,
    });
    expect(stale.status()).toBe(409);
  } finally {
    await deleteSelf(page.request);
  }
});
