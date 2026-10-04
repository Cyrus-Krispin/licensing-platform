import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import App from "./App";
import * as api from "./lib/api";

vi.mock("./lib/api", () => ({
  me: vi.fn(),
  login: vi.fn(),
  workspace: vi.fn(),
  logout: vi.fn(),
  listDrafts: vi.fn().mockResolvedValue([]),
  getDraft: vi.fn(),
  createDraft: vi.fn(),
  saveDraft: vi.fn(),
  uploadEvidence: vi.fn(),
  processingStatuses: vi.fn().mockResolvedValue([]),
  retryProcessing: vi.fn(),
  notifications: vi.fn().mockResolvedValue([]),
  listCases: vi.fn().mockResolvedValue([]),
  getCase: vi.fn(),
  caseCommand: vi.fn(),
  readNotification: vi.fn(),
  clearNotifications: vi.fn(),
}));

const workspace = {
  heading: "Operator workspace",
  message: "Welcome",
  username: "operator",
};

const requests = (tenure: "OWNED" | "RENTED") => [
  {
    id: "lease-request",
    type: "LEASE_EVIDENCE",
    applicability:
      tenure === "RENTED"
        ? ("APPLICABLE" as const)
        : ("NOT_APPLICABLE" as const),
    reason:
      tenure === "RENTED"
        ? "Required because the premises are rented."
        : "Not required because the premises are owned.",
  },
  {
    id: "ownership-request",
    type: "OWNERSHIP_EVIDENCE",
    applicability:
      tenure === "OWNED"
        ? ("APPLICABLE" as const)
        : ("NOT_APPLICABLE" as const),
    reason:
      tenure === "OWNED"
        ? "Required because the premises are owned."
        : "Not required because the premises are rented.",
  },
];

function premisesDraft(overrides: Partial<api.Draft> = {}): api.Draft {
  return {
    id: "premises-draft",
    revision: 1,
    status: "DRAFT",
    updatedAt: "2026-10-03T00:00:00Z",
    legalName: "Cafe",
    tradingName: null,
    registrationNumber: null,
    structure: null,
    applicantName: null,
    applicantRole: "OWNER",
    applicantEmail: null,
    applicantPhone: null,
    premisesAddress: "10 Market Street",
    premisesName: null,
    unitApplicable: true,
    unitNumber: "4",
    tenure: "RENTED",
    documentRequests: requests("RENTED"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.me).mockResolvedValue(null);
  vi.mocked(api.workspace).mockResolvedValue(workspace);
  vi.mocked(api.logout).mockResolvedValue();
  vi.mocked(api.listDrafts).mockResolvedValue([]);
  vi.mocked(api.notifications).mockResolvedValue([]);
  vi.mocked(api.listCases).mockResolvedValue([]);
  vi.mocked(api.processingStatuses).mockResolvedValue([]);
});

test("opening submission focuses the workflow above the editor", async () => {
  const draft = premisesDraft();
  vi.mocked(api.me).mockResolvedValue({ username: "operator", role: "OPERATOR" });
  vi.mocked(api.listDrafts).mockResolvedValue([draft]);
  vi.mocked(api.getCase).mockResolvedValue({ id: draft.id, revision: draft.revision, status: "DRAFT", latestVersion: 0, round: 0, working: draft, versions: [], issues: [], events: [] });
  render(<App />);
  await userEvent.click(await screen.findByTitle("Cafe"));
  await userEvent.click(screen.getByRole("button", { name: "Submit application" }));
  await waitFor(() => expect(screen.getByRole("region", { name: "Application actions" })).toHaveFocus());
  expect(screen.getByRole("region", { name: "Review saved application" })).toHaveTextContent("Cafe");
});

test("notification dropdown preserves unsaved application edits", async () => {
  vi.mocked(api.me).mockResolvedValue({ username: "operator", role: "OPERATOR" });
  vi.mocked(api.listDrafts).mockResolvedValue([premisesDraft()]);
  render(<App />);
  await userEvent.click(await screen.findByTitle("Cafe"));
  await userEvent.type(screen.getByLabelText("Trading name"), "Unsaved name");
  await userEvent.click(await screen.findByRole("button", { name: "Notifications, 0 unread" }));
  expect(await screen.findByRole("heading", { name: /Notifications/ })).toBeVisible();
  expect(screen.getByLabelText("Trading name")).toBeVisible();
  await userEvent.keyboard("{Escape}");
  expect(screen.getByLabelText("Trading name")).toHaveValue("Unsaved name");
  expect(screen.getByLabelText("Trading name")).toBeVisible();
  expect(api.saveDraft).not.toHaveBeenCalled();
});

test("notification bell shows unread count and updates after reading", async () => {
  vi.mocked(api.me).mockResolvedValue({ username: "operator", role: "OPERATOR" });
  vi.mocked(api.notifications).mockResolvedValue([{ id: "notice", applicationId: "case", message: "Corrections requested", createdAt: "2026-10-04T00:00:00Z", readAt: null }]);
  render(<App />);
  await userEvent.click(await screen.findByRole("button", { name: "Notifications, 1 unread" }));
  expect(await screen.findByText("Corrections requested")).toBeVisible();
  vi.mocked(api.notifications).mockResolvedValue([]);
  await userEvent.click(screen.getByRole("button", { name: "Mark as read" }));
  expect(await screen.findByRole("button", { name: "Notifications, 0 unread" })).toBeVisible();
});

