import { test, expect } from "@playwright/test";

test("dashboard loads and shows the tool runner", async ({ page }) => {
  await page.goto("/tools");
  await expect(page.getByRole("img", { name: "PGAutoPilot" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Execute" })).toBeVisible();
});
