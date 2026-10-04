import { expect, test } from "@playwright/test";

test("save retains file selection, review shows saved answers, and Applications returns home", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const upload = { id: "file", requestId: "registration", filename: "proof.png", contentType: "image/png", byteSize: 68, sha256: "hash", createdAt: "2026-10-04T00:00:00Z", ready: true };
  let draft = {
    id: "case", revision: 1, status: "DRAFT", updatedAt: "2026-10-04T00:00:00Z",
    legalName: "Example Cafe", tradingName: "", registrationNumber: "REG123", structure: "COMPANY",
    applicantName: "Owner", applicantRole: "OWNER", applicantEmail: "owner@example.test", applicantPhone: "12345678",
    premisesAddress: "10 Example Street", premisesName: "", unitApplicable: false, unitNumber: "", tenure: "OWNED",
    businessType: "CAFE", proposedOpeningDate: "2026-10-04", preparationActivities: ["COOKING"], serviceModes: ["DINE_IN"],
    operatingHours: Object.fromEntries(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"].map((day) => [day, { closed: true }])),
    completion: { completed: 24, required: 26, percentage: 92, unmetItemIds: ["declaration.accuracy", "declaration.authority"] },
    documentRequests: [{ id: "registration", type: "BUSINESS_REGISTRATION", applicability: "APPLICABLE", reason: "Required for every application.", currentUpload: null as typeof upload | null }],
  };
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();
    let body: unknown;
    if (path === "/api/auth/me") body = { username: "operator", role: "OPERATOR" };
    else if (path === "/api/auth/csrf") body = { token: "test-token", headerName: "X-XSRF-TOKEN" };
    else if (path === "/api/workspaces/operator") body = { heading: "Operator workspace", message: "Create an application or continue one of your saved drafts.", username: "operator" };
    else if (path === "/api/notifications") body = [];
    else if (path === "/api/applications" && method === "GET") body = [draft];
    else if (path === "/api/applications/case" && method === "GET") body = draft;
    else if (path === "/api/applications/case/draft" && method === "PATCH") {
      const patch = route.request().postDataJSON();
      expect(patch.expectedRevision).toBe(draft.revision);
      draft = { ...draft, ...patch.fields, revision: draft.revision + 1 };
      body = draft;
    } else if (path === "/api/applications/case/evidence/requests/registration" && method === "POST") {
      expect(url.searchParams.get("expectedRevision")).toBe("2");
      draft = { ...draft, revision: 3, documentRequests: [{ ...draft.documentRequests[0], currentUpload: upload }] };
      body = { upload, revision: 3, currentDraft: draft };
    } else if (path === "/api/applications/case/evidence/processing") body = [{ uploadId: "file", requestId: "registration", state: "COMPLETE" }];
    else if (path === "/api/cases/case") body = { id: draft.id, revision: draft.revision, status: draft.status, latestVersion: 0, round: 0, working: draft, versions: [], issues: [], events: [] };
    else { await route.abort(); return; }
    await route.fulfill({ json: body });
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Example Cafe Draft Revision 1/ }).click();
  await page.getByLabel("Trading name", { exact: true }).fill("New trading name");
  await page.getByRole("link", { name: "Applications", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(page.getByLabel("Trading name", { exact: true })).toHaveValue("New trading name");
  await page.getByLabel("Upload evidence", { exact: true }).setInputFiles({ name: "proof.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64") });
  await expect(page.getByRole("button", { name: "Submit application", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText(/Saved revision 2/)).toBeVisible();
  expect(await page.getByLabel("Upload evidence", { exact: true }).evaluate((element: HTMLInputElement) => element.files?.[0]?.name)).toBe("proof.png");
  await page.getByRole("button", { name: "Upload file", exact: true }).click();
  await expect(page.getByRole("link", { name: "Open saved proof.png", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText(/Saved revision 4/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Open saved proof.png", exact: true })).toBeVisible();
  await page.getByRole("region", { name: "Evidence requirements" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("saved-evidence.png") });
  await page.getByRole("button", { name: "Submit application", exact: true }).click();
  const review = page.getByRole("region", { name: "Review saved application", exact: true });
  await expect(review).toContainText("New trading name");
  await expect(review.getByRole("link", { name: "proof.png", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit application", exact: true })).toBeDisabled();
  await page.getByRole("checkbox", { name: "I confirm this application is accurate." }).check();
  await page.getByRole("checkbox", { name: "I am authorised to apply for this business." }).check();
  await expect(page.getByRole("button", { name: "Submit application", exact: true })).toBeEnabled();
  const actions = page.getByRole("region", { name: "Application actions", exact: true });
  for (const width of [1280, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await actions.scrollIntoViewIfNeeded();
    const save = await actions.getByRole("button", { name: "Save draft", exact: true }).boundingBox();
    const submit = await actions.getByRole("button", { name: "Submit application", exact: true }).boundingBox();
    expect(save).not.toBeNull();
    expect(submit).not.toBeNull();
    expect(save!.y).toBe(submit!.y);
    expect(save!.x + save!.width).toBeLessThan(submit!.x);
    expect(submit!.x + submit!.width).toBeLessThanOrEqual(width);
    if (width === 1280) await page.screenshot({ path: testInfo.outputPath("submit-actions.png") });
  }
  await page.getByRole("link", { name: "Applications", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your applications", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your applications", exact: true })).toBeFocused();
});