describe("authentication workspace", () => {
  test("saves closed and open operation hours without null closed-day members", async () => {
    const draft = premisesDraft({
      preparationActivities: [],
      serviceModes: [],
      operatingHours: {},
    });
    vi.mocked(api.me).mockResolvedValue({
      username: "operator",
      role: "OPERATOR",
    });
    vi.mocked(api.listDrafts).mockResolvedValue([draft]);
    vi.mocked(api.saveDraft).mockImplementation(
      async (_id, _revision, fields) =>
        ({ ...draft, ...fields, revision: 2 }) as api.Draft,
    );
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: /Cafe/ }));
    await userEvent.selectOptions(
      screen.getByLabelText("Monday hours"),
      "CLOSED",
    );
    await userEvent.selectOptions(
      screen.getByLabelText("Tuesday hours"),
      "OPEN",
    );
    await userEvent.type(screen.getByLabelText("Opens on Tuesday"), "09:00");
    await userEvent.type(screen.getByLabelText("Closes on Tuesday"), "17:00");
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));

    expect(api.saveDraft).toHaveBeenCalledWith("premises-draft", 1, {
      operatingHours: {
        MONDAY: { closed: true },
        TUESDAY: {
          closed: false,
          opens: "09:00",
          closes: "17:00",
          closesNextDay: false,
        },
      },
    });
  });

  test("upload keeps its comparison base and routes an interposed save through conflict review", async () => {
    const draft = premisesDraft({
      revision: 0,
      legalName: null,
      applicantPhone: null,
      operatingHours: {},
    });
    draft.documentRequests = [
      {
        id: "registration",
        type: "BUSINESS_REGISTRATION",
        applicability: "APPLICABLE",
        reason: "Required",
        currentUpload: null,
      },
    ];
    const uploaded = {
      id: "upload-1",
      requestId: "registration",
      filename: "proof.pdf",
      contentType: "application/pdf",
      byteSize: 10,
      sha256: "abc",
      createdAt: "2026-10-04T00:00:00Z",
      ready: true,
    };
    const currentPng = {
      ...uploaded,
      id: "upload-2",
      filename: "current.png",
      contentType: "image/png",
    };
    const latest = {
      ...draft,
      revision: 2,
      applicantPhone: "+1 555 0100",
      operatingHours: { TUESDAY: { closed: true } },
      completion: {
        completed: 1,
        required: 26,
        percentage: 3,
        unmetItemIds: [],
      },
      documentRequests: [
        { ...draft.documentRequests[0], currentUpload: currentPng },
      ],
    };
    vi.mocked(api.me).mockResolvedValue({
      username: "operator",
      role: "OPERATOR",
    });
    vi.mocked(api.listDrafts).mockResolvedValue([draft]);
    vi.mocked(api.uploadEvidence).mockResolvedValue({
      upload: uploaded,
      revision: 1,
      currentDraft: latest,
    });
    vi.mocked(api.saveDraft).mockResolvedValueOnce({
      ...latest,
      legalName: "Unsaved cafe",
      revision: 3,
    });
    vi.mocked(api.getDraft).mockResolvedValue(latest);
    render(<App />);

    await userEvent.click(
      await screen.findByRole("button", { name: /Cafe|Untitled/ }),
    );
    await userEvent.clear(screen.getByLabelText(/Legal name/));
    await userEvent.type(screen.getByLabelText(/Legal name/), "Unsaved cafe");
    await userEvent.upload(
      screen.getByLabelText("Upload evidence"),
      new File(["%PDF-1.4"], "proof.pdf", { type: "application/pdf" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Upload file" }));
    expect(
      await screen.findByText(
        /Recovered proof.pdf; the current file remains current.png/,
      ),
    ).toBeVisible();
    expect(api.getDraft).not.toHaveBeenCalled();

    expect(
      await screen.findByText(/Upload receipt recovered from revision 1/),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: /Open saved current.png/ }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: /Saved completion: 1 of 26/ }),
    ).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "Keep and review my edits" }),
    );
    expect(screen.getByLabelText(/Legal name/)).toHaveValue("Unsaved cafe");
    expect(screen.getByLabelText(/Phone/)).toHaveValue("+1 555 0100");
    expect(screen.getByLabelText("Tuesday hours")).toHaveValue("CLOSED");
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(api.saveDraft).toHaveBeenLastCalledWith("premises-draft", 2, {
      legalName: "Unsaved cafe",
    });
  });

  test("links operation errors, retains input, and locks controls during a pending save", async () => {
    const draft = premisesDraft({
      preparationActivities: [],
      serviceModes: [],
      operatingHours: {},
    });
    vi.mocked(api.me).mockResolvedValue({
      username: "operator",
      role: "OPERATOR",
    });
    vi.mocked(api.listDrafts).mockResolvedValue([draft]);
    let rejectSave!: (reason: unknown) => void;
    vi.mocked(api.saveDraft).mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectSave = reject;
      }),
    );
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: /Cafe/ }));
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Business type (required to submit)" }),
      "CAFE",
    );
    await userEvent.selectOptions(
      screen.getByLabelText("Monday hours"),
      "OPEN",
    );
    await userEvent.type(screen.getByLabelText("Opens on Monday"), "09:00");
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(screen.getByLabelText("Monday hours")).toBeDisabled();
    rejectSave({
      status: 422,
      message: "Correct the highlighted fields",
      fieldErrors: {
        businessType: "Choose a valid value",
        "operatingHours.MONDAY": "Open days require times",
      },
    });
    expect(await screen.findByText("Open days require times")).toBeVisible();
    expect(screen.getByLabelText("Opens on Monday")).toHaveValue("09:00");
    expect(
      screen.getByRole("combobox", { name: "Business type (required to submit)" }),
    ).toHaveAttribute("aria-describedby", "businessType-error");
  });

  test("keep and review merges a local day with an unseen remote day", async () => {
    const monday = { closed: true };
    const draft = premisesDraft({ operatingHours: { MONDAY: monday } });
    const latest = {
      ...draft,
      revision: 2,
      operatingHours: { MONDAY: monday, TUESDAY: { closed: true } },
    };
    vi.mocked(api.me).mockResolvedValue({
      username: "operator",
      role: "OPERATOR",
    });
    vi.mocked(api.listDrafts).mockResolvedValue([draft]);
    vi.mocked(api.saveDraft)
      .mockRejectedValueOnce({ status: 409, message: "Changed elsewhere" })
      .mockResolvedValueOnce({ ...latest, revision: 3 });
    vi.mocked(api.getDraft).mockResolvedValue(latest);
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: /Cafe/ }));
    await userEvent.selectOptions(
      screen.getByLabelText("Monday hours"),
      "OPEN",
    );
    await userEvent.type(screen.getByLabelText("Opens on Monday"), "18:00");
    await userEvent.type(screen.getByLabelText("Closes on Monday"), "02:00");
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Closes next day for Monday" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Keep and review my edits" }),
    );
    expect(screen.getByLabelText("Tuesday hours")).toHaveValue("CLOSED");
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(api.saveDraft).toHaveBeenLastCalledWith("premises-draft", 2, {
      operatingHours: {
        MONDAY: {
          closed: false,
          opens: "18:00",
          closes: "02:00",
          closesNextDay: true,
        },
        TUESDAY: { closed: true },
      },
    });
  });

  test("keep and review merges set-member additions from both tabs", async () => {
    const draft = premisesDraft({
      preparationActivities: ["BEVERAGE_PREPARATION"],
    });
    const latest = {
      ...draft,
      revision: 2,
      preparationActivities: ["BEVERAGE_PREPARATION", "COOKING"],
    };
    vi.mocked(api.me).mockResolvedValue({
      username: "operator",
      role: "OPERATOR",
    });
    vi.mocked(api.listDrafts).mockResolvedValue([draft]);
    vi.mocked(api.saveDraft)
      .mockRejectedValueOnce({ status: 409, message: "Changed elsewhere" })
      .mockResolvedValueOnce({ ...latest, revision: 3 });
    vi.mocked(api.getDraft).mockResolvedValue(latest);
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: /Cafe/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Baking" }));
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Keep and review my edits" }),
    );
    expect(screen.getByRole("checkbox", { name: "Cooking" })).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(api.saveDraft).toHaveBeenLastCalledWith("premises-draft", 2, {
      preparationActivities: ["BAKING", "BEVERAGE_PREPARATION", "COOKING"],
    });
  });

  test("keep and review merges different leaves of the same open day", async () => {
    const baseMonday = {
      closed: false,
      opens: "09:00",
      closes: "17:00",
      closesNextDay: false,
    };
    const draft = premisesDraft({ operatingHours: { MONDAY: baseMonday } });
    const latest = {
      ...draft,
      revision: 2,
      operatingHours: { MONDAY: { ...baseMonday, closes: "18:00" } },
    };
    vi.mocked(api.me).mockResolvedValue({
      username: "operator",
      role: "OPERATOR",
    });
    vi.mocked(api.listDrafts).mockResolvedValue([draft]);
    vi.mocked(api.saveDraft)
      .mockRejectedValueOnce({ status: 409, message: "Changed elsewhere" })
      .mockResolvedValueOnce({ ...latest, revision: 3 });
    vi.mocked(api.getDraft).mockResolvedValue(latest);
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: /Cafe/ }));
    await userEvent.clear(screen.getByLabelText("Opens on Monday"));
    await userEvent.type(screen.getByLabelText("Opens on Monday"), "10:00");
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Keep and review my edits" }),
    );
    expect(screen.getByLabelText("Opens on Monday")).toHaveValue("10:00");
    expect(screen.getByLabelText("Closes on Monday")).toHaveValue("18:00");
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(api.saveDraft).toHaveBeenLastCalledWith("premises-draft", 2, {
      operatingHours: {
        MONDAY: {
          closed: false,
          opens: "10:00",
          closes: "18:00",
          closesNextDay: false,
        },
      },
    });
  });

  test("keep restores a complete local open day when remote changed it to closed", async () => {
    const baseMonday = {
      closed: false,
      opens: "09:00",
      closes: "17:00",
      closesNextDay: false,
    };
    const draft = premisesDraft({ operatingHours: { MONDAY: baseMonday } });
    const latest = {
      ...draft,
      revision: 8,
      operatingHours: { MONDAY: { closed: true } },
    };
    vi.mocked(api.me).mockResolvedValue({
      username: "operator",
      role: "OPERATOR",
    });
    vi.mocked(api.listDrafts).mockResolvedValue([draft]);
    vi.mocked(api.saveDraft)
      .mockRejectedValueOnce({ status: 409, message: "Changed elsewhere" })
      .mockResolvedValueOnce({ ...latest, revision: 9 });
    vi.mocked(api.getDraft).mockResolvedValue(latest);
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: /Cafe/ }));
    await userEvent.clear(screen.getByLabelText("Opens on Monday"));
    await userEvent.type(screen.getByLabelText("Opens on Monday"), "10:00");
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    const hoursComparison = (
      await screen.findByText("Opening hours", { selector: "dt" })
    ).parentElement!;
    expect(
      within(hoursComparison)
        .getByText(/Your complete local edit:/)
        .closest("dd"),
    ).toHaveTextContent("Monday: 10:00–17:00");
    expect(
      within(hoursComparison)
        .getByText(/After keeping edits:/)
        .closest("dd"),
    ).toHaveTextContent("Monday: 10:00–17:00");
    await userEvent.click(
      screen.getByRole("button", { name: "Keep and review my edits" }),
    );
    expect(screen.getByLabelText("Monday hours")).toHaveValue("OPEN");
    expect(screen.getByLabelText("Opens on Monday")).toHaveValue("10:00");
    expect(screen.getByLabelText("Closes on Monday")).toHaveValue("17:00");
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(api.saveDraft).toHaveBeenLastCalledWith("premises-draft", 8, {
      operatingHours: {
        MONDAY: {
          closed: false,
          opens: "10:00",
          closes: "17:00",
          closesNextDay: false,
        },
      },
    });
  });

  test("keep restores a complete local open day when remote removed the day", async () => {
    const baseMonday = {
      closed: false,
      opens: "09:00",
      closes: "17:00",
      closesNextDay: false,
    };
    const draft = premisesDraft({ operatingHours: { MONDAY: baseMonday } });
    const latest = { ...draft, revision: 2, operatingHours: {} };
    vi.mocked(api.me).mockResolvedValue({
      username: "operator",
      role: "OPERATOR",
    });
    vi.mocked(api.listDrafts).mockResolvedValue([draft]);
    vi.mocked(api.saveDraft)
      .mockRejectedValueOnce({ status: 409, message: "Changed elsewhere" })
      .mockResolvedValueOnce({ ...latest, revision: 3 });
    vi.mocked(api.getDraft).mockResolvedValue(latest);
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: /Cafe/ }));
    await userEvent.clear(screen.getByLabelText("Opens on Monday"));
    await userEvent.type(screen.getByLabelText("Opens on Monday"), "10:00");
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Keep and review my edits" }),
    );
    expect(screen.getByLabelText("Monday hours")).toHaveValue("OPEN");
    expect(screen.getByLabelText("Closes on Monday")).toHaveValue("17:00");
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(api.saveDraft).toHaveBeenLastCalledWith("premises-draft", 2, {
      operatingHours: {
        MONDAY: {
          closed: false,
          opens: "10:00",
          closes: "17:00",
          closesNextDay: false,
        },
      },
    });
  });

  test("reload keeps the remote closed state after an incompatible day conflict", async () => {
    const draft = premisesDraft({
      operatingHours: {
        MONDAY: {
          closed: false,
          opens: "09:00",
          closes: "17:00",
          closesNextDay: false,
        },
      },
    });
    const latest = {
      ...draft,
      revision: 2,
      operatingHours: { MONDAY: { closed: true } },
    };
    vi.mocked(api.me).mockResolvedValue({
      username: "operator",
      role: "OPERATOR",
    });
    vi.mocked(api.listDrafts).mockResolvedValue([draft]);
    vi.mocked(api.saveDraft).mockRejectedValue({
      status: 409,
      message: "Changed elsewhere",
    });
    vi.mocked(api.getDraft).mockResolvedValue(latest);
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: /Cafe/ }));
    await userEvent.clear(screen.getByLabelText("Opens on Monday"));
    await userEvent.type(screen.getByLabelText("Opens on Monday"), "10:00");
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Reload saved values" }),
    );
    expect(screen.getByLabelText("Monday hours")).toHaveValue("CLOSED");
    expect(screen.queryByLabelText("Opens on Monday")).not.toBeInTheDocument();
  });

  test("creates and explicitly saves an incomplete draft", async () => {
    const draft = {
      id: "d1",
      revision: 0,
      status: "DRAFT" as const,
      updatedAt: "2026-10-03T00:00:00Z",
      legalName: null,
      tradingName: null,
      registrationNumber: null,
      structure: null,
      applicantName: null,
      applicantRole: null,
      applicantEmail: null,
      applicantPhone: null,
      operatingHours: {},
    };
    vi.mocked(api.me).mockResolvedValue({
      username: "operator",
      role: "OPERATOR",
    });
    vi.mocked(api.createDraft).mockResolvedValue(draft);
    vi.mocked(api.saveDraft).mockResolvedValue({
      ...draft,
      revision: 1,
      legalName: "Cafe One",
    });
    render(<App />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Create application" }),
    );
    await userEvent.type(screen.getByLabelText(/Legal name/), "Cafe One");
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(await screen.findByText(/Saved revision 1/)).toBeVisible();
    expect(api.saveDraft).toHaveBeenCalledWith("d1", 0, {
      legalName: "Cafe One",
    });
  });

  test("sends a genuine boolean false for unit applicability", async () => {
    const draft = premisesDraft({ unitApplicable: null, unitNumber: null });
    vi.mocked(api.me).mockResolvedValue({
      username: "operator",
      role: "OPERATOR",
    });
    vi.mocked(api.listDrafts).mockResolvedValue([draft]);
    vi.mocked(api.saveDraft).mockResolvedValue({
      ...draft,
      revision: 2,
      unitApplicable: false,
    });
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: /Cafe/ }));
    await userEvent.selectOptions(
      screen.getByLabelText(/Does the premises have a unit number/),
      "false",
    );
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));

    expect(api.saveDraft).toHaveBeenCalledWith("premises-draft", 1, {
      unitApplicable: false,
    });
  });

  test("retains an inconsistent unit after 422 until it is explicitly cleared", async () => {
    const draft = premisesDraft();
    vi.mocked(api.me).mockResolvedValue({
      username: "operator",
      role: "OPERATOR",
    });
    vi.mocked(api.listDrafts).mockResolvedValue([draft]);
    vi.mocked(api.saveDraft)
      .mockRejectedValueOnce({
        status: 422,
        message: "Correct the highlighted fields",
        fieldErrors: {
          unitNumber: "Clear the unit number before choosing no unit",
        },
      })
      .mockResolvedValueOnce({
        ...draft,
        revision: 2,
        unitApplicable: false,
        unitNumber: null,
      });
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: /Cafe/ }));
    const applicability = screen.getByLabelText(
      /Does the premises have a unit number/,
    );
    const unitNumber = screen.getByLabelText(/Unit number/);
    await userEvent.selectOptions(applicability, "false");
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));

    expect(await screen.findByText(/Clear the unit number/)).toBeVisible();
    expect(applicability).toHaveValue("false");
    expect(unitNumber).toHaveValue("4");
    expect(api.saveDraft).toHaveBeenNthCalledWith(1, "premises-draft", 1, {
      unitApplicable: false,
    });

    await userEvent.clear(unitNumber);
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(api.saveDraft).toHaveBeenNthCalledWith(2, "premises-draft", 1, {
      unitApplicable: false,
      unitNumber: null,
    });
  });

  test("changes requirements only after the saved response succeeds", async () => {
    const draft = premisesDraft();
    let resolveSave: ((draft: api.Draft) => void) | undefined;
    vi.mocked(api.me).mockResolvedValue({
      username: "operator",
      role: "OPERATOR",
    });
    vi.mocked(api.listDrafts).mockResolvedValue([draft]);
    vi.mocked(api.saveDraft).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve;
        }),
    );
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: /Cafe/ }));
    const requirements = screen.getByRole("region", {
      name: "Evidence requirements",
    });
    const leaseRequirement = within(requirements).getByRole("listitem", {
      name: "Lease Evidence requirement",
    });
    const ownershipRequirement = within(requirements).getByRole("listitem", {
      name: "Ownership Evidence requirement",
    });
    expect(
      within(leaseRequirement).getByText(
        "Required because the premises are rented.",
      ),
    ).toBeVisible();
    await userEvent.selectOptions(screen.getByLabelText(/Tenure/), "OWNED");
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(
      within(leaseRequirement).getByText(
        "Required because the premises are rented.",
      ),
    ).toBeVisible();
    expect(
      within(ownershipRequirement).queryByText(
        "Required because the premises are owned.",
      ),
    ).not.toBeInTheDocument();

    resolveSave?.(
      premisesDraft({
        revision: 2,
        tenure: "OWNED",
        documentRequests: requests("OWNED"),
      }),
    );
    await screen.findByText(/Saved revision 2/);
    const savedRequirements = screen.getByRole("region", {
      name: "Evidence requirements",
    });
    expect(
      await within(savedRequirements).findByText(
        "Required because the premises are owned.",
      ),
    ).toBeVisible();
  });

  test("keeps unrelated remote premises values during explicit conflict resolution", async () => {
    const draft = premisesDraft();
    const remote = premisesDraft({
      revision: 2,
      tenure: "OWNED",
      unitApplicable: false,
      unitNumber: null,
      documentRequests: requests("OWNED"),
    });
    vi.mocked(api.me).mockResolvedValue({
      username: "operator",
      role: "OPERATOR",
    });
    vi.mocked(api.listDrafts).mockResolvedValue([draft]);
    vi.mocked(api.saveDraft)
      .mockRejectedValueOnce({
        status: 409,
        message: "Changed elsewhere",
        fieldErrors: {},
      })
      .mockResolvedValueOnce({
        ...remote,
        revision: 3,
        legalName: "Local cafe",
      });
    vi.mocked(api.getDraft).mockResolvedValue(remote);
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: /Cafe/ }));
    await userEvent.clear(screen.getByLabelText(/Legal name/));
    await userEvent.type(screen.getByLabelText(/Legal name/), "Local cafe");
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Keep and review my edits" }),
    );

    expect(screen.getByLabelText(/Tenure/)).toHaveValue("OWNED");
    expect(
      screen.getByLabelText(/Does the premises have a unit number/),
    ).toHaveValue("false");
    expect(screen.getByLabelText(/Unit number/)).toHaveValue("");
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(api.saveDraft).toHaveBeenNthCalledWith(2, "premises-draft", 2, {
      legalName: "Local cafe",
    });
  });

  test("retries an uncertain create with the same key without overlap", async () => {
    const draft = {
      id: "recovered",
      revision: 0,
      status: "DRAFT" as const,
      updatedAt: "2026-10-03T00:00:00Z",
      legalName: null,
      tradingName: null,
      registrationNumber: null,
      structure: null,
      applicantName: null,
      applicantRole: null,
      applicantEmail: null,
      applicantPhone: null,
    };
    vi.mocked(api.me).mockResolvedValue({
      username: "operator",
      role: "OPERATOR",
    });
    let rejectFirst: ((reason: Error) => void) | undefined;
    vi.mocked(api.createDraft)
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectFirst = reject;
          }),
      )
      .mockResolvedValueOnce(draft);
    render(<App />);

    const create = await screen.findByRole("button", { name: "Create application" });
    await userEvent.click(create);
    expect(screen.getByRole("button", { name: "Creating…" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Creating…" }));
    expect(api.createDraft).toHaveBeenCalledTimes(1);
    rejectFirst?.(new Error("Connection ended before a response"));

    const retry = await screen.findByRole("button", { name: "Retry create" });
    const firstKey = vi.mocked(api.createDraft).mock.calls[0][0];
    await userEvent.click(retry);
    expect(api.createDraft).toHaveBeenNthCalledWith(2, firstKey);
    expect(await screen.findByText("Application draft")).toBeVisible();
  });

  test("locks draft controls while saving and recovers an unknown result", async () => {
    const draft = {
      id: "draft-1",
      revision: 0,
      status: "DRAFT" as const,
      updatedAt: "2026-10-03T00:00:00Z",
      legalName: "Before",
      tradingName: null,
      registrationNumber: null,
      structure: null,
      applicantName: null,
      applicantRole: null,
      applicantEmail: null,
      applicantPhone: null,
    };
    vi.mocked(api.me).mockResolvedValue({
      username: "operator",
      role: "OPERATOR",
    });
    vi.mocked(api.listDrafts).mockResolvedValue([draft]);
    let rejectSave: ((reason: Error) => void) | undefined;
    const recovered = {
      ...draft,
      revision: 1,
      legalName: "Changed locally",
      operatingHours: {
        MONDAY: {
          closed: true,
          opens: null,
          closes: null,
          closesNextDay: null,
        },
      },
      serviceModes: ["DELIVERY"],
    };
    vi.mocked(api.saveDraft)
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectSave = reject;
          }),
      )
      .mockResolvedValueOnce({
        ...recovered,
        revision: 2,
        proposedOpeningDate: "2027-01-02",
      });
    vi.mocked(api.getDraft).mockResolvedValue(recovered);
    render(<App />);

    await userEvent.click(
      await screen.findByRole("button", { name: /Before/ }),
    );
    const legalName = screen.getByLabelText(/Legal name/);
    await userEvent.clear(legalName);
    await userEvent.type(legalName, "Changed locally");
    await userEvent.selectOptions(
      screen.getByLabelText("Monday hours"),
      "CLOSED",
    );
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(legalName).toBeDisabled();
    expect(screen.getByRole("button", { name: "All applications" })).toBeDisabled();
    await userEvent.type(legalName, " later edit");
    await userEvent.click(screen.getByRole("button", { name: "All applications" }));
    expect(legalName).toHaveValue("Changed locally");

    rejectSave?.(new Error("Connection ended before a response"));
    expect(
      await screen.findByText(/Recovered saved revision 1/i),
    ).toBeVisible();
    expect(api.getDraft).toHaveBeenCalledWith("draft-1");
    expect(legalName).toHaveValue("Changed locally");
    expect(screen.getByLabelText(/Legal name/)).toBeEnabled();
    expect(screen.getByLabelText(/Legal name/)).toHaveValue("Changed locally");
    expect(screen.getByRole("checkbox", { name: "Delivery" })).toBeChecked();
    await userEvent.type(
      screen.getByLabelText(/Proposed opening date/),
      "2027-01-02",
    );
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(api.saveDraft).toHaveBeenLastCalledWith("draft-1", 1, {
      proposedOpeningDate: "2027-01-02",
    });
  });

  test("requires explicit conflict resolution and applies only reviewed local edits", async () => {
    const draft = {
      id: "two-tab-draft",
      revision: 0,
      status: "DRAFT" as const,
      updatedAt: "2026-10-03T00:00:00Z",
      legalName: "Original cafe",
      tradingName: null,
      registrationNumber: null,
      structure: null,
      applicantName: null,
      applicantRole: null,
      applicantEmail: "old@example.test",
      applicantPhone: null,
    };
    const remote = {
      ...draft,
      revision: 1,
      updatedAt: "2026-10-03T00:01:00Z",
      applicantEmail: "new@example.test",
    };
    vi.mocked(api.me).mockResolvedValue({
      username: "operator",
      role: "OPERATOR",
    });
    vi.mocked(api.listDrafts).mockResolvedValue([draft]);
    vi.mocked(api.saveDraft)
      .mockRejectedValueOnce({
        status: 409,
        message: "This draft changed elsewhere.",
        fieldErrors: {},
      })
      .mockResolvedValueOnce({
        ...remote,
        revision: 2,
        legalName: "My cafe",
      });
    vi.mocked(api.getDraft).mockResolvedValue(remote);
    render(<App />);

    await userEvent.click(
      await screen.findByRole("button", { name: /Original cafe/ }),
    );
    const legalName = screen.getByLabelText(/Legal name/);
    await userEvent.clear(legalName);
    await userEvent.type(legalName, "My cafe");
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));

    const conflictComparison = await screen.findByRole("alert");
    expect(
      within(conflictComparison).getByText("Saved draft changed"),
    ).toBeVisible();
    expect(
      within(conflictComparison).getByText("new@example.test"),
    ).toBeVisible();
    expect(legalName).toHaveValue("My cafe");
    expect(legalName).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "All applications" })).toBeDisabled();
    expect(api.saveDraft).toHaveBeenCalledTimes(1);
    expect(api.saveDraft).toHaveBeenNthCalledWith(1, "two-tab-draft", 0, {
      legalName: "My cafe",
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Keep and review my edits" }),
    );
    const reviewedLegalName = screen.getByLabelText(/Legal name/);
    expect(reviewedLegalName).toHaveValue("My cafe");
    expect(reviewedLegalName).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(api.saveDraft).toHaveBeenNthCalledWith(2, "two-tab-draft", 1, {
      legalName: "My cafe",
    });
  });

  test("can discard local conflict values and reload the saved draft", async () => {
    const draft = {
      id: "reload-draft",
      revision: 0,
      status: "DRAFT" as const,
      updatedAt: "2026-10-03T00:00:00Z",
      legalName: "Original",
      tradingName: null,
      registrationNumber: null,
      structure: null,
      applicantName: null,
      applicantRole: null,
      applicantEmail: "old@example.test",
      applicantPhone: null,
    };
    const remote = {
      ...draft,
      revision: 1,
      updatedAt: "2026-10-03T00:01:00Z",
      legalName: "Saved elsewhere",
      applicantEmail: "new@example.test",
    };
    vi.mocked(api.me).mockResolvedValue({
      username: "operator",
      role: "OPERATOR",
    });
    vi.mocked(api.listDrafts).mockResolvedValue([draft]);
    vi.mocked(api.saveDraft).mockRejectedValue({
      status: 409,
      message: "This draft changed elsewhere.",
      fieldErrors: {},
    });
    vi.mocked(api.getDraft).mockResolvedValue(remote);
    render(<App />);

    await userEvent.click(
      await screen.findByRole("button", { name: /Original/ }),
    );
    const legalName = screen.getByLabelText(/Legal name/);
    await userEvent.clear(legalName);
    await userEvent.type(legalName, "Local value");
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Reload saved values" }),
    );
    expect(screen.getByLabelText(/Legal name/)).toHaveValue("Saved elsewhere");
    expect(screen.getByLabelText(/Contact email/)).toHaveValue(
      "new@example.test",
    );
  });

  test("links applicant role validation to the official native select", async () => {
    const draft = {
      id: "draft-role",
      revision: 0,
      status: "DRAFT" as const,
      updatedAt: "2026-10-03T00:00:00Z",
      legalName: null,
      tradingName: null,
      registrationNumber: null,
      structure: null,
      applicantName: null,
      applicantRole: null,
      applicantEmail: null,
      applicantPhone: null,
    };
    vi.mocked(api.me).mockResolvedValue({
      username: "operator",
      role: "OPERATOR",
    });
    vi.mocked(api.listDrafts).mockResolvedValue([draft]);
    vi.mocked(api.saveDraft).mockRejectedValue({
      status: 422,
      message: "Correct the highlighted fields",
      fieldErrors: { applicantRole: "Choose a valid value" },
    });
    vi.mocked(api.getDraft).mockResolvedValue(draft);
    render(<App />);

    await userEvent.click(
      await screen.findByRole("button", { name: /Untitled draft/ }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    const role = screen.getByLabelText(/Role/);
    expect(role).toHaveAttribute("aria-invalid", "true");
    expect(role).toHaveAttribute("aria-describedby", "applicantRole-error");
    expect(screen.getByText("Choose a valid value")).toHaveAttribute(
      "id",
      "applicantRole-error",
    );
  });

  test("truncates a maximum-length draft name without losing its full label", async () => {
    const legalName = "L".repeat(200);
    vi.mocked(api.me).mockResolvedValue({
      username: "operator",
      role: "OPERATOR",
    });
    vi.mocked(api.listDrafts).mockResolvedValue([
      {
        id: "long-name",
        revision: 3,
        status: "DRAFT",
        updatedAt: "2026-10-03T00:00:00Z",
        legalName,
        tradingName: null,
        registrationNumber: null,
        structure: null,
        applicantName: null,
        applicantRole: null,
        applicantEmail: null,
        applicantPhone: null,
      },
    ]);
    render(<App />);

    const label = await screen.findByTitle(legalName);
    expect(label).toHaveTextContent(legalName);
    expect(label).toHaveClass("min-w-0", "truncate");
    expect(label.closest("button")).toHaveClass("overflow-hidden");
  });

  test.each([
    ["operator", "OPERATOR", "Operator workspace"],
    ["officer", "OFFICER", "Officer workspace"],
  ] as const)("signs in and signs out %s", async (username, role, heading) => {
    vi.mocked(api.login).mockResolvedValue({ username, role });
    vi.mocked(api.workspace).mockResolvedValue({
      heading,
      message: "Welcome",
      username,
    });
    render(<App />);

    await screen.findByRole("heading", { name: "Sign in" });
    await userEvent.type(screen.getByLabelText("Username"), username);
    await userEvent.type(screen.getByLabelText("Password"), "password");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("heading", { name: heading })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Profile menu" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Sign out" }));
    expect(
      await screen.findByRole("heading", { name: "Sign in" }),
    ).toBeVisible();
  });

  test("restores an authenticated session and loads its workspace", async () => {
    vi.mocked(api.me).mockResolvedValue({
      username: "officer",
      role: "OFFICER",
    });
    vi.mocked(api.workspace).mockResolvedValue({
      heading: "Officer workspace",
      message: "Review queue",
      username: "officer",
    });
    render(<App />);
    expect(screen.getByRole("status")).toHaveTextContent("Restoring");
    expect(
      await screen.findByRole("heading", { name: "Officer workspace" }),
    ).toBeVisible();
  });

  test("shows workspace failure and recovers on retry", async () => {
    vi.mocked(api.me).mockResolvedValue({
      username: "operator",
      role: "OPERATOR",
    });
    vi.mocked(api.workspace)
      .mockRejectedValueOnce(new Error("Workspace could not be loaded"))
      .mockResolvedValueOnce(workspace);
    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Workspace could not be loaded",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Retry workspace" }),
    );
    expect(await screen.findByText("Welcome")).toBeVisible();
  });

  test("keeps the workspace visible when logout fails", async () => {
    vi.mocked(api.me).mockResolvedValue({
      username: "operator",
      role: "OPERATOR",
    });
    vi.mocked(api.logout).mockRejectedValue(new Error("Sign out failed"));
    render(<App />);
    await screen.findByRole("heading", { name: "Operator workspace" });
    await userEvent.click(screen.getByRole("button", { name: "Profile menu" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Sign out" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Sign out failed",
    );
    expect(
      screen.getByRole("heading", { name: "Operator workspace" }),
    ).toBeVisible();
  });
});

