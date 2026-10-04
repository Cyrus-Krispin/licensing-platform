import { expect, test } from "@playwright/test";

test("bell dropdown reads and clears notifications without leaving applications", async ({ page }, testInfo) => {
  let notices = [
    { id: "notice", applicationId: "case", message: "Your application is under review", createdAt: "2026-10-04T00:00:00Z", readAt: null as string | null },
    { id: "older", applicationId: "case", message: "Your application was received", createdAt: "2026-10-03T00:00:00Z", readAt: "2026-10-03T01:00:00Z" as string | null },
  ];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    let body: unknown;
    if (path === "/api/auth/me") body = { username: "operator", role: "OPERATOR" };
    else if (path === "/api/auth/csrf") body = { token: "test-token", headerName: "X-XSRF-TOKEN" };
    else if (path === "/api/workspaces/operator") body = { heading: "Operator workspace", message: "Create an application or continue one of your saved drafts.", username: "operator" };
    else if (path === "/api/applications" && method === "GET") body = [];
    else if (path === "/api/notifications" && method === "GET") body = notices;
    else if (path === "/api/notifications" && method === "DELETE") {
      expect(route.request().headers()["x-xsrf-token"]).toBe("test-token");
      notices = [];
      await route.fulfill({ status: 204 }); return;
    } else if (path === "/api/notifications/notice/read" && method === "POST") {
      notices = notices.map((item) => item.id === "notice" ? { ...item, readAt: "2026-10-04T01:00:00Z" } : item);
      await route.fulfill({ status: 204 }); return;
    } else { await route.abort(); return; }
    await route.fulfill({ json: body });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Notifications, 1 unread" }).click();
  const popup = page.getByRole("dialog", { name: "Notifications · 1 unread" });
  await expect(popup).toBeVisible();
  await expect(page.getByRole("button", { name: "Create application", exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Notifications" })).toHaveCount(0);
  await expect(popup).toHaveCSS("opacity", "1");
  await expect(popup.getByRole("button", { name: "Refresh notifications" })).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath("notification-dropdown.png") });
  await popup.getByRole("button", { name: "Mark all as read" }).click();
  await expect(page.getByRole("button", { name: "Notifications, 0 unread" })).toBeVisible();
  await page.getByRole("button", { name: "Clear all", exact: true }).click();
  await expect(page.getByText("Your application is under review", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Clear all", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Notifications, 0 unread" })).toBeFocused();
  await page.setViewportSize({ width: 320, height: 700 });
  await page.getByRole("button", { name: "Notifications, 0 unread" }).click();
  await expect(page.getByRole("dialog", { name: "Notifications · 0 unread" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
