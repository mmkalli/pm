import { expect, test } from "@playwright/test";
import { columns, deleteSelf, openApp, registerUser, seedFirstBoard, waitForSave } from "./helpers";

test.beforeEach(async ({ page }) => {
  await registerUser(page);
  await seedFirstBoard(page.request);
  await openApp(page);
  await expect(columns(page)).toHaveCount(5);
});

test.afterEach(async ({ page }) => {
  await deleteSelf(page.request);
});

test("loads the demo board with stats", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  await expect(page.getByTestId("card-card-1")).toBeVisible();
  await expect(page.getByTestId("board-stats")).toHaveText(
    "8 cards · 0 high priority · 0 overdue"
  );
});

test("adds a card that persists after reload", async ({ page }) => {
  const firstColumn = columns(page).first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Persisted card");
  await firstColumn.getByPlaceholder("Details").fill("Stays after reload.");
  const saved = waitForSave(page);
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await saved;
  await page.reload();
  await expect(columns(page).first().getByText("Persisted card")).toBeVisible();
});

test("renames a column that persists after reload", async ({ page }) => {
  const title = page.getByTestId("column-col-discovery").getByLabel("Column title");
  await title.fill("Research");
  const saved = waitForSave(page);
  await title.blur();
  await saved;
  await page.reload();
  await expect(page.getByTestId("column-col-discovery").getByLabel("Column title")).toHaveValue(
    "Research"
  );
});

test("drags a card to another column and keeps it there after reload", async ({ page }) => {
  const card = page.getByTestId("card-card-1");
  const target = page.getByTestId("column-col-review");
  const cardBox = await card.boundingBox();
  const targetBox = await target.boundingBox();
  if (!cardBox || !targetBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }
  const saved = waitForSave(page);
  await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + 120, { steps: 12 });
  await page.mouse.up();
  await saved;
  await expect(target.getByTestId("card-card-1")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("column-col-review").getByTestId("card-card-1")).toBeVisible();
});

test("edits card priority, due date, and labels", async ({ page }) => {
  await page.getByRole("button", { name: "Edit Align roadmap themes", exact: true }).click();
  await page.getByLabel("Card priority").selectOption("high");
  await page.getByLabel("Card due date").fill("2000-01-15");
  await page.getByLabel("Card labels").fill("strategy, q3");
  const saved = waitForSave(page);
  await page.getByRole("button", { name: "Save" }).click();
  await saved;

  const card = page.getByTestId("card-card-1");
  await expect(card.getByText("high")).toBeVisible();
  await expect(card.getByTestId("due-date")).toHaveText("Overdue 2000-01-15");
  await expect(card.getByText("strategy")).toBeVisible();
  await expect(page.getByTestId("board-stats")).toHaveText(
    "8 cards · 1 high priority · 1 overdue"
  );
  await page.reload();
  await expect(page.getByTestId("card-card-1").getByText("q3")).toBeVisible();
});

test("filters cards by search text and label", async ({ page }) => {
  await page.getByLabel("Search cards").fill("onboarding");
  await expect(page.locator('[data-testid^="card-"]')).toHaveCount(1);
  await expect(page.getByText("Close onboarding sprint")).toBeVisible();
  await page.getByRole("button", { name: /clear filters/i }).click();
  await expect(page.locator('[data-testid^="card-"]')).toHaveCount(8);
});

test("adds, moves, and removes a column", async ({ page }) => {
  await page.getByLabel("New column title").fill("Blocked");
  let saved = waitForSave(page);
  await page.getByRole("button", { name: /add column/i }).click();
  await saved;
  await expect(columns(page)).toHaveCount(6);
  await expect(columns(page).last().getByLabel("Column title")).toHaveValue("Blocked");

  saved = waitForSave(page);
  await page.getByRole("button", { name: "Move Blocked left" }).click();
  await saved;
  await expect(columns(page).nth(4).getByLabel("Column title")).toHaveValue("Blocked");

  await page.reload();
  await expect(columns(page)).toHaveCount(6);
  await expect(columns(page).nth(4).getByLabel("Column title")).toHaveValue("Blocked");

  saved = waitForSave(page);
  await page.getByRole("button", { name: "Remove column Blocked" }).click();
  await saved;
  await page.reload();
  await expect(columns(page)).toHaveCount(5);
});
