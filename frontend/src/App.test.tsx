import { render, screen } from "@testing-library/react";
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
});

describe("authentication workspace", () => {
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
      await screen.findByRole("button", { name: "Create draft" }),
    );
    await userEvent.type(screen.getByLabelText(/Legal name/), "Cafe One");
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(await screen.findByText(/Saved revision 1/)).toBeVisible();
    expect(api.saveDraft).toHaveBeenCalledWith(
      "d1",
      0,
      { legalName: "Cafe One" },
    );
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
    expect(
      screen.getByText("Required because the premises are rented."),
    ).toBeVisible();
    await userEvent.selectOptions(screen.getByLabelText(/Tenure/), "OWNED");
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(
      screen.getByText("Required because the premises are rented."),
    ).toBeVisible();
    expect(
      screen.queryByText("Required because the premises are owned."),
    ).not.toBeInTheDocument();

    resolveSave?.(
      premisesDraft({
        revision: 2,
        tenure: "OWNED",
        documentRequests: requests("OWNED"),
      }),
    );
    expect(
      await screen.findByText("Required because the premises are owned."),
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
      .mockResolvedValueOnce({ ...remote, revision: 3, legalName: "Local cafe" });
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

    const create = await screen.findByRole("button", { name: "Create draft" });
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
    vi.mocked(api.saveDraft).mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectSave = reject;
        }),
    );
    vi.mocked(api.getDraft).mockResolvedValue({
      ...draft,
      revision: 1,
      legalName: "Changed locally",
    });
    render(<App />);

    await userEvent.click(
      await screen.findByRole("button", { name: /Before/ }),
    );
    const legalName = screen.getByLabelText(/Legal name/);
    await userEvent.clear(legalName);
    await userEvent.type(legalName, "Changed locally");
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(legalName).toBeDisabled();
    expect(screen.getByRole("button", { name: "All drafts" })).toBeDisabled();
    await userEvent.type(legalName, " later edit");
    await userEvent.click(screen.getByRole("button", { name: "All drafts" }));
    expect(legalName).toHaveValue("Changed locally");

    rejectSave?.(new Error("Connection ended before a response"));
    expect(await screen.findByText(/Recovered saved revision 1/i)).toBeVisible();
    expect(api.getDraft).toHaveBeenCalledWith("draft-1");
    expect(legalName).toHaveValue("Changed locally");
    expect(legalName).toBeEnabled();
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

    expect(await screen.findByText("new@example.test")).toBeVisible();
    expect(legalName).toHaveValue("My cafe");
    expect(legalName).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "All drafts" })).toBeDisabled();
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

    await userEvent.click(await screen.findByRole("button", { name: /Original/ }));
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
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
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
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Sign out failed",
    );
    expect(
      screen.getByRole("heading", { name: "Operator workspace" }),
    ).toBeVisible();
  });
});