test("simulated status polling preserves edits and unknown retry uses the same key", async () => {
  const user = userEvent.setup();
  const upload: api.EvidenceUpload = {id:"file",requestId:"lease-request",filename:"lease.pdf",contentType:"application/pdf",byteSize:100,sha256:"hash",createdAt:"2026-10-04T00:00:00Z",ready:true};
  const draft = premisesDraft({documentRequests:[{...requests("RENTED")[0],currentUpload:upload}]});
  const processing: api.ProcessingStatus = {uploadId:"file",requestId:"lease-request",state:"ERROR",attempt:1,queuedAt:"2026-10-04T00:00:00Z",checkingAt:null,completedAt:null,updatedAt:"2026-10-04T00:00:00Z"};
  vi.mocked(api.me).mockResolvedValue({username:"operator",role:"OPERATOR"});
  vi.mocked(api.listDrafts).mockResolvedValue([draft]);
  vi.mocked(api.processingStatuses).mockResolvedValue([processing]);
  vi.mocked(api.retryProcessing).mockRejectedValueOnce(new Error("Lost response")).mockResolvedValueOnce({status:{...processing,state:"QUEUED",attempt:2},resultingAttempt:2});
  render(<App/>);
  await user.click(await screen.findByTitle("Cafe"));
  await user.clear(screen.getByLabelText(/Legal name/));
  await user.type(screen.getByLabelText(/Legal name/),"Unsaved Cafe");
  await user.click(await screen.findByRole("button",{name:"Retry simulated check"}));
  await screen.findByText("Lost response");
  await user.click(screen.getByRole("button",{name:"Retry simulated check"}));
  await waitFor(()=>expect(api.retryProcessing).toHaveBeenCalledTimes(2));
  expect(vi.mocked(api.retryProcessing).mock.calls[0]).toEqual(vi.mocked(api.retryProcessing).mock.calls[1]);
  expect(screen.getByLabelText(/Legal name/)).toHaveValue("Unsaved Cafe");
  expect(api.saveDraft).not.toHaveBeenCalled();
});


