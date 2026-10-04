import { expect, test, type Page } from "@playwright/test";
async function login(page: Page, role: string) {
  await page.goto("/");
  await page.getByLabel("Username").fill(role);
  await page.getByLabel("Password").fill(`local-${role}-password`);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: `${role === "operator" ? "Operator" : "Officer"} workspace`,
    }),
  ).toBeVisible();
}
async function declarations(page: Page) {
  await page
    .getByRole("checkbox", { name: "I confirm this application is accurate." })
    .check();
  await page
    .getByRole("checkbox", {
      name: "I am authorised to apply for this business.",
    })
    .check();
}
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
test("operator and officer complete targeted corrections, retained versions and approval", async ({
  browser,
}, testInfo) => {
  test.setTimeout(120000);

  const operatorContext = await browser.newContext();
  const officerContext = await browser.newContext();
  const operator = await operatorContext.newPage();
  const officer = await officerContext.newPage();
  const errors: string[] = [];
  operator.on("pageerror", (error) => errors.push(error.message));
  officer.on("pageerror", (error) => errors.push(error.message));
  operator.setDefaultTimeout(15000);
  officer.setDefaultTimeout(15000);
  const name = `Workflow Cafe ${Date.now()}`;
  await login(operator, "operator");
  await operator.getByRole("button", { name: "Create application" }).click();
  await operator.getByLabel(/Legal name/).fill(name);
  await operator.getByLabel(/Registration number/).fill("202612345A");
  await operator.getByLabel(/Business structure/).selectOption("COMPANY");
  await operator
    .getByRole("textbox", { name: "Name (required to submit)", exact: true })
    .fill("Cafe Owner");
  await operator
    .getByRole("combobox", { name: "Role (required to submit)", exact: true })
    .selectOption("OWNER");
  await operator.getByLabel(/Contact email/).fill("owner@example.test");
  await operator.getByLabel(/Phone/).fill("12345678");
  await operator.getByLabel(/^Address/).fill("10 Market Street");
  await operator.getByLabel(/Does the premises/).selectOption("false");
  await operator.getByLabel(/Tenure/).selectOption("OWNED");
  await operator.getByLabel(/Business type/).selectOption("CAFE");
  await operator
    .getByRole("checkbox", { name: "Cooking", exact: true })
    .check();
  await operator
    .getByRole("checkbox", { name: "Dine In", exact: true })
    .check();
  await operator.getByLabel(/Proposed opening date/).fill("2026-12-01");
  for (const day of [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ])
    await operator
      .getByLabel(`${day} hours`, { exact: true })
      .selectOption("CLOSED");
  await operator
    .getByRole("button", { name: "Save draft", exact: true })
    .click();
  await expect(
    operator.getByRole("status").filter({ hasText: "Saved revision" }),
  ).toBeVisible();
  const requirements = operator.getByRole("region", {
    name: "Evidence requirements",
  });
  for (const type of [
    "Business Registration",
    "Premises Layout",
    "Food Use Permission",
    "Ownership Evidence",
  ]) {
    const request = requirements.getByRole("listitem", {
      name: `${type} requirement`,
    });
    await request
      .locator('input[type="file"]')
      .setInputFiles({
        name: `${type}.png`,
        mimeType: "image/png",
        buffer: png,
      });
    await request
      .getByRole("button", { name: "Upload file", exact: true })
      .click();
    await expect(
      request.getByRole("link", { name: `Open saved ${type}.png` }),
    ).toBeVisible();
  }
  await operator
    .getByRole("button", { name: "Submit application" })
    .click();
  await declarations(operator);
  await operator
    .getByRole("button", { name: "Submit application", exact: true })
    .click();
  await expect(
    operator.getByRole("heading", { name: "Submitted · Version 1" }),
  ).toBeVisible();
  await expect(operator.getByLabel(/Legal name/)).toBeDisabled();
  await login(officer, "officer");
  await officer.getByRole("button", { name: new RegExp(name) }).click();
  await officer.getByRole("button", { name: "Start review" }).click();
  await expect(
    officer.getByRole("heading", { name: "Under Review · Version 1" }),
  ).toBeVisible();
  await officer
    .getByLabel("Correction explanation", { exact: true })
    .fill("Correct registered legal name");
  await officer.getByRole("button", { name: "Save review request" }).click();
  await expect(
    officer.getByText("Correct registered legal name", { exact: true }),
  ).toBeVisible();
  await officer.getByLabel("Correction kind").selectOption("DOCUMENT");
  await officer.getByLabel("Requested field or document").selectOption({label:"BUSINESS REGISTRATION"});
  await officer.getByLabel("Correction explanation", {exact:true}).fill("Replace registration image");
  await officer.getByRole("button", {name:"Save review request"}).click();
  await expect(officer.getByText("Replace registration image", {exact:true})).toBeVisible();
  await officer.getByLabel("Correction kind").selectOption("ADDITIONAL");
  await officer.getByLabel(/Additional evidence title/).fill("Signed consent");
  await officer.getByLabel("Correction explanation", {exact:true}).fill("Supply signed consent");
  await officer.getByRole("button", {name:"Save review request"}).click();
  await expect(officer.getByText("Supply signed consent", {exact:true})).toBeVisible();
  await officer
    .getByRole("button", { name: "Publish fixed correction round" })
    .click();
  await expect(
    officer.getByRole("heading", {
      name: "Pending Pre-Site Resubmission · Version 1",
    }),
  ).toBeVisible();
  await expect(
    officer.getByRole("button", { name: "Save review request" }),
  ).toHaveCount(0);
  await operator.reload();
  await operator.getByRole("button", { name: new RegExp(name) }).click();
  await expect(operator.getByLabel(/Legal name/)).toBeEnabled();
  await expect(operator.getByLabel(/Contact email/)).toBeDisabled();
  await operator.getByLabel(/Legal name/).fill(`${name} Ltd`);
  await operator
    .getByRole("button", { name: "Save draft", exact: true })
    .click();
  await expect(
    operator.getByRole("status").filter({ hasText: "Saved revision" }),
  ).toBeVisible();
  const registration = operator.getByRole("listitem", {name:"Business Registration requirement"});
  const untouched = operator.getByRole("listitem", {name:"Premises Layout requirement"});
  await expect(untouched.locator('input[type="file"]')).toBeDisabled();
  await registration.locator('input[type="file"]').setInputFiles({name:"replacement.png",mimeType:"image/png",buffer:png});
  await registration.getByRole("button", {name:"Replace file",exact:true}).click();
  await expect(registration.getByRole("link", {name:"Open saved replacement.png"})).toBeVisible();
  const additional = operator.getByRole("listitem", {name:"Additional Evidence requirement"});
  await additional.locator('input[type="file"]').setInputFiles({name:"consent.png",mimeType:"image/png",buffer:png});
  await additional.getByRole("button", {name:"Upload file",exact:true}).click();
  await expect(additional.getByRole("link", {name:"Open saved consent.png"})).toBeVisible();
  const feedback = operator.getByRole("region", {name:"Officer feedback"});
  for (let index=0;index<3;index++) {
    await feedback.getByLabel("Response to this request").nth(index).fill("Requested correction completed");
    await feedback.getByRole("button", {name:"Save response"}).nth(index).click();
    await expect(feedback.getByText("Operator response: Requested correction completed")).toHaveCount(index+1);
  }
  await declarations(operator);
  await operator.getByRole("button", { name: "Resubmit application" }).click();
  await expect(
    operator.getByRole("heading", { name: "Pre-Site Resubmitted · Version 2" }),
  ).toBeVisible();
  await officer.getByRole("button", { name: "Refresh case history" }).click();
  await officer.getByRole("button", { name: "Start review" }).click();
  await expect(officer.getByText("Legal name · Changed")).toBeVisible();
  for(let index=0;index<3;index++) {
    await officer.getByRole("button", {name:"Confirm resolution"}).first().click();
    await expect(officer.getByText(/Round 1 · RESOLVED/)).toHaveCount(index+1);
  }
  await expect(officer.getByRole("link", {name:"replacement.png"})).toBeVisible();
  await expect(officer.getByRole("link", {name:"consent.png"})).toBeVisible();
  await officer
    .getByLabel("Decision explanation (required)")
    .fill("Complete documentary review");
  await officer.getByRole("button", { name: "Record final decision" }).click();
  await expect(
    officer.getByRole("heading", { name: "Approved · Version 2" }),
  ).toBeVisible();
  await officer.getByLabel("View immutable submission").selectOption("1");
  await expect(officer.getByText(name, { exact: true })).toBeVisible();
  await expect(
    officer.getByRole("link", { name: "Business Registration.png" }),
  ).toBeVisible();
  await operator.getByRole("button", { name: "Refresh case history" }).click();
  await expect(
    operator.getByRole("heading", { name: "Approved · Version 2" }),
  ).toBeVisible();
  await operator.getByRole("button", { name: /^Notifications, .* unread$/ }).click();
  await operator.getByRole("button", { name: "Refresh notifications" }).click();
  await expect(
    operator
      .getByRole("dialog", { name: /^Notifications/ })
      .getByText(/approved/i).first(),
  ).toBeVisible();
  await officer.screenshot({
    path: testInfo.outputPath("approved-history.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
  await operatorContext.close();
  await officerContext.close();
});
