import { expect, test } from "@playwright/test"

for (const account of [
  { role: "operator", heading: "Operator workspace" },
  { role: "officer", heading: "Officer workspace" },
]) {
  test(`${account.role} signs in and out with the keyboard`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: account.role === "operator" ? 390 : 1280, height: 844 })
    await page.goto("/")
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible()

    await expect(page.getByLabel("Username")).toBeFocused()
    await page.getByLabel("Username").fill(account.role)
    await page.keyboard.press("Tab")
    await expect(page.getByLabel("Password")).toBeFocused()
    await page.getByLabel("Password").fill(`local-${account.role}-password`)
    await page.keyboard.press("Tab")
    await page.keyboard.press("Enter")

    await expect(page.getByRole("heading", { name: account.heading })).toBeVisible()
    await expect(page.locator("main")).toHaveCSS("overflow-x", "visible")
    await page.screenshot({ path: testInfo.outputPath(`${account.role}-workspace.png`), fullPage: true })

    await page.getByRole("button", { name: "Sign out" }).focus()
    await page.keyboard.press("Enter")
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible()
  })
}
