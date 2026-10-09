import { expect, test } from "@playwright/test";
import { PASSWORD, uniqueName } from "./helpers";

test("an admin creates, promotes, resets, and deletes a user", async ({ page, browser }) => {
  const username = uniqueName("managed");
  await page.goto("/");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.getByRole("button", { name: "Users" }).click();

  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Add user" }).click();
  const row = page.getByTestId(`user-row-${username}`);
  await expect(row).toContainText("Member");

  await row.getByRole("button", { name: /make admin/i }).click();
  await expect(row).toContainText("Admin");

  await row.getByRole("button", { name: /reset password/i }).click();
  await page.getByLabel(`New password for ${username}`).fill("reset-password");
  await row.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toHaveText(`Password reset for ${username}.`);

  const other = await browser.newContext();
  const login = await other.request.post("http://127.0.0.1:8000/api/login", {
    data: { username, password: "reset-password" },
  });
  expect(await login.json()).toMatchObject({ username, isAdmin: true });
  await other.close();

  page.once("dialog", (dialog) => dialog.accept());
  await row.getByRole("button", { name: `Delete ${username}` }).click();
  await expect(page.getByRole("status")).toHaveText(`Deleted ${username}.`);
  await expect(row).toHaveCount(0);
});

test("a member gets 403 from the admin API", async ({ page }) => {
  const username = uniqueName("member");
  await page.request.post("/api/register", { data: { username, password: PASSWORD } });
  expect((await page.request.get("/api/users")).status()).toBe(403);
  await page.request.delete("/api/me", { data: { password: PASSWORD } });
});
