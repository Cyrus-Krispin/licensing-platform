import { expect, test } from "@playwright/test";

for (const account of [
  { role: "operator", heading: "Operator workspace" },
  { role: "officer", heading: "Officer workspace" },
]) {
  test(`${account.role} signs in and out with the keyboard`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({
      width: account.role === "operator" ? 390 : 1280,
      height: 844,
    });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

    await expect(page.getByLabel("Username")).toBeFocused();
    await page.getByLabel("Username").fill(account.role);
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Password")).toBeFocused();
    await page.getByLabel("Password").fill(`local-${account.role}-password`);
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");

    await expect(
      page.getByRole("heading", { name: account.heading }),
    ).toBeVisible();
    await expect(page.locator("main")).toHaveCSS("overflow-x", "visible");
    if (account.role === "operator") {
      const legalName = "L".repeat(200);
      await page.getByRole("button", { name: "Create draft" }).click();
      await page.getByLabel(/Legal name/).fill(legalName);
      await page.getByLabel(/Role/).selectOption("REPRESENTATIVE");
      await page.getByLabel(/Contact email/).fill("owner@example.test");
      await page.getByLabel(/^Address/).fill("10 Market Street");
      await page.getByLabel(/Does the premises/).selectOption("true");
      await page.getByLabel(/Unit number/).fill("Suite 2");
      await page.getByLabel(/Tenure/).selectOption("RENTED");
      await page
        .getByLabel("Business type (required to submit)")
        .selectOption("CAFE");
      await page.getByRole("checkbox", { name: "Cooking" }).check();
      await page.getByRole("checkbox", { name: "Dine In" }).check();
      await page.getByLabel("Monday hours").selectOption("CLOSED");
      await page.getByLabel("Tuesday hours").selectOption("OPEN");
      await page.getByLabel("Opens on Tuesday").fill("09:00");
      await page.getByLabel("Closes on Tuesday").fill("17:00");
      await page.getByLabel("Wednesday hours").selectOption("OPEN");
      await page.getByLabel("Opens on Wednesday").fill("18:00");
      await page.getByLabel("Closes on Wednesday").fill("02:00");
      await page
        .getByRole("checkbox", { name: "Closes next day for Wednesday" })
        .check();
      await page.getByLabel(/Proposed opening date/).fill("2020-02-29");
      await page.getByRole("button", { name: "Save draft" }).click();
      await expect(
        page.getByRole("status").filter({ hasText: "Saved revision 1" }),
      ).toBeVisible();
      const requirements = page.getByRole("region", {
        name: "Evidence requirements",
      });
      const leaseRequirement = requirements.getByRole("listitem", {
        name: "Lease Evidence requirement",
      });
      const representativeRequirement = requirements.getByRole("listitem", {
        name: "Representative Authorization requirement",
      });
      await expect(
        leaseRequirement.getByText("Required because the premises are rented."),
      ).toBeVisible();
      await expect(
        representativeRequirement.getByText(
          "Required because the applicant is a representative.",
        ),
      ).toBeVisible();
      await page.reload();
      await page.getByTitle(legalName).click();
      await expect(page.getByLabel(/Legal name/)).toHaveValue(legalName);
      await expect(page.getByLabel(/Role/)).toHaveValue("REPRESENTATIVE");
      await expect(page.getByLabel(/^Address/)).toHaveValue("10 Market Street");
      await expect(page.getByLabel(/Unit number/)).toHaveValue("Suite 2");
      await expect(page.getByLabel(/Tenure/)).toHaveValue("RENTED");
      await expect(
        page.getByLabel("Business type (required to submit)"),
      ).toHaveValue("CAFE");
      await expect(page.getByLabel("Monday hours")).toHaveValue("CLOSED");
      await expect(page.getByLabel("Tuesday hours")).toHaveValue("OPEN");
      await expect(
        page.getByRole("checkbox", { name: "Closes next day for Wednesday" }),
      ).toBeChecked();
      await expect(
        page.getByRole("heading", { name: /Saved completion:/ }),
      ).toBeVisible();
      const registration = requirements.getByRole("listitem", {
        name: "Business Registration requirement",
      });
      await page.getByLabel(/Legal name/).fill("Unsaved after upload");
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      );
      const longFilename = `${"X".repeat(251)}.png`;
      await registration.getByLabel("Upload evidence").setInputFiles({
        name: longFilename,
        mimeType: "image/png",
        buffer: png,
      });
      await registration.getByRole("button", { name: "Upload file" }).click();
      await expect(
        registration.getByRole("link", { name: `Open saved ${longFilename}` }),
      ).toBeVisible();
      await expect(
        registration.getByRole("link", { name: `Open saved ${longFilename}` }),
      ).toHaveAttribute("title", longFilename);
      await expect(page.getByLabel(/Legal name/)).toHaveValue(
        "Unsaved after upload",
      );
      const downloaded = await page.request.get(
        (await registration
          .getByRole("link", { name: `Open saved ${longFilename}` })
          .getAttribute("href")) as string,
      );
      expect(downloaded.status()).toBe(200);
      expect(downloaded.headers()["x-content-type-options"]).toBe("nosniff");
      expect(await downloaded.body()).toEqual(png);
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              document.documentElement.scrollWidth <=
              document.documentElement.clientWidth,
          ),
        )
        .toBe(true);
    }
    await page.screenshot({
      path: testInfo.outputPath(`${account.role}-workspace.png`),
      fullPage: true,
    });

    await page.getByRole("button", { name: "Sign out" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });
}

test("two tabs preserve different weekday edits through explicit conflict review", async ({
  context,
}) => {
  const first = await context.newPage();
  await first.goto("/");
  await first.getByLabel("Username").fill("operator");
  await first.getByLabel("Password").fill("local-operator-password");
  await first.getByRole("button", { name: "Sign in" }).click();
  await first.getByRole("button", { name: "Create draft" }).click();

  const second = await context.newPage();
  await second.goto("/");
  await second.getByRole("button", { name: "Untitled draft" }).first().click();
  await second.getByLabel("Tuesday hours").selectOption("CLOSED");
  await second.getByRole("button", { name: "Save draft" }).click();
  await expect(
    second.getByRole("status").filter({ hasText: "Saved revision 1" }),
  ).toBeVisible();

  await first.getByLabel("Monday hours").selectOption("CLOSED");
  await first.getByRole("button", { name: "Save draft" }).click();
  await expect(first.getByText("Saved draft changed")).toBeVisible();
  await first.getByRole("button", { name: "Keep and review my edits" }).click();
  await expect(first.getByLabel("Monday hours")).toHaveValue("CLOSED");
  await expect(first.getByLabel("Tuesday hours")).toHaveValue("CLOSED");
  await first.getByRole("button", { name: "Save draft" }).click();
  await expect(
    first.getByRole("status").filter({ hasText: "Saved revision 2" }),
  ).toBeVisible();
});
