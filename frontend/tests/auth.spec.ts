import { expect, test } from "@playwright/test";
import { PASSWORD, deleteSelf, openApp, registerUser, uniqueName } from "./helpers";

test("shows the login form when signed out", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Username")).toBeVisible();
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
});

test("rejects a wrong password", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByText("Invalid username or password.")).toBeVisible();
  await expect(page.getByTestId("current-user")).toHaveCount(0);
});

test("registers through the form, signs out, and signs back in", async ({ page }) => {
  const username = uniqueName("reg");
  await page.goto("/");
  await page.getByRole("button", { name: /create an account/i }).click();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: /^create account$/i }).click();

  await expect(page.getByTestId("current-user")).toHaveText(username);
  await expect(page.getByLabel("Board name", { exact: true })).toHaveValue("My Board");
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
  await expect(page.getByRole("button", { name: "Users" })).toHaveCount(0);

  await page.getByRole("button", { name: /log out/i }).click();
  await expect(page.getByLabel("Username")).toBeVisible();

  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByTestId("current-user")).toHaveText(username);
  await deleteSelf(page.request);
});

test("rejects a taken username on register", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /create an account/i }).click();
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: /^create account$/i }).click();
  await expect(page.getByText("That username is taken.")).toBeVisible();
});

test("keeps the session across a reload", async ({ page }) => {
  const username = await registerUser(page);
  await openApp(page);
  await page.reload();
  await expect(page.getByTestId("current-user")).toHaveText(username);
  await deleteSelf(page.request);
});

test("changes the password from the account view", async ({ page }) => {
  const username = await registerUser(page);
  await openApp(page);
  await page.getByRole("button", { name: "Account" }).click();
  await page.getByLabel("Current password").fill(PASSWORD);
  await page.getByLabel("New password", { exact: true }).fill("changed-password");
  await page.getByLabel("Confirm new password").fill("changed-password");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByRole("status")).toHaveText("Password changed.");

  await page.getByRole("button", { name: /log out/i }).click();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByText("Invalid username or password.")).toBeVisible();
  await page.getByLabel("Password").fill("changed-password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByTestId("current-user")).toHaveText(username);
  await page.request.delete("/api/me", { data: { password: "changed-password" } });
});

test("deletes the account from the account view", async ({ page }) => {
  const username = await registerUser(page);
  await openApp(page);
  await page.getByRole("button", { name: "Account" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: /delete my account/i }).click();
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();

  const login = await page.request.post("/api/login", {
    data: { username, password: PASSWORD },
  });
  expect(login.status()).toBe(401);
});
