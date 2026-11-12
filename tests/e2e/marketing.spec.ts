import { test, expect } from "@playwright/test";

test.describe("public website", () => {
  for (const path of ["/", "/how-it-works", "/platform", "/trust", "/developers", "/receipts/verify"]) {
    test(`renders ${path} without errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("img", { name: "PACT Protocol" }).first()).toBeVisible();
      await expect(page.locator("h1, h2").first()).toBeVisible();
      expect(errors).toEqual([]);
    });
  }

  test("has no horizontal overflow on the home page", async ({ page }) => {
    await page.goto("/");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(overflow).toBe(false);
  });

  test("protected routes redirect to sign-in", async ({ page }) => {
    await page.goto("/app");
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("health endpoint reports the database", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.database).toBe("ok");
  });
});