test("clearing notifications updates the bell without leaving the application", async () => {
  vi.mocked(api.me).mockResolvedValue({ username: "operator", role: "OPERATOR" });
  vi.mocked(api.notifications).mockResolvedValue([{ id: "notice", applicationId: "case", message: "Corrections requested", createdAt: "2026-10-04T00:00:00Z", readAt: null }]);
  vi.mocked(api.clearNotifications).mockResolvedValue();
  render(<App />);
  await userEvent.click(await screen.findByRole("button", { name: "Notifications, 1 unread" }));
  vi.mocked(api.notifications).mockResolvedValue([]);
  await userEvent.click(screen.getByRole("button", { name: "Clear all" }));
  expect(api.clearNotifications).toHaveBeenCalledOnce();
  expect(await screen.findByRole("button", { name: "Notifications, 0 unread" })).toBeVisible();
  expect(screen.queryByText("Corrections requested")).not.toBeInTheDocument();
  expect(screen.queryByRole("tab", { name: "Notifications" })).not.toBeInTheDocument();
});


test("Applications returns to the list and asks before discarding local edits", async () => {
  vi.mocked(api.me).mockResolvedValue({ username: "operator", role: "OPERATOR" });
  vi.mocked(api.listDrafts).mockResolvedValue([premisesDraft()]);
  render(<App />);
  await userEvent.click(await screen.findByTitle("Cafe"));
  await userEvent.type(screen.getByLabelText("Trading name"), "Unsaved name");
  await userEvent.click(screen.getByRole("link", { name: "Applications" }));
  expect(await screen.findByRole("alertdialog")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Keep editing" }));
  expect(screen.getByLabelText("Trading name")).toHaveValue("Unsaved name");
  await userEvent.click(screen.getByRole("link", { name: "Applications" }));
  await userEvent.click(await screen.findByRole("button", { name: "Discard unsaved changes" }));
  expect(await screen.findByRole("heading", { name: "Your applications" })).toBeVisible();
});

test("selected evidence survives saving fields and uploads using the saved revision", async () => {
  const draft = premisesDraft();
  const saved = { ...draft, revision: 2 };
  const upload = { id: "file", requestId: "lease-request", filename: "lease.png", contentType: "image/png", byteSize: 3, sha256: "hash", createdAt: "2026-10-04T00:00:00Z", ready: true };
  const uploaded = { ...saved, revision: 3, documentRequests: [{ ...saved.documentRequests![0], currentUpload: upload }, saved.documentRequests![1]] };
  vi.mocked(api.me).mockResolvedValue({ username: "operator", role: "OPERATOR" });
  vi.mocked(api.listDrafts).mockResolvedValue([draft]);
  vi.mocked(api.saveDraft).mockResolvedValue(saved);
  vi.mocked(api.uploadEvidence).mockResolvedValue({ upload, revision: 3, currentDraft: uploaded });
  render(<App />);
  await userEvent.click(await screen.findByTitle("Cafe"));
  const file = new File(["png"], "lease.png", { type: "image/png" });
  await userEvent.upload(screen.getByLabelText("Upload evidence"), file);
  await userEvent.click(screen.getByRole("link", { name: "Applications" }));
  expect(await screen.findByRole("alertdialog")).toHaveTextContent("files selected but not uploaded");
  await userEvent.click(screen.getByRole("button", { name: "Keep editing" }));
  expect(screen.getByRole("button", { name: "Submit application" })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await screen.findByText(/Saved revision 2/);
  expect(screen.getByText(/lease.png selected. Not uploaded yet/)).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Upload file" }));
  await screen.findByRole("link", { name: "Open saved lease.png" });
  expect(api.uploadEvidence).toHaveBeenCalledWith(draft.id, "lease-request", 2, expect.any(String), file, expect.any(Function));
  vi.mocked(api.saveDraft).mockResolvedValue({ ...uploaded, revision: 4 });
  await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await screen.findByText(/Saved revision 4/);
  expect(screen.getByRole("link", { name: "Open saved lease.png" })).toBeVisible();
});

test("completion distinguishes required draft items from submission declarations", async () => {
  const draft = premisesDraft({ completion: { completed: 13, required: 27, percentage: 48, unmetItemIds: ["unitApplicable", ...["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"].map((day) => `operatingHours.${day}`), "documentRequest.registration", "documentRequest.permission", "documentRequest.ownership", "documentRequest.layout", "declaration.accuracy", "declaration.authority"] } });
  vi.mocked(api.me).mockResolvedValue({ username: "operator", role: "OPERATOR" });
  vi.mocked(api.listDrafts).mockResolvedValue([draft]);
  render(<App />);
  await userEvent.click(await screen.findByTitle("Cafe"));
  const completion = screen.getByRole("region", { name: /Saved completion/ });
  expect(completion).toHaveTextContent("12 required details or files remain.");
  expect(within(completion).getAllByRole("link")).toHaveLength(12);
  expect(completion).toHaveTextContent("two declarations confirmed at submission");
  expect((screen.getByLabelText(/Does the premises have a unit number/) as HTMLSelectElement).labels?.[0]).toHaveTextContent("*");
  expect(screen.getByRole("group", { name: /Opening hours/ })).toHaveTextContent("Choose Open or Closed for every day");
});

test("inapplicable evidence discards the local selection before becoming applicable again", async () => {
  const draft = premisesDraft();
  vi.mocked(api.me).mockResolvedValue({ username: "operator", role: "OPERATOR" });
  vi.mocked(api.listDrafts).mockResolvedValue([draft]);
  vi.mocked(api.saveDraft).mockResolvedValueOnce({ ...draft, tenure: "OWNED", revision: 2, documentRequests: requests("OWNED") }).mockResolvedValueOnce({ ...draft, revision: 3 });
  render(<App />);
  await userEvent.click(await screen.findByTitle("Cafe"));
  await userEvent.upload(screen.getByLabelText("Upload evidence"), new File(["png"], "lease.png", { type: "image/png" }));
  await userEvent.selectOptions(screen.getByLabelText(/Tenure/), "OWNED");
  await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await screen.findByText(/Saved revision 2/);
  await userEvent.selectOptions(screen.getByLabelText(/Tenure/), "RENTED");
  await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await screen.findByText(/Saved revision 3/);
  expect(screen.queryByText(/lease.png selected/)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Upload file" })).toBeDisabled();
});

test("failed submission review still allows saving the draft", async () => {
  const draft = premisesDraft();
  vi.mocked(api.me).mockResolvedValue({ username: "operator", role: "OPERATOR" });
  vi.mocked(api.listDrafts).mockResolvedValue([draft]);
  vi.mocked(api.getCase).mockRejectedValue(new Error("Review unavailable"));
  vi.mocked(api.saveDraft).mockResolvedValue({ ...draft, revision: 2 });
  render(<App />);
  await userEvent.click(await screen.findByTitle("Cafe"));
  await userEvent.click(screen.getByRole("button", { name: "Submit application" }));
  await screen.findByText("Review unavailable");
  await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await screen.findByText(/Saved revision 2/);
  expect(screen.getByRole("button", { name: "Retry application" })).toBeVisible();
});
